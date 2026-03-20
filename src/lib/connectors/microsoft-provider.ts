import type {
  ConnectorProvider,
  ConnectorConfig,
} from "./types";
import type { SyncYield } from "./sync-types";
import type { EntityInput, ExternalRef } from "@/lib/entity-resolution";
import { getValidAccessToken } from "./microsoft-auth";

// ── Types ───────────────────────────────────────────────────

type ThreadEntry = {
  id: string;
  date: Date;
  direction: string;
  senderEmail: string;
};

// ── Token helper (exported for use by other modules) ────────

async function getMicrosoftAccessToken(
  config: ConnectorConfig
): Promise<string> {
  return getValidAccessToken(config);
}

// ── Graph API helper ────────────────────────────────────────

async function graphFetch(
  accessToken: string,
  endpoint: string,
  params?: Record<string, string>
): Promise<Response> {
  const url = new URL(`https://graph.microsoft.com/v1.0${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ── Shared utilities ────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphFetchWithRetry(
  accessToken: string,
  endpoint: string,
  params?: Record<string, string>
): Promise<Response> {
  const resp = await graphFetch(accessToken, endpoint, params);

  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get("Retry-After") || "5", 10);
    await sleep(retryAfter * 1000);
    return graphFetch(accessToken, endpoint, params);
  }

  return resp;
}

// ── Newsletter / automated email detection ──────────────────

function isAutomatedEmail(
  headers: { name: string; value: string }[],
  bodyText: string
): boolean {
  if (headers.some((h) => h.name.toLowerCase() === "list-unsubscribe")) {
    return true;
  }

  if (bodyText.length > 100) {
    const bottomSection = bodyText
      .slice(Math.floor(bodyText.length * 0.8))
      .toLowerCase();
    const patterns = [
      "unsubscribe",
      "opt out",
      "opted in",
      "email preferences",
      "manage your subscription",
      "notification settings",
      "you are receiving this email because",
      "this email was sent to",
    ];
    if (patterns.some((p) => bottomSection.includes(p))) return true;
  }

  return false;
}

// ── HTML stripping ──────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ── Entity creation ─────────────────────────────────────────

async function ensureContactEntity(
  operatorId: string,
  participant: { email: string; name?: string },
  ensureType: (operatorId: string, slug: string) => Promise<void>,
  upsert: (operatorId: string, typeSlug: string, input: EntityInput, externalRef?: ExternalRef) => Promise<string>,
): Promise<string | null> {
  try {
    await ensureType(operatorId, "contact");

    const entityId = await upsert(
      operatorId,
      "contact",
      {
        displayName: participant.name || participant.email,
        sourceSystem: "outlook",
        externalId: participant.email,
        properties: {
          email: participant.email,
        },
      },
      { sourceSystem: "outlook", externalId: participant.email }
    );

    return entityId;
  } catch (err) {
    console.warn(
      `[microsoft-sync] Failed to create contact for ${participant.email}:`,
      err
    );
    return null;
  }
}

// ── Email address parsing from Graph ────────────────────────

type GraphEmailRecipient = {
  emailAddress: { address: string; name?: string };
};

function extractParticipants(
  from: GraphEmailRecipient | undefined,
  toRecipients: GraphEmailRecipient[],
  ccRecipients: GraphEmailRecipient[]
): { email: string; name?: string }[] {
  const seen = new Set<string>();
  const participants: { email: string; name?: string }[] = [];

  const addParticipant = (r: GraphEmailRecipient) => {
    const email = r.emailAddress?.address?.toLowerCase();
    if (!email || seen.has(email)) return;
    seen.add(email);
    participants.push({ email, name: r.emailAddress?.name || undefined });
  };

  if (from) addParticipant(from);
  for (const r of toRecipients) addParticipant(r);
  for (const r of ccRecipients) addParticipant(r);

  return participants;
}

// ── Outlook sync (mirrors syncGmail) ────────────────────────

async function* syncOutlook(
  accessToken: string,
  since: Date | undefined,
  config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const operatorId = config._operatorId as string | undefined;

  const { ensureHardcodedEntityType } = await import("@/lib/event-materializer");
  const { upsertEntity } = await import("@/lib/entity-resolution");

  // 1. Get user email
  let userEmail = (config.email_address as string) || "";
  if (!userEmail) {
    const profileResp = await graphFetchWithRetry(accessToken, "/me");
    if (!profileResp.ok) {
      throw new Error(
        `Microsoft Graph /me: ${profileResp.status} ${profileResp.statusText}`
      );
    }
    const profile = await profileResp.json();
    userEmail = profile.mail || profile.userPrincipalName || "";
  }
  console.log(`[microsoft-sync] Outlook connected as: ${userEmail}`);

  // 2. Determine sync window
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // 3. Fetch messages with pagination
  const threadMessages = new Map<string, ThreadEntry[]>();
  const createdEmails = new Set<string>();
  let messageCount = 0;
  let nextLink: string | undefined;

  // First request
  const initialResp = await graphFetchWithRetry(accessToken, "/me/messages", {
    $filter: `receivedDateTime ge ${syncAfter.toISOString()}`,
    $orderby: "receivedDateTime desc",
    $top: "50",
    $select: "id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,conversationId,isRead,hasAttachments,internetMessageHeaders",
  });

  if (!initialResp.ok) {
    throw new Error(
      `Outlook list messages: ${initialResp.status} ${initialResp.statusText}`
    );
  }

  let pageData = await initialResp.json();

  do {
    const messages = pageData.value || [];

    for (const message of messages) {
      messageCount++;

      const senderEmail = message.from?.emailAddress?.address?.toLowerCase() || "";
      const toRecipients = (message.toRecipients || []) as GraphEmailRecipient[];
      const ccRecipients = (message.ccRecipients || []) as GraphEmailRecipient[];
      const subject = message.subject || "(no subject)";
      const date = new Date(message.receivedDateTime);
      const conversationId = message.conversationId || message.id;

      const direction = senderEmail === userEmail.toLowerCase() ? "sent" : "received";

      // Extract body text
      const bodyHtml = message.body?.content || "";
      const bodyText = message.body?.contentType === "text"
        ? bodyHtml
        : stripHtmlTags(bodyHtml);

      // Newsletter detection via internetMessageHeaders
      const internetHeaders = (message.internetMessageHeaders || []) as { name: string; value: string }[];
      const automated = isAutomatedEmail(internetHeaders, bodyText);

      // Collect participants
      const participants = extractParticipants(message.from, toRecipients, ccRecipients);
      const allEmails = participants.map((p) => p.email).filter(Boolean);

      // Content yield
      if (bodyText && bodyText.trim().length > 50) {
        yield {
          kind: "content" as const,
          data: {
            sourceType: "email",
            sourceId: message.id,
            content: `Subject: ${subject}\n\n${bodyText}`,
            metadata: {
              subject,
              from: senderEmail,
              to: toRecipients.map((r) => r.emailAddress?.address).filter(Boolean),
              cc: ccRecipients.map((r) => r.emailAddress?.address).filter(Boolean),
              threadId: conversationId,
              date: date.toISOString(),
              direction,
              isAutomated: automated,
            },
            participantEmails: allEmails,
          },
        };
      }

      // Activity yield
      yield {
        kind: "activity" as const,
        data: {
          signalType: direction === "sent" ? "email_sent" : "email_received",
          actorEmail: senderEmail,
          targetEmails: [...toRecipients, ...ccRecipients]
            .map((r) => r.emailAddress?.address)
            .filter(Boolean) as string[],
          metadata: {
            subject,
            threadId: conversationId,
            hasAttachments: !!message.hasAttachments,
            isAutomated: automated,
          },
          occurredAt: date,
        },
      };

      // Thread tracking + entity creation
      if (operatorId) {
        if (!threadMessages.has(conversationId)) {
          threadMessages.set(conversationId, []);
        }
        threadMessages.get(conversationId)!.push({
          id: message.id,
          date,
          direction,
          senderEmail,
        });

        if (!automated) {
          for (const participant of participants) {
            if (participant.email.toLowerCase() === userEmail.toLowerCase()) continue;
            if (createdEmails.has(participant.email)) continue;
            createdEmails.add(participant.email);
            await ensureContactEntity(operatorId, participant, ensureHardcodedEntityType, upsertEntity);
          }
        }
      }
    }

    // Follow pagination
    nextLink = pageData["@odata.nextLink"];
    if (nextLink) {
      const nextResp = await fetch(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!nextResp.ok) {
        if (nextResp.status === 429) {
          const retryAfter = parseInt(nextResp.headers.get("Retry-After") || "5", 10);
          await sleep(retryAfter * 1000);
          const retryResp = await fetch(nextLink, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (retryResp.ok) {
            pageData = await retryResp.json();
            continue;
          }
        }
        break;
      }

      pageData = await nextResp.json();
    }
  } while (nextLink);

  // Response time signals from thread analysis
  for (const [conversationId, entries] of threadMessages) {
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    for (let j = 0; j < entries.length - 1; j++) {
      if (
        entries[j].direction === "received" &&
        entries[j + 1].direction === "sent"
      ) {
        const delta = entries[j + 1].date.getTime() - entries[j].date.getTime();

        if (delta > 0 && delta < 30 * 24 * 60 * 60 * 1000) {
          yield {
            kind: "activity" as const,
            data: {
              signalType: "email_response_time",
              actorEmail: userEmail,
              targetEmails: [entries[j].senderEmail],
              metadata: {
                threadId: conversationId,
                responseTimeMs: delta,
                responseTimeHours:
                  Math.round((delta / (1000 * 60 * 60)) * 10) / 10,
              },
              occurredAt: entries[j + 1].date,
            },
          };
        }
      }
    }
  }

  console.log(
    `[microsoft-sync] Outlook done. ${messageCount} messages processed, ${createdEmails.size} contacts created/resolved`
  );
}

// ── OneDrive sync (mirrors syncDrive with local parsing) ────

async function* syncOneDrive(
  accessToken: string,
  since: Date | undefined,
  _config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  let fileCount = 0;
  let processedCount = 0;
  let contentCount = 0;
  let nextLink: string | undefined;

  // Use search with filter for modified files
  const initialResp = await graphFetchWithRetry(accessToken, "/me/drive/root/search(q='')", {
    $select: "id,name,file,size,lastModifiedDateTime,createdDateTime,lastModifiedBy,shared",
    $top: "100",
  });

  if (!initialResp.ok) {
    console.warn(`[microsoft-sync] OneDrive search failed: ${initialResp.status}`);
    return;
  }

  let pageData = await initialResp.json();

  do {
    const files = pageData.value || [];

    for (const file of files) {
      // Skip folders (no file property)
      if (!file.file) continue;

      // Client-side filter by date
      const modifiedDate = new Date(file.lastModifiedDateTime);
      if (modifiedDate < syncAfter) continue;

      fileCount++;

      const mimeType = file.file.mimeType || "";
      const fileName = file.name || "";
      const fileSize = file.size || 0;

      // Skip files > 5MB
      if (fileSize > 5 * 1024 * 1024) continue;

      // Determine if we can extract text
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      const supportedExts = ["docx", "xlsx", "pptx", "txt", "csv", "md", "pdf"];
      if (!supportedExts.includes(ext)) continue;

      processedCount++;

      let extractedText = "";
      try {
        // Download file content
        const dlResp = await graphFetchWithRetry(
          accessToken,
          `/me/drive/items/${file.id}/content`
        );

        if (!dlResp.ok) {
          console.warn(`[microsoft-sync] OneDrive: failed to download ${fileName}: ${dlResp.status}`);
          continue;
        }

        if (ext === "docx") {
          const mammoth = await import("mammoth");
          const buffer = Buffer.from(await dlResp.arrayBuffer());
          const result = await mammoth.extractRawText({ buffer });
          extractedText = result.value;
        } else if (ext === "xlsx") {
          const XLSX = await import("xlsx");
          const buffer = Buffer.from(await dlResp.arrayBuffer());
          const workbook = XLSX.read(buffer);

          const textParts: string[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
            if (jsonData.length < 2) continue;

            const headers = jsonData[0] as string[];
            textParts.push(`Sheet: ${sheetName}`);
            textParts.push(headers.join(" | "));

            const dataRows = jsonData.slice(1, 101);
            for (const row of dataRows) {
              textParts.push(
                headers.map((h, idx) => `${h}: ${(row as string[])[idx] || ""}`).join(" | ")
              );
            }
          }
          extractedText = textParts.join("\n");
        } else if (ext === "pptx") {
          // Extract text from PPTX by regex on XML content within the zip
          const buffer = Buffer.from(await dlResp.arrayBuffer());
          const textContent = buffer.toString("utf-8");
          const textNodes = textContent.match(/<a:t>([^<]*)<\/a:t>/g) || [];
          extractedText = textNodes
            .map((node) => node.replace(/<\/?a:t>/g, ""))
            .join(" ");
        } else if (ext === "pdf") {
          const buffer = Buffer.from(await dlResp.arrayBuffer());
          const { PDFParse } = await import("pdf-parse");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
          await parser.load();
          const result = await parser.getText();
          extractedText = typeof result === "string" ? result : result?.text ?? "";
        } else if (ext === "txt" || ext === "csv" || ext === "md") {
          extractedText = await dlResp.text();
        }
      } catch (err) {
        console.warn(`[microsoft-sync] OneDrive: failed to extract content from ${fileName}:`, err);
      }

      // Yield content if substantial
      if (extractedText && extractedText.trim().length > 50) {
        contentCount++;
        const ownerEmail = file.lastModifiedBy?.user?.email;
        yield {
          kind: "content" as const,
          data: {
            sourceType: "drive_doc",
            sourceId: file.id,
            content: extractedText,
            metadata: {
              fileName,
              mimeType,
              modifiedTime: file.lastModifiedDateTime,
              lastModifyingUser: ownerEmail,
            },
            participantEmails: ownerEmail ? [ownerEmail] : [],
          },
        };
      }

      // Activity: doc_created
      if (file.createdDateTime && new Date(file.createdDateTime) >= syncAfter) {
        yield {
          kind: "activity" as const,
          data: {
            signalType: "doc_created",
            actorEmail: file.lastModifiedBy?.user?.email,
            metadata: { fileName, mimeType, fileId: file.id },
            occurredAt: new Date(file.createdDateTime),
          },
        };
      }

      // Activity: doc_edited
      yield {
        kind: "activity" as const,
        data: {
          signalType: "doc_edited",
          actorEmail: file.lastModifiedBy?.user?.email,
          metadata: { fileName, mimeType, fileId: file.id },
          occurredAt: modifiedDate,
        },
      };

      // Activity: doc_shared
      if (file.shared) {
        yield {
          kind: "activity" as const,
          data: {
            signalType: "doc_shared",
            actorEmail: file.lastModifiedBy?.user?.email,
            metadata: { fileName, fileId: file.id },
            occurredAt: modifiedDate,
          },
        };
      }
    }

    // Follow pagination
    nextLink = pageData["@odata.nextLink"];
    if (nextLink) {
      const nextResp = await fetch(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!nextResp.ok) {
        if (nextResp.status === 429) {
          const retryAfter = parseInt(nextResp.headers.get("Retry-After") || "5", 10);
          await sleep(retryAfter * 1000);
          const retryResp = await fetch(nextLink, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (retryResp.ok) {
            pageData = await retryResp.json();
            continue;
          }
        }
        break;
      }
      pageData = await nextResp.json();
    }
  } while (nextLink);

  console.log(
    `[microsoft-sync] OneDrive: found ${fileCount} files, processed ${processedCount}, ${contentCount} with content`
  );
}

// ── Teams sync (mirrors Slack pattern) ──────────────────────

async function* syncTeams(
  accessToken: string,
  since: Date | undefined,
  config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  // Check if Teams scope was granted
  const scopes = config.scopes as string[] || [];
  if (!scopes.some((s) => s.includes("ChannelMessage"))) {
    console.log("[microsoft-sync] Teams scope not granted, skipping");
    return;
  }

  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // 1. List joined teams
  const teamsResp = await graphFetchWithRetry(accessToken, "/me/joinedTeams");
  if (!teamsResp.ok) {
    console.warn(`[microsoft-sync] Teams: joinedTeams failed: ${teamsResp.status}`);
    return;
  }
  const teamsData = await teamsResp.json();
  const teams = teamsData.value || [];
  let threadCount = 0;

  for (const team of teams) {
    const teamId = team.id;
    const teamName = team.displayName || teamId;

    // 2. List channels
    const channelsResp = await graphFetchWithRetry(
      accessToken,
      `/teams/${teamId}/channels`
    );
    if (!channelsResp.ok) {
      console.warn(`[microsoft-sync] Teams: channels failed for ${teamName}: ${channelsResp.status}`);
      continue;
    }
    const channelsData = await channelsResp.json();
    const channels = channelsData.value || [];

    for (const channel of channels) {
      const channelId = channel.id;
      const channelName = channel.displayName || channelId;

      // 3. List messages
      let nextLink: string | undefined;
      const messagesResp = await graphFetchWithRetry(
        accessToken,
        `/teams/${teamId}/channels/${channelId}/messages`,
        { $top: "50" }
      );

      if (!messagesResp.ok) {
        console.warn(`[microsoft-sync] Teams: messages failed for ${teamName}/${channelName}: ${messagesResp.status}`);
        continue;
      }

      let pageData = await messagesResp.json();

      do {
        const messages = pageData.value || [];

        for (const message of messages) {
          // Skip deleted messages
          if (message.deletedDateTime) continue;

          // Skip messages before sync window
          const messageDate = new Date(message.createdDateTime);
          if (messageDate < syncAfter) continue;

          const senderEmail = message.from?.user?.email?.toLowerCase() ||
            message.from?.user?.displayName || "";
          const senderName = message.from?.user?.displayName || senderEmail || "unknown";
          const bodyHtml = message.body?.content || "";
          const bodyText = message.body?.contentType === "text"
            ? bodyHtml
            : stripHtmlTags(bodyHtml);

          if (!bodyText || bodyText.trim().length === 0) continue;

          // Check for replies
          let threadLines = [`[${teamName}/${channelName}] ${senderName}: ${bodyText}`];
          const participantEmails: string[] = senderEmail ? [senderEmail] : [];
          let messageCount = 1;

          // Fetch replies
          const repliesResp = await graphFetchWithRetry(
            accessToken,
            `/teams/${teamId}/channels/${channelId}/messages/${message.id}/replies`
          );

          if (repliesResp.ok) {
            const repliesData = await repliesResp.json();
            const replies = repliesData.value || [];

            for (const reply of replies) {
              if (reply.deletedDateTime) continue;
              const replyEmail = reply.from?.user?.email?.toLowerCase() || "";
              const replyName = reply.from?.user?.displayName || replyEmail || "unknown";
              const replyBody = reply.body?.contentType === "text"
                ? reply.body?.content || ""
                : stripHtmlTags(reply.body?.content || "");

              if (replyBody.trim().length > 0) {
                threadLines.push(`> ${replyName}: ${replyBody}`);
                messageCount++;
                if (replyEmail && !participantEmails.includes(replyEmail)) {
                  participantEmails.push(replyEmail);
                }
              }
            }
          }

          const isThread = messageCount > 1;
          if (isThread) threadCount++;

          // Content yield
          yield {
            kind: "content" as const,
            data: {
              sourceType: "teams_message",
              sourceId: message.id,
              content: threadLines.join("\n"),
              metadata: {
                teamId,
                teamName,
                channel: channelId,
                channelName,
                messageId: message.id,
                timestamp: message.createdDateTime,
                authorEmail: senderEmail,
                isThread,
                messageCount,
              },
              participantEmails,
            },
          };

          // Activity yield
          yield {
            kind: "activity" as const,
            data: {
              signalType: "teams_message",
              actorEmail: senderEmail || undefined,
              targetEmails: [],
              metadata: {
                teamId,
                teamName,
                channel: channelId,
                channelName,
                isThread,
                messageCount,
              },
              occurredAt: messageDate,
            },
          };
        }

        // Follow pagination
        nextLink = pageData["@odata.nextLink"];
        if (nextLink) {
          const nextResp = await fetch(nextLink, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!nextResp.ok) {
            if (nextResp.status === 429) {
              const retryAfter = parseInt(nextResp.headers.get("Retry-After") || "5", 10);
              await sleep(retryAfter * 1000);
              const retryResp = await fetch(nextLink, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (retryResp.ok) {
                pageData = await retryResp.json();
                continue;
              }
            }
            break;
          }
          pageData = await nextResp.json();
        }
      } while (nextLink);
    }
  }

  console.log(
    `[microsoft-sync] Teams: ${teams.length} teams, ${threadCount} threads`
  );
}

// ── Calendar sync (mirrors syncCalendar) ────────────────────

async function* syncMicrosoftCalendar(
  accessToken: string,
  since: Date | undefined,
  _config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  let eventCount = 0;
  const meetingPairs = new Map<string, number>();
  let nextLink: string | undefined;

  const initialResp = await graphFetchWithRetry(
    accessToken,
    "/me/calendar/events",
    {
      $filter: `start/dateTime ge '${syncAfter.toISOString()}'`,
      $orderby: "start/dateTime",
      $top: "250",
      $select: "id,subject,body,start,end,attendees,organizer,isCancelled,isRecurring,webLink",
    }
  );

  if (!initialResp.ok) {
    console.warn(`[microsoft-sync] Calendar: events failed: ${initialResp.status}`);
    return;
  }

  let pageData = await initialResp.json();

  do {
    const events = pageData.value || [];

    for (const event of events) {
      if (event.isCancelled) continue;

      eventCount++;

      const startTime = event.start?.dateTime;
      const endTime = event.end?.dateTime;

      if (!startTime || isNaN(new Date(startTime).getTime())) continue;

      const attendeeEmails = (event.attendees || [])
        .filter((a: { status?: { response?: string } }) =>
          a.status?.response !== "declined"
        )
        .map((a: { emailAddress?: { address?: string } }) => a.emailAddress?.address)
        .filter(Boolean) as string[];
      const organizerEmail = event.organizer?.emailAddress?.address as string | undefined;

      const durationMs =
        startTime && endTime
          ? new Date(endTime).getTime() - new Date(startTime).getTime()
          : null;

      // Activity: meeting_held
      yield {
        kind: "activity" as const,
        data: {
          signalType: "meeting_held",
          actorEmail: organizerEmail,
          targetEmails: attendeeEmails.filter((e: string) => e !== organizerEmail),
          metadata: {
            summary: event.subject || "(no title)",
            eventId: event.id,
            durationMs,
            durationMinutes: durationMs ? Math.round(durationMs / 60000) : null,
            attendeeCount: attendeeEmails.length,
            isRecurring: !!event.isRecurring,
            htmlLink: event.webLink,
          },
          occurredAt: new Date(startTime),
        },
      };

      // Content: event description
      if (event.body?.content && event.body.content.trim().length > 50) {
        const descText = event.body.contentType === "text"
          ? event.body.content
          : stripHtmlTags(event.body.content);

        if (descText.trim().length > 50) {
          yield {
            kind: "content" as const,
            data: {
              sourceType: "calendar_note",
              sourceId: event.id,
              content: `Meeting: ${event.subject || "(no title)"}\nDate: ${startTime}\nAttendees: ${attendeeEmails.join(", ")}\n\n${descText}`,
              metadata: {
                summary: event.subject,
                startTime,
                attendees: attendeeEmails,
                organizer: organizerEmail,
              },
              participantEmails: attendeeEmails,
            },
          };
        }
      }

      // Track meeting pairs for frequency analysis
      const allParticipants = organizerEmail
        ? [organizerEmail, ...attendeeEmails.filter((e: string) => e !== organizerEmail)]
        : attendeeEmails;

      for (let i = 0; i < allParticipants.length; i++) {
        for (let j = i + 1; j < allParticipants.length; j++) {
          const pair = [allParticipants[i], allParticipants[j]].sort();
          const key = `${pair[0]}|${pair[1]}`;
          meetingPairs.set(key, (meetingPairs.get(key) || 0) + 1);
        }
      }
    }

    // Follow pagination
    nextLink = pageData["@odata.nextLink"];
    if (nextLink) {
      const nextResp = await fetch(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!nextResp.ok) {
        if (nextResp.status === 429) {
          const retryAfter = parseInt(nextResp.headers.get("Retry-After") || "5", 10);
          await sleep(retryAfter * 1000);
          const retryResp = await fetch(nextLink, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (retryResp.ok) {
            pageData = await retryResp.json();
            continue;
          }
        }
        break;
      }
      pageData = await nextResp.json();
    }
  } while (nextLink);

  // Yield meeting frequency signals
  for (const [pairKey, count] of meetingPairs) {
    if (count <= 1) continue;
    const [email1, email2] = pairKey.split("|");
    yield {
      kind: "activity" as const,
      data: {
        signalType: "meeting_frequency",
        actorEmail: email1,
        targetEmails: [email2],
        metadata: {
          meetingCount: count,
          periodDays: Math.round(
            (Date.now() - syncAfter.getTime()) / (1000 * 60 * 60 * 24)
          ),
        },
        occurredAt: new Date(),
      },
    };
  }

  console.log(
    `[microsoft-sync] Calendar: ${eventCount} events, ${meetingPairs.size} attendee pairs`
  );
}

// ── Write-back helpers ──────────────────────────────────────

async function sendOutlookEmail(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const to = input.to as string;
  const subject = input.subject as string;
  const body = input.body as string;
  const cc = input.cc as string | undefined;

  const toRecipients = to.split(",").map((addr) => ({
    emailAddress: { address: addr.trim() },
  }));

  const ccRecipients = cc
    ? cc.split(",").map((addr) => ({
        emailAddress: { address: addr.trim() },
      }))
    : [];

  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: body },
        toRecipients,
        ccRecipients: ccRecipients.length > 0 ? ccRecipients : undefined,
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Outlook send failed: ${resp.status} ${errText}` };
  }

  // sendMail returns 202 with no body on success
  return { success: true, result: { sent: true } };
}

