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

// ── User endpoint prefix (delegation vs OAuth) ─────────────

export function getUserEndpointPrefix(config: ConnectorConfig): string {
  if (config.delegation_type === "app-permissions" && config.target_user_email) {
    return `/users/${encodeURIComponent(config.target_user_email as string)}`;
  }
  return "/me";
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

  const { ensureHardcodedEntityType } = await import("@/lib/entity-type-bootstrap");
  const { upsertEntity } = await import("@/lib/entity-resolution");

  const prefix = getUserEndpointPrefix(config);

  // 1. Get user email
  let userEmail = (config.email_address as string) || (config.target_user_email as string) || "";
  if (!userEmail) {
    const profileResp = await graphFetchWithRetry(accessToken, `${prefix}`);
    if (!profileResp.ok) {
      throw new Error(
        `Microsoft Graph ${prefix}: ${profileResp.status} ${profileResp.statusText}`
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
  const initialResp = await graphFetchWithRetry(accessToken, `${prefix}/messages`, {
    $filter: `receivedDateTime ge ${syncAfter.toISOString()}`,
    $orderby: "receivedDateTime desc",
    $top: "50",
    $select: "id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,conversationId,isRead,hasAttachments,internetMessageHeaders,internetMessageId",
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
              messageId: (message as any).internetMessageId || undefined,
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
  config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const prefix = getUserEndpointPrefix(config);
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  let fileCount = 0;
  let processedCount = 0;
  let contentCount = 0;
  let nextLink: string | undefined;

  // Use search with filter for modified files
  const initialResp = await graphFetchWithRetry(accessToken, `${prefix}/drive/root/search(q='')`, {
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
          `${prefix}/drive/items/${file.id}/content`
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
  const prefix = getUserEndpointPrefix(config);

  // Check if Teams scope was granted
  const scopes = config.scopes as string[] || [];
  if (!scopes.some((s) => s.includes("ChannelMessage"))) {
    console.log("[microsoft-sync] Teams scope not granted, skipping");
    return;
  }

  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // 1. List joined teams
  const teamsResp = await graphFetchWithRetry(accessToken, `${prefix}/joinedTeams`);
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
  config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const prefix = getUserEndpointPrefix(config);
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  let eventCount = 0;
  const meetingPairs = new Map<string, number>();
  let nextLink: string | undefined;

  const initialResp = await graphFetchWithRetry(
    accessToken,
    `${prefix}/calendar/events`,
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
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const to = input.to as string;
  const subject = input.subject as string;
  let body = input.body as string;
  const cc = input.cc as string | undefined;
  const isAiGenerated = input.isAiGenerated as boolean | undefined;
  const operatorName = input._operatorName as string | undefined;

  // EU AI Act Article 50: disclose AI-generated content
  if (isAiGenerated) {
    const org = operatorName || "the organization";
    body += `\n\n---\nThis message was drafted with AI assistance by ${org}'s operational AI (Qorpera).`;
  }

  const toRecipients = to.split(",").map((addr) => ({
    emailAddress: { address: addr.trim() },
  }));

  const ccRecipients = cc
    ? cc.split(",").map((addr) => ({
        emailAddress: { address: addr.trim() },
      }))
    : [];

  const resp = await fetch(`${baseUrl}/sendMail`, {
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
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const messageId = input.messageId as string;
  const body = input.body as string;

  const resp = await fetch(
    `${baseUrl}/messages/${encodeURIComponent(messageId)}/reply`,
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
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
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
    `${baseUrl}/drive/root:/${encodeURIComponent(fileName)}:/content`,
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
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  const range = input.range as string;
  const values = input.values as string[][];
  const sheetName = (input.sheetName as string) || "Sheet1";

  const resp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(fileId)}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='${encodeURIComponent(range)}')`,
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
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
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
    `${baseUrl}/drive/root:/${encodeURIComponent(fileName)}:/content`,
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
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  const content = input.content as string;

  // 1. Download existing .docx
  const dlResp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(fileId)}/content`,
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
    `${baseUrl}/drive/items/${encodeURIComponent(fileId)}/content`,
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

// ── OneDrive write-back helpers ──────────────────────────────

async function uploadFileOneDrive(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const name = input.name as string;
  if (!name) return { success: false, error: "name is required" };
  const content = input.content as string;
  if (!content) return { success: false, error: "content is required (base64)" };
  const folderId = input.folderId as string | undefined;

  const fileBuffer = Buffer.from(content, "base64");
  if (fileBuffer.length > 10 * 1024 * 1024) {
    return { success: false, error: "File size exceeds 10MB limit" };
  }

  const parentPath = folderId
    ? `/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(name)}:/content`
    : `/drive/root:/${encodeURIComponent(name)}:/content`;

  const resp = await fetch(
    `${baseUrl}${parentPath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: fileBuffer,
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Upload file failed: ${resp.status} ${errText}` };
  }

  const file = await resp.json();
  return { success: true, result: { fileId: file.id, webUrl: file.webUrl, name: file.name } };
}

async function createFolderOneDrive(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const name = input.name as string;
  if (!name) return { success: false, error: "name is required" };
  const parentFolderId = input.parentFolderId as string | undefined;

  const parentPath = parentFolderId
    ? `/drive/items/${encodeURIComponent(parentFolderId)}/children`
    : "/drive/root/children";

  const resp = await fetch(
    `${baseUrl}${parentPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Create folder failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { folderId: data.id, name: data.name, webUrl: data.webUrl } };
}

async function shareFileOneDrive(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  if (!fileId) return { success: false, error: "fileId is required" };
  const email = input.email as string;
  if (!email) return { success: false, error: "email is required" };
  const role = input.role as string;
  if (!role || !["read", "write"].includes(role)) {
    return { success: false, error: "role must be 'read' or 'write'" };
  }

  const resp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(fileId)}/invite`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: [{ email }],
        roles: [role],
        requireSignIn: true,
        sendInvitation: true,
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Share file failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { fileId, email, role, permissionId: data.value?.[0]?.id } };
}

async function moveFileOneDrive(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  if (!fileId) return { success: false, error: "fileId is required" };
  const targetFolderId = input.targetFolderId as string;
  if (!targetFolderId) return { success: false, error: "targetFolderId is required" };

  const resp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(fileId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parentReference: { id: targetFolderId },
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Move file failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { fileId, targetFolderId } };
}

async function copyFileOneDrive(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  if (!fileId) return { success: false, error: "fileId is required" };
  const newName = input.newName as string;
  if (!newName) return { success: false, error: "newName is required" };
  const folderId = input.folderId as string | undefined;

  const body: Record<string, unknown> = { name: newName };
  if (folderId) body.parentReference = { id: folderId };

  const resp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(fileId)}/copy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  // copy returns 202 Accepted with Location header for async operation
  if (!resp.ok && resp.status !== 202) {
    const errText = await resp.text();
    return { success: false, error: `Copy file failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { fileId, newName, copyInProgress: true } };
}

// ── Outlook extended write-back helpers ─────────────────────

async function replyOutlookEmail(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const messageId = input.messageId as string;
  if (!messageId) return { success: false, error: "messageId is required" };
  let body = input.body as string;
  if (!body) return { success: false, error: "body is required" };
  const replyAll = input.replyAll as boolean | undefined;
  const isAiGenerated = input.isAiGenerated as boolean | undefined;
  const operatorName = input._operatorName as string | undefined;

  if (isAiGenerated) {
    const org = operatorName || "the organization";
    body += `\n\n---\nThis message was drafted with AI assistance by ${org}'s operational AI (Qorpera).`;
  }

  const endpoint = replyAll ? "replyAll" : "reply";
  const resp = await fetch(
    `${baseUrl}/messages/${encodeURIComponent(messageId)}/${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment: body }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Outlook reply failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { messageId, replied: true, replyAll: !!replyAll } };
}

async function forwardOutlookEmail(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const messageId = input.messageId as string;
  if (!messageId) return { success: false, error: "messageId is required" };
  const to = input.to as string;
  if (!to) return { success: false, error: "to is required" };
  let comment = (input.comment as string) || "";
  const isAiGenerated = input.isAiGenerated as boolean | undefined;
  const operatorName = input._operatorName as string | undefined;

  if (isAiGenerated) {
    const org = operatorName || "the organization";
    comment += `\n\n---\nThis message was drafted with AI assistance by ${org}'s operational AI (Qorpera).`;
  }

  const toRecipients = to.split(",").map((addr) => ({
    emailAddress: { address: addr.trim() },
  }));

  const resp = await fetch(
    `${baseUrl}/messages/${encodeURIComponent(messageId)}/forward`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment, toRecipients }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Outlook forward failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { messageId, forwarded: true } };
}

async function createOutlookDraft(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const to = input.to as string;
  if (!to) return { success: false, error: "to is required" };
  const subject = input.subject as string;
  if (!subject) return { success: false, error: "subject is required" };
  const body = input.body as string;
  if (!body) return { success: false, error: "body is required" };

  const toRecipients = to.split(",").map((addr) => ({
    emailAddress: { address: addr.trim() },
  }));

  const resp = await fetch(
    `${baseUrl}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        body: { contentType: "html", content: body },
        toRecipients,
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Create draft failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { draftId: data.id, webLink: data.webLink } };
}

async function sendOutlookWithAttachment(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const to = input.to as string;
  if (!to) return { success: false, error: "to is required" };
  const subject = input.subject as string;
  if (!subject) return { success: false, error: "subject is required" };
  let body = input.body as string;
  if (!body) return { success: false, error: "body is required" };
  const attachments = input.attachments as Array<{ name: string; mimeType: string; content: string }>;
  if (!attachments || attachments.length === 0) return { success: false, error: "attachments is required" };
  const isAiGenerated = input.isAiGenerated as boolean | undefined;
  const operatorName = input._operatorName as string | undefined;

  // Validate attachment sizes (3MB per file inline limit)
  for (const att of attachments) {
    const size = Buffer.from(att.content, "base64").length;
    if (size > 3 * 1024 * 1024) {
      return { success: false, error: `Attachment "${att.name}" exceeds 3MB inline limit` };
    }
  }

  if (isAiGenerated) {
    const org = operatorName || "the organization";
    body += `\n\n---\nThis message was drafted with AI assistance by ${org}'s operational AI (Qorpera).`;
  }

  const toRecipients = to.split(",").map((addr) => ({
    emailAddress: { address: addr.trim() },
  }));

  // Step 1: Create draft
  const draftResp = await fetch(
    `${baseUrl}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        body: { contentType: "Text", content: body },
        toRecipients,
      }),
    }
  );

  if (!draftResp.ok) {
    const errText = await draftResp.text();
    return { success: false, error: `Create draft failed: ${draftResp.status} ${errText}` };
  }

  const draft = await draftResp.json();
  const draftId = draft.id;

  // Step 2: Attach files
  for (const att of attachments) {
    const attResp = await fetch(
      `${baseUrl}/messages/${encodeURIComponent(draftId)}/attachments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: att.name,
          contentType: att.mimeType,
          contentBytes: att.content,
        }),
      }
    );

    if (!attResp.ok) {
      const errText = await attResp.text();
      return { success: false, error: `Attach file "${att.name}" failed: ${attResp.status} ${errText}` };
    }
  }

  // Step 3: Send
  const sendResp = await fetch(
    `${baseUrl}/messages/${encodeURIComponent(draftId)}/send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!sendResp.ok) {
    const errText = await sendResp.text();
    return { success: false, error: `Send with attachment failed: ${sendResp.status} ${errText}` };
  }

  return { success: true, result: { sent: true, attachmentCount: attachments.length } };
}

async function archiveOutlookMessage(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const messageId = input.messageId as string;
  if (!messageId) return { success: false, error: "messageId is required" };

  const resp = await fetch(
    `${baseUrl}/messages/${encodeURIComponent(messageId)}/move`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ destinationId: "archive" }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Archive failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { messageId, archived: true } };
}

async function flagOutlookMessage(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const messageId = input.messageId as string;
  if (!messageId) return { success: false, error: "messageId is required" };
  const flagStatus = input.flagStatus as string;
  if (!flagStatus || !["flagged", "complete", "notFlagged"].includes(flagStatus)) {
    return { success: false, error: "flagStatus must be 'flagged', 'complete', or 'notFlagged'" };
  }

  const resp = await fetch(
    `${baseUrl}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ flag: { flagStatus } }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Flag message failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { messageId, flagStatus } };
}

async function markOutlookRead(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const messageId = input.messageId as string;
  if (!messageId) return { success: false, error: "messageId is required" };

  const resp = await fetch(
    `${baseUrl}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isRead: true }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Mark read failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { messageId, read: true } };
}

// ── Teams write-back helpers ────────────────────────────────

async function sendTeamsChannelMessage(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const teamId = input.teamId as string;
  if (!teamId) return { success: false, error: "teamId is required" };
  const channelId = input.channelId as string;
  if (!channelId) return { success: false, error: "channelId is required" };
  let body = input.body as string;
  if (!body) return { success: false, error: "body is required" };
  const isAiGenerated = input.isAiGenerated as boolean | undefined;

  if (isAiGenerated) {
    body = `🤖 [AI] ${body}`;
  }

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: { content: body, contentType: "html" },
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Send channel message failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { messageId: data.id, teamId, channelId } };
}

async function replyToTeamsThread(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const teamId = input.teamId as string;
  if (!teamId) return { success: false, error: "teamId is required" };
  const channelId = input.channelId as string;
  if (!channelId) return { success: false, error: "channelId is required" };
  const messageId = input.messageId as string;
  if (!messageId) return { success: false, error: "messageId is required" };
  let body = input.body as string;
  if (!body) return { success: false, error: "body is required" };
  const isAiGenerated = input.isAiGenerated as boolean | undefined;

  if (isAiGenerated) {
    body = `🤖 [AI] ${body}`;
  }

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: { content: body, contentType: "html" },
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Reply to thread failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { replyId: data.id, teamId, channelId, messageId } };
}

// ── Excel write-back helpers ────────────────────────────────

async function writeExcelCells(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const workbookId = input.workbookId as string;
  if (!workbookId) return { success: false, error: "workbookId is required" };
  const sheetName = input.sheetName as string;
  if (!sheetName) return { success: false, error: "sheetName is required" };
  const range = input.range as string;
  if (!range) return { success: false, error: "range is required" };
  const values = input.values as string[][];
  if (!values) return { success: false, error: "values is required" };

  const resp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(workbookId)}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${encodeURIComponent(range)}')`,
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
    return { success: false, error: `Write cells failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { address: data.address, rowCount: data.rowCount, columnCount: data.columnCount } };
}

async function appendExcelRows(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const workbookId = input.workbookId as string;
  if (!workbookId) return { success: false, error: "workbookId is required" };
  const sheetName = input.sheetName as string;
  if (!sheetName) return { success: false, error: "sheetName is required" };
  const rows = input.rows as string[][];
  if (!rows) return { success: false, error: "rows is required" };

  // Find the used range to determine the next empty row
  const usedResp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(workbookId)}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  let startRow = 1;
  if (usedResp.ok) {
    const usedData = await usedResp.json();
    startRow = (usedData.rowCount || 0) + 1;
  }

  // Build range address: A{startRow}:{lastCol}{endRow}
  const numCols = rows[0]?.length || 1;
  const lastCol = String.fromCharCode(64 + Math.min(numCols, 26)); // A-Z
  const endRow = startRow + rows.length - 1;
  const range = `A${startRow}:${lastCol}${endRow}`;

  const resp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(workbookId)}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${encodeURIComponent(range)}')`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Append rows failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { address: data.address, rowCount: data.rowCount } };
}

async function createExcelWorksheet(
  accessToken: string,
  input: Record<string, unknown>,
  baseUrl = "https://graph.microsoft.com/v1.0/me"
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const workbookId = input.workbookId as string;
  if (!workbookId) return { success: false, error: "workbookId is required" };
  const name = input.name as string;
  if (!name) return { success: false, error: "name is required" };

  const resp = await fetch(
    `${baseUrl}/drive/items/${encodeURIComponent(workbookId)}/workbook/worksheets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Create worksheet failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { worksheetId: data.id, name: data.name } };
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
    const baseUrl = `https://graph.microsoft.com/v1.0${getUserEndpointPrefix(config)}`;

    switch (actionId) {
      // Outlook
      case "send_email":
        return await sendOutlookEmail(accessToken, params, baseUrl);
      case "reply_to_thread":
        return await replyToOutlookThread(accessToken, params, baseUrl);
      case "reply_email":
        return await replyOutlookEmail(accessToken, params, baseUrl);
      case "forward_email":
        return await forwardOutlookEmail(accessToken, params, baseUrl);
      case "create_draft":
        return await createOutlookDraft(accessToken, params, baseUrl);
      case "send_with_attachment":
        return await sendOutlookWithAttachment(accessToken, params, baseUrl);
      case "archive":
        return await archiveOutlookMessage(accessToken, params, baseUrl);
      case "flag_message":
        return await flagOutlookMessage(accessToken, params, baseUrl);
      case "mark_read":
        return await markOutlookRead(accessToken, params, baseUrl);
      // OneDrive
      case "create_document":
        return await createMicrosoftDocument(accessToken, params, baseUrl);
      case "append_to_document":
        return await appendToMicrosoftDocument(accessToken, params, baseUrl);
      case "create_spreadsheet":
        return await createMicrosoftSpreadsheet(accessToken, params, baseUrl);
      case "update_spreadsheet_cells":
        return await updateMicrosoftSpreadsheetCells(accessToken, params, baseUrl);
      case "upload_file":
        return await uploadFileOneDrive(accessToken, params, baseUrl);
      case "create_folder":
        return await createFolderOneDrive(accessToken, params, baseUrl);
      case "share_file":
        return await shareFileOneDrive(accessToken, params, baseUrl);
      case "move_file":
        return await moveFileOneDrive(accessToken, params, baseUrl);
      case "copy_file":
        return await copyFileOneDrive(accessToken, params, baseUrl);
      // Teams
      case "send_channel_message":
        return await sendTeamsChannelMessage(accessToken, params);
      case "reply_to_teams_thread":
        return await replyToTeamsThread(accessToken, params);
      // Excel
      case "write_cells":
        return await writeExcelCells(accessToken, params, baseUrl);
      case "append_rows":
        return await appendExcelRows(accessToken, params, baseUrl);
      case "create_worksheet":
        return await createExcelWorksheet(accessToken, params, baseUrl);
      // Calendar
      case "create_calendar_event":
        return await createMicrosoftCalendarEvent(accessToken, params, baseUrl);
      case "update_calendar_event":
        return await updateMicrosoftCalendarEvent(accessToken, params, baseUrl);
      default:
        return { success: false, error: `Unknown action: ${actionId}` };
    }
  },

  writeCapabilities: [
    // OneDrive
    { slug: "create_document", name: "Create Document", description: "Create a new Word document on OneDrive", inputSchema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, folderId: { type: "string" } }, required: ["title"] } },
    { slug: "create_spreadsheet", name: "Create Spreadsheet", description: "Create a new Excel spreadsheet on OneDrive", inputSchema: { type: "object", properties: { title: { type: "string" }, sheetName: { type: "string" }, initialData: { type: "array" } }, required: ["title"] } },
    { slug: "upload_file", name: "Upload File", description: "Upload a file to OneDrive (max 10MB)", inputSchema: { type: "object", properties: { name: { type: "string" }, content: { type: "string" }, folderId: { type: "string" } }, required: ["name", "content"] } },
    { slug: "create_folder", name: "Create Folder", description: "Create a new folder on OneDrive", inputSchema: { type: "object", properties: { name: { type: "string" }, parentFolderId: { type: "string" } }, required: ["name"] } },
    { slug: "share_file", name: "Share File", description: "Share a OneDrive file with a user", inputSchema: { type: "object", properties: { fileId: { type: "string" }, email: { type: "string" }, role: { type: "string", enum: ["read", "write"] } }, required: ["fileId", "email", "role"] } },
    { slug: "move_file", name: "Move File", description: "Move a file to a different folder on OneDrive", inputSchema: { type: "object", properties: { fileId: { type: "string" }, targetFolderId: { type: "string" } }, required: ["fileId", "targetFolderId"] } },
    { slug: "copy_file", name: "Copy File", description: "Copy a file on OneDrive", inputSchema: { type: "object", properties: { fileId: { type: "string" }, newName: { type: "string" }, folderId: { type: "string" } }, required: ["fileId", "newName"] } },
    // Outlook
    { slug: "reply_email", name: "Reply to Email", description: "Reply to an Outlook email", inputSchema: { type: "object", properties: { messageId: { type: "string" }, body: { type: "string" }, replyAll: { type: "boolean" } }, required: ["messageId", "body"] } },
    { slug: "forward_email", name: "Forward Email", description: "Forward an Outlook email", inputSchema: { type: "object", properties: { messageId: { type: "string" }, to: { type: "string" }, comment: { type: "string" } }, required: ["messageId", "to"] } },
    { slug: "create_draft", name: "Create Draft", description: "Create a draft email in Outlook", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] } },
    { slug: "send_with_attachment", name: "Send with Attachment", description: "Send an Outlook email with attachments (max 3MB per file)", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, attachments: { type: "array" } }, required: ["to", "subject", "body", "attachments"] } },
    { slug: "archive", name: "Archive Message", description: "Archive an Outlook message", inputSchema: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] } },
    { slug: "flag_message", name: "Flag Message", description: "Flag or unflag an Outlook message", inputSchema: { type: "object", properties: { messageId: { type: "string" }, flagStatus: { type: "string", enum: ["flagged", "complete", "notFlagged"] } }, required: ["messageId", "flagStatus"] } },
    { slug: "mark_read", name: "Mark as Read", description: "Mark an Outlook message as read", inputSchema: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] } },
    // Teams
    { slug: "send_channel_message", name: "Send Channel Message", description: "Send a message to a Teams channel", inputSchema: { type: "object", properties: { teamId: { type: "string" }, channelId: { type: "string" }, body: { type: "string" } }, required: ["teamId", "channelId", "body"] } },
    { slug: "reply_to_teams_thread", name: "Reply to Teams Thread", description: "Reply to a Teams channel message thread", inputSchema: { type: "object", properties: { teamId: { type: "string" }, channelId: { type: "string" }, messageId: { type: "string" }, body: { type: "string" } }, required: ["teamId", "channelId", "messageId", "body"] } },
    // Excel
    { slug: "write_cells", name: "Write Cells", description: "Write values to cells in an Excel workbook", inputSchema: { type: "object", properties: { workbookId: { type: "string" }, sheetName: { type: "string" }, range: { type: "string" }, values: { type: "array" } }, required: ["workbookId", "sheetName", "range", "values"] } },
    { slug: "append_rows", name: "Append Rows", description: "Append rows to an Excel worksheet", inputSchema: { type: "object", properties: { workbookId: { type: "string" }, sheetName: { type: "string" }, rows: { type: "array" } }, required: ["workbookId", "sheetName", "rows"] } },
    { slug: "create_worksheet", name: "Create Worksheet", description: "Add a new worksheet to an Excel workbook", inputSchema: { type: "object", properties: { workbookId: { type: "string" }, name: { type: "string" } }, required: ["workbookId", "name"] } },
    // Calendar
    { slug: "create_calendar_event", name: "Create Calendar Event", description: "Creates a Microsoft 365 calendar event with attendees", inputSchema: { type: "object", properties: { summary: { type: "string" }, description: { type: "string" }, startDateTime: { type: "string" }, endDateTime: { type: "string" }, attendeeEmails: { type: "array", items: { type: "string" } }, location: { type: "string" } }, required: ["summary", "startDateTime", "endDateTime", "attendeeEmails"] } },
    { slug: "update_calendar_event", name: "Update Calendar Event", description: "Updates an existing Microsoft 365 calendar event", inputSchema: { type: "object", properties: { eventId: { type: "string" }, fields: { type: "object" } }, required: ["eventId", "fields"] } },
  ],

  async getCapabilities(config) {
    const scopes = config.scopes as string[] || [];
    const caps: { name: string; description: string; inputSchema: Record<string, unknown>; sideEffects: string[] }[] = [];

    // Outlook send capabilities
    if (scopes.some((s) => s.includes("Mail.Send"))) {
      caps.push(
        { name: "send_email", description: "Send an email via Outlook", inputSchema: { to: { type: "string", required: true }, subject: { type: "string", required: true }, body: { type: "string", required: true }, cc: { type: "string", required: false } }, sideEffects: ["Sends an email from the user's Outlook account"] },
        { name: "reply_to_thread", description: "Reply to an existing email via Outlook", inputSchema: { messageId: { type: "string", required: true }, body: { type: "string", required: true } }, sideEffects: ["Sends a reply email from the user's Outlook account"] },
        { name: "reply_email", description: "Reply to a specific Outlook email", inputSchema: { messageId: { type: "string", required: true }, body: { type: "string", required: true }, replyAll: { type: "boolean", required: false } }, sideEffects: ["Sends a reply from the user's Outlook"] },
        { name: "forward_email", description: "Forward an Outlook email", inputSchema: { messageId: { type: "string", required: true }, to: { type: "string", required: true }, comment: { type: "string", required: false } }, sideEffects: ["Forwards an email from the user's Outlook"] },
        { name: "create_draft", description: "Create a draft email in Outlook", inputSchema: { to: { type: "string", required: true }, subject: { type: "string", required: true }, body: { type: "string", required: true } }, sideEffects: ["Creates a draft in the user's Outlook"] },
        { name: "send_with_attachment", description: "Send an email with attachments (max 3MB per file)", inputSchema: { to: { type: "string", required: true }, subject: { type: "string", required: true }, body: { type: "string", required: true }, attachments: { type: "array", required: true } }, sideEffects: ["Sends an email with attachments from the user's Outlook"] },
      );
    }

    // Outlook modify capabilities (Mail.ReadWrite)
    if (scopes.some((s) => s.includes("Mail.ReadWrite"))) {
      caps.push(
        { name: "archive", description: "Archive an Outlook message", inputSchema: { messageId: { type: "string", required: true } }, sideEffects: ["Moves the message to archive"] },
        { name: "flag_message", description: "Flag or unflag an Outlook message", inputSchema: { messageId: { type: "string", required: true }, flagStatus: { type: "string", required: true } }, sideEffects: ["Changes the flag status of the message"] },
        { name: "mark_read", description: "Mark an Outlook message as read", inputSchema: { messageId: { type: "string", required: true } }, sideEffects: ["Marks the message as read"] },
      );
    }

    // OneDrive capabilities (Files.ReadWrite)
    if (scopes.some((s) => s.includes("Files.ReadWrite"))) {
      caps.push(
        { name: "create_document", description: "Create a new Word document on OneDrive", inputSchema: { title: { type: "string", required: true }, content: { type: "string", required: false } }, sideEffects: ["Creates a .docx file on OneDrive"] },
        { name: "append_to_document", description: "Append text to an existing Word document", inputSchema: { fileId: { type: "string", required: true }, content: { type: "string", required: true } }, sideEffects: ["Appends content to a Word document"] },
        { name: "create_spreadsheet", description: "Create a new Excel spreadsheet on OneDrive", inputSchema: { title: { type: "string", required: true }, sheetName: { type: "string", required: false }, initialData: { type: "array", required: false } }, sideEffects: ["Creates a .xlsx file on OneDrive"] },
        { name: "update_spreadsheet_cells", description: "Update cells in an Excel spreadsheet", inputSchema: { fileId: { type: "string", required: true }, range: { type: "string", required: true }, values: { type: "array", required: true }, sheetName: { type: "string", required: false } }, sideEffects: ["Modifies cells in an Excel spreadsheet"] },
        { name: "upload_file", description: "Upload a file to OneDrive (max 10MB)", inputSchema: { name: { type: "string", required: true }, content: { type: "string", required: true }, folderId: { type: "string", required: false } }, sideEffects: ["Uploads a file to OneDrive"] },
        { name: "create_folder", description: "Create a folder on OneDrive", inputSchema: { name: { type: "string", required: true }, parentFolderId: { type: "string", required: false } }, sideEffects: ["Creates a folder on OneDrive"] },
        { name: "share_file", description: "Share a OneDrive file", inputSchema: { fileId: { type: "string", required: true }, email: { type: "string", required: true }, role: { type: "string", required: true } }, sideEffects: ["Shares a file and sends an invitation"] },
        { name: "move_file", description: "Move a file on OneDrive", inputSchema: { fileId: { type: "string", required: true }, targetFolderId: { type: "string", required: true } }, sideEffects: ["Moves a file between folders"] },
        { name: "copy_file", description: "Copy a file on OneDrive", inputSchema: { fileId: { type: "string", required: true }, newName: { type: "string", required: true }, folderId: { type: "string", required: false } }, sideEffects: ["Creates a copy of the file"] },
        // Excel (also requires Files.ReadWrite)
        { name: "write_cells", description: "Write values to cells in an Excel workbook", inputSchema: { workbookId: { type: "string", required: true }, sheetName: { type: "string", required: true }, range: { type: "string", required: true }, values: { type: "array", required: true } }, sideEffects: ["Writes values to cells in an Excel workbook"] },
        { name: "append_rows", description: "Append rows to an Excel worksheet", inputSchema: { workbookId: { type: "string", required: true }, sheetName: { type: "string", required: true }, rows: { type: "array", required: true } }, sideEffects: ["Appends rows to an Excel worksheet"] },
        { name: "create_worksheet", description: "Add a new worksheet to an Excel workbook", inputSchema: { workbookId: { type: "string", required: true }, name: { type: "string", required: true } }, sideEffects: ["Adds a new worksheet to the workbook"] },
      );
    }

    // Teams capabilities
    if (scopes.some((s) => s.includes("ChannelMessage.Send"))) {
      caps.push(
        { name: "send_channel_message", description: "Send a message to a Teams channel", inputSchema: { teamId: { type: "string", required: true }, channelId: { type: "string", required: true }, body: { type: "string", required: true } }, sideEffects: ["Sends a message to a Teams channel"] },
        { name: "reply_to_teams_thread", description: "Reply to a Teams channel message thread", inputSchema: { teamId: { type: "string", required: true }, channelId: { type: "string", required: true }, messageId: { type: "string", required: true }, body: { type: "string", required: true } }, sideEffects: ["Replies to a Teams channel thread"] },
      );
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
  baseUrl = "https://graph.microsoft.com/v1.0/me",
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

  const resp = await fetch(`${baseUrl}/events`, {
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
  baseUrl = "https://graph.microsoft.com/v1.0/me",
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

  const resp = await fetch(`${baseUrl}/events/${params.eventId}`, {
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