async function replyToOutlookThread(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const messageId = input.messageId as string;
  const body = input.body as string;

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/reply`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: body,
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Outlook reply failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { replied: true } };
}

// ── Document write-back helpers ──────────────────────────────

async function createMicrosoftSpreadsheet(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const title = input.title as string;
  const sheetName = (input.sheetName as string) || "Sheet1";
  const initialData = input.initialData as string[][] | undefined;

  // Build workbook using xlsx
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const wsData = initialData && initialData.length > 0 ? initialData : [[""]];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  // Upload to OneDrive
  const fileName = title.endsWith(".xlsx") ? title : `${title}.xlsx`;
  const uploadResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: new Uint8Array(buffer),
    }
  );

  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    return { success: false, error: `Create spreadsheet failed: ${uploadResp.status} ${errText}` };
  }

  const file = await uploadResp.json();
  return { success: true, result: { fileId: file.id, webUrl: file.webUrl } };
}

async function updateMicrosoftSpreadsheetCells(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  const range = input.range as string;
  const values = input.values as string[][];
  const sheetName = (input.sheetName as string) || "Sheet1";

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='${encodeURIComponent(range)}')`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Update cells failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return {
    success: true,
    result: {
      address: data.address,
      rowCount: data.rowCount,
      columnCount: data.columnCount,
    },
  };
}

async function createMicrosoftDocument(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const title = input.title as string;
  const content = input.content as string | undefined;

  const { Document, Paragraph, TextRun, Packer } = await import("docx");

  const children = [];
  if (content) {
    // Split content by newlines into paragraphs
    const lines = content.split("\n");
    for (const line of lines) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }

  const doc = new Document({
    sections: [{ children: children.length > 0 ? children : [new Paragraph({ children: [new TextRun("")] })] }],
  });

  const buffer = await Packer.toBuffer(doc);

  const fileName = title.endsWith(".docx") ? title : `${title}.docx`;
  const uploadResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      body: new Uint8Array(buffer),
    }
  );

  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    return { success: false, error: `Create document failed: ${uploadResp.status} ${errText}` };
  }

  const file = await uploadResp.json();
  return { success: true, result: { fileId: file.id, webUrl: file.webUrl } };
}

async function appendToMicrosoftDocument(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  const content = input.content as string;

  // 1. Download existing .docx
  const dlResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!dlResp.ok) {
    const errText = await dlResp.text();
    return { success: false, error: `Download document failed: ${dlResp.status} ${errText}` };
  }

  // 2. Extract existing text with mammoth
  const mammoth = await import("mammoth");
  const existingBuffer = Buffer.from(await dlResp.arrayBuffer());
  const existing = await mammoth.extractRawText({ buffer: existingBuffer });
  const existingText = existing.value;

  // 3. Generate new .docx with existing + appended content
  const { Document, Paragraph, TextRun, Packer } = await import("docx");

  const combinedText = existingText + "\n" + content;
  const lines = combinedText.split("\n");
  const children = lines.map(
    (line) => new Paragraph({ children: [new TextRun(line)] })
  );

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);

  // 4. Re-upload
  const uploadResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      body: new Uint8Array(buffer),
    }
  );

  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    return { success: false, error: `Upload updated document failed: ${uploadResp.status} ${errText}` };
  }

  return { success: true, result: { fileId } };
}

// ── Provider ────────────────────────────────────────────────

export const microsoftProvider: ConnectorProvider = {
  id: "microsoft",
  name: "Microsoft 365",

  configSchema: [
    { key: "oauth", label: "Microsoft Account", type: "oauth", required: true },
  ],

  async testConnection(config) {
    try {
      const token = await getMicrosoftAccessToken(config);
      const resp = await graphFetch(token, "/me");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Microsoft Graph ${resp.status}: ${resp.statusText}`,
        };
      }
      await resp.json();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?): AsyncGenerator<SyncYield> {
    const accessToken = await getMicrosoftAccessToken(config);
    const scopes = config.scopes as string[] || [];

    if (scopes.some((s) => s.includes("Mail"))) {
      yield* syncOutlook(accessToken, since, config);
    }

    if (scopes.some((s) => s.includes("Files"))) {
      yield* syncOneDrive(accessToken, since, config);
    }

    if (scopes.some((s) => s.includes("ChannelMessage"))) {
      yield* syncTeams(accessToken, since, config);
    }

    if (scopes.some((s) => s.includes("Calendars"))) {
      yield* syncMicrosoftCalendar(accessToken, since, config);
    }
  },

  async executeAction(config, actionId, params) {
    const accessToken = await getMicrosoftAccessToken(config);

    switch (actionId) {
      case "send_email":
        return await sendOutlookEmail(accessToken, params);
      case "reply_to_thread":
        return await replyToOutlookThread(accessToken, params);
      case "create_spreadsheet":
        return await createMicrosoftSpreadsheet(accessToken, params);
      case "update_spreadsheet_cells":
        return await updateMicrosoftSpreadsheetCells(accessToken, params);
      case "create_document":
        return await createMicrosoftDocument(accessToken, params);
      case "append_to_document":
        return await appendToMicrosoftDocument(accessToken, params);
      case "create_calendar_event":
        return await createMicrosoftCalendarEvent(accessToken, params);
      case "update_calendar_event":
        return await updateMicrosoftCalendarEvent(accessToken, params);
      default:
        return { success: false, error: `Unknown action: ${actionId}` };
    }
  },

  writeCapabilities: [
    {
      slug: "create_calendar_event",
      name: "Create Calendar Event",
      description: "Creates a Microsoft 365 calendar event with attendees",
      inputSchema: { type: "object", properties: { summary: { type: "string" }, description: { type: "string" }, startDateTime: { type: "string" }, endDateTime: { type: "string" }, attendeeEmails: { type: "array", items: { type: "string" } }, location: { type: "string" } }, required: ["summary", "startDateTime", "endDateTime", "attendeeEmails"] },
    },
    {
      slug: "update_calendar_event",
      name: "Update Calendar Event",
      description: "Updates an existing Microsoft 365 calendar event",
      inputSchema: { type: "object", properties: { eventId: { type: "string" }, fields: { type: "object" } }, required: ["eventId", "fields"] },
    },
  ],

  async getCapabilities(config) {
    const scopes = config.scopes as string[] || [];
    const caps: { name: string; description: string; inputSchema: Record<string, unknown>; sideEffects: string[] }[] = [];

    if (scopes.some((s) => s.includes("Mail.Send"))) {
      caps.push({
        name: "send_email",
        description: "Send an email via Outlook on behalf of the user",
        inputSchema: {
          to: { type: "string", required: true, description: "Recipient email address(es), comma-separated" },
          subject: { type: "string", required: true, description: "Email subject line" },
          body: { type: "string", required: true, description: "Email body text (plain text)" },
          cc: { type: "string", required: false, description: "CC recipients, comma-separated" },
        },
        sideEffects: ["Sends an email from the user's Outlook account"],
      });
      caps.push({
        name: "reply_to_thread",
        description: "Reply to an existing email via Outlook",
        inputSchema: {
          messageId: { type: "string", required: true, description: "Outlook message ID to reply to" },
          body: { type: "string", required: true, description: "Reply body text (plain text)" },
        },
        sideEffects: ["Sends a reply email from the user's Outlook account"],
      });
    }

    // Document capabilities (Files.ReadWrite scope)
    if (scopes.some((s) => s.includes("Files.ReadWrite"))) {
      caps.push({
        name: "create_spreadsheet",
        description: "Create a new Excel spreadsheet on OneDrive, optionally with initial data",
        inputSchema: {
          title: { type: "string", required: true, description: "Spreadsheet title" },
          sheetName: { type: "string", required: false, description: "First sheet name (default: Sheet1)" },
          initialData: { type: "array", required: false, description: "2D array of initial cell values" },
        },
        sideEffects: ["Creates a new .xlsx file on the user's OneDrive"],
      });
      caps.push({
        name: "update_spreadsheet_cells",
        description: "Update cells in an existing Excel spreadsheet on OneDrive",
        inputSchema: {
          fileId: { type: "string", required: true, description: "OneDrive file ID" },
          range: { type: "string", required: true, description: "A1 notation range, e.g. 'A1:C10'" },
          values: { type: "array", required: true, description: "2D array of cell values" },
          sheetName: { type: "string", required: false, description: "Worksheet name (default: Sheet1)" },
        },
        sideEffects: ["Modifies cells in an existing Excel spreadsheet"],
      });
      caps.push({
        name: "create_document",
        description: "Create a new Word document on OneDrive with optional initial content",
        inputSchema: {
          title: { type: "string", required: true, description: "Document title" },
          content: { type: "string", required: false, description: "Initial text content" },
        },
        sideEffects: ["Creates a new .docx file on the user's OneDrive"],
      });
      caps.push({
        name: "append_to_document",
        description: "Append text content to an existing Word document on OneDrive",
        inputSchema: {
          fileId: { type: "string", required: true, description: "OneDrive file ID" },
          content: { type: "string", required: true, description: "Text to append to the document" },
        },
        sideEffects: ["Appends content to an existing Word document"],
      });
    }

    return caps;
  },

  async inferSchema() {
    return [];
  },
};

// ── Microsoft Calendar write-back ───────────────────────────

async function createMicrosoftCalendarEvent(
  accessToken: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const body = {
    subject: params.summary,
    body: params.description ? { contentType: "text", content: params.description } : undefined,
    start: { dateTime: params.startDateTime, timeZone: "UTC" },
    end: { dateTime: params.endDateTime, timeZone: "UTC" },
    attendees: ((params.attendeeEmails || []) as string[]).map(email => ({
      emailAddress: { address: email },
      type: "required",
    })),
    location: params.location ? { displayName: params.location } : undefined,
  };

  const resp = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { success: false, error: `Create calendar event failed (${resp.status}): ${err}` };
  }
  const data = await resp.json();
  return { success: true, result: { eventId: data.id, platform: "microsoft", attendees: params.attendeeEmails } };
}

async function updateMicrosoftCalendarEvent(
  accessToken: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const fields = (params.fields || {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  if (fields.summary) body.subject = fields.summary;
  if (fields.description) body.body = { contentType: "text", content: fields.description };
  if (fields.startDateTime) body.start = { dateTime: fields.startDateTime, timeZone: "UTC" };
  if (fields.endDateTime) body.end = { dateTime: fields.endDateTime, timeZone: "UTC" };
  if (fields.attendeeEmails) body.attendees = (fields.attendeeEmails as string[]).map(email => ({
    emailAddress: { address: email },
    type: "required",
  }));
  if (fields.location) body.location = { displayName: fields.location };

  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/events/${params.eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { success: false, error: `Update calendar event failed (${resp.status}): ${err}` };
  }
  const data = await resp.json();
  return { success: true, result: { eventId: data.id, platform: "microsoft" } };
}
