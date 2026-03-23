import type {
  ConnectorProvider,
  ConnectorConfig,
} from "./types";
import type { SyncYield } from "./sync-types";
import type { EntityInput, ExternalRef } from "@/lib/entity-resolution";
import { getValidAccessToken } from "./google-auth";

// ── Types ───────────────────────────────────────────────────

type GmailMessage = {
  id: string;
  threadId: string;
  internalDate: string; // epoch milliseconds as string
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: GmailMessagePart[];
  };
};

type GmailMessagePart = {
  mimeType: string;
  body?: { data?: string; size: number };
  parts?: GmailMessagePart[];
  filename?: string;
};

type ThreadEntry = {
  id: string;
  date: Date;
  direction: string;
  senderEmail: string;
};

// ── Token helper (exported for use by other modules) ────────

async function getGoogleAccessToken(
  config: ConnectorConfig
): Promise<string> {
  return getValidAccessToken(config);
}

// ── Gmail API helpers ───────────────────────────────────────

async function listMessageIds(
  accessToken: string,
  afterEpoch: number
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    );
    url.searchParams.set("q", `after:${afterEpoch}`);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        const retryAfter = parseInt(
          resp.headers.get("Retry-After") || "5",
          10
        );
        await sleep(retryAfter * 1000);
        continue;
      }
      throw new Error(
        `Gmail list messages: ${resp.status} ${resp.statusText}`
      );
    }

    const data = await resp.json();
    if (data.messages) {
      ids.push(
        ...data.messages.map((m: { id: string }) => m.id)
      );
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  console.log(
    `[google-sync] Found ${ids.length} messages since ${new Date(afterEpoch * 1000).toISOString()}`
  );
  return ids;
}

async function fetchMessage(
  accessToken: string,
  id: string
): Promise<GmailMessage | null> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!resp.ok) {
    if (resp.status === 429) {
      await sleep(5000);
      const retry = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (retry.ok) return await retry.json();
    }
    console.warn(
      `[google-sync] Failed to fetch message ${id}: ${resp.status}`
    );
    return null;
  }

  return await resp.json();
}

async function fetchMessageBatch(
  accessToken: string,
  ids: string[]
): Promise<GmailMessage[]> {
  const results: GmailMessage[] = [];
  const concurrency = 10;

  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency);
    const fetched = await Promise.all(
      chunk.map((id) => fetchMessage(accessToken, id))
    );
    for (const msg of fetched) {
      if (msg) results.push(msg);
    }
  }

  return results;
}

// ── Newsletter / automated email detection ──────────────────

function isAutomatedEmail(
  headers: { name: string; value: string }[],
  bodyText: string
): boolean {
  // Check 1: List-Unsubscribe header (most reliable signal)
  if (headers.some((h) => h.name.toLowerCase() === "list-unsubscribe")) {
    return true;
  }

  // Check 2: Body patterns in the BOTTOM 20% of the email
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

// ── Entity creation from email participants ──────────────────

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
        sourceSystem: "gmail",
        externalId: participant.email,
        properties: {
          email: participant.email,
        },
      },
      { sourceSystem: "gmail", externalId: participant.email }
    );

    return entityId;
  } catch (err) {
    console.warn(
      `[google-sync] Failed to create contact for ${participant.email}:`,
      err
    );
    return null;
  }
}

// ── Message processing ──────────────────────────────────────

type ProcessedMessage = {
  yields: SyncYield[];
  meta: {
    isAutomated: boolean;
    participants: { email: string; name?: string }[];
    threadEntry: ThreadEntry;
  };
};

function processMessage(
  message: GmailMessage,
  userEmail: string
): ProcessedMessage {
  const headers = message.payload.headers;
  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const cc = getHeader(headers, "Cc");
  const subject = getHeader(headers, "Subject") || "(no subject)";
  const messageIdHeader = getHeader(headers, "Message-ID");
  const date = new Date(parseInt(message.internalDate, 10));

  const fromParsed = parseEmailAddresses(from || "");
  const toParsed = parseEmailAddresses(to || "");
  const ccParsed = parseEmailAddresses(cc || "");

  const senderEmail = fromParsed[0]?.email?.toLowerCase();
  const direction =
    senderEmail === userEmail.toLowerCase() ? "sent" : "received";

  const allEmails = [
    ...fromParsed.map((p) => p.email),
    ...toParsed.map((p) => p.email),
    ...ccParsed.map((p) => p.email),
  ].filter(Boolean);

  const bodyText = extractBody(message.payload);
  const automated = isAutomatedEmail(headers, bodyText);

  // Collect unique participants (for entity creation)
  const seenEmails = new Set<string>();
  const participants: { email: string; name?: string }[] = [];
  for (const p of [...fromParsed, ...toParsed, ...ccParsed]) {
    if (p.email && !seenEmails.has(p.email)) {
      seenEmails.add(p.email);
      participants.push(p);
    }
  }

  const yields: SyncYield[] = [];

  // Note: no event yield here — entity creation is handled by ensureContactEntity()
  // in the sync loop, and email events don't need materializer processing.

  // --- Content (if body has meaningful text) ---
  if (bodyText && bodyText.trim().length > 50) {
    yields.push({
      kind: "content" as const,
      data: {
        sourceType: "email",
        sourceId: message.id,
        content: `Subject: ${subject}\n\n${bodyText}`,
        metadata: {
          subject,
          from: senderEmail,
          to: toParsed.map((p) => p.email),
          cc: ccParsed.map((p) => p.email),
          threadId: message.threadId,
          date: date.toISOString(),
          direction,
          isAutomated: automated,
        },
        participantEmails: allEmails,
      },
    });
  }

  // --- Activity signal ---
  yields.push({
    kind: "activity" as const,
    data: {
      signalType: direction === "sent" ? "email_sent" : "email_received",
      actorEmail: senderEmail,
      targetEmails: [...toParsed, ...ccParsed]
        .map((p) => p.email)
        .filter(Boolean),
      metadata: {
        subject,
        threadId: message.threadId,
        hasAttachments: hasAttachments(message.payload),
        isAutomated: automated,
      },
      occurredAt: date,
    },
  });

  return {
    yields,
    meta: {
      isAutomated: automated,
      participants,
      threadEntry: { id: message.id, date, direction, senderEmail: senderEmail || "" },
    },
  };
}

// ── Body extraction ─────────────────────────────────────────

function extractBody(payload: GmailMessage["payload"]): string {
  if (payload.body?.data && payload.mimeType === "text/plain") {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const nested = extractBodyFromParts(part.parts);
        if (nested) return nested;
      }
    }

    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtmlTags(decodeBase64Url(part.body.data));
      }
      if (part.parts) {
        for (const nested of part.parts) {
          if (nested.mimeType === "text/html" && nested.body?.data) {
            return stripHtmlTags(decodeBase64Url(nested.body.data));
          }
        }
      }
    }
  }

  if (payload.body?.data && payload.mimeType === "text/html") {
    return stripHtmlTags(decodeBase64Url(payload.body.data));
  }

  return "";
}

function extractBodyFromParts(parts: GmailMessagePart[]): string {
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      const nested = extractBodyFromParts(part.parts);
      if (nested) return nested;
    }
  }
  return "";
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

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

// ── Email parsing ───────────────────────────────────────────

function parseEmailAddresses(
  header: string
): { email: string; name?: string }[] {
  if (!header) return [];

  const addresses = header.match(/(?:[^,"]|"[^"]*")+/g) || [header];

  return addresses
    .map((addr) => {
      addr = addr.trim();
      const angleMatch = addr.match(
        /^(?:"?([^"<]*)"?\s*)?<([^\s<>]+@[^\s<>]+)>$/
      );
      if (angleMatch) {
        return {
          name: angleMatch[1]?.trim() || undefined,
          email: angleMatch[2].toLowerCase().trim(),
        };
      }
      const bareMatch = addr.match(/^([^\s<>]+@[^\s<>]+)$/);
      if (bareMatch) {
        return { email: bareMatch[1].toLowerCase().trim() };
      }
      if (addr.includes("@")) {
        return { email: addr.toLowerCase().trim() };
      }
      return null;
    })
    .filter(
      (p): p is { email: string; name?: string } => p !== null
    );
}

// ── Utilities ───────────────────────────────────────────────

function getHeader(
  headers: { name: string; value: string }[],
  name: string
): string | undefined {
  return headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value;
}

function hasAttachments(payload: GmailMessage["payload"]): boolean {
  if (payload.parts) {
    return payload.parts.some((p) => !!p.filename && p.filename.length > 0);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Service-specific sync generators ────────────────────────

async function* syncGmail(
  accessToken: string,
  since: Date | undefined,
  config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const operatorId = config._operatorId as string | undefined;

  // Import entity creation utilities once for this sync run
  const { ensureHardcodedEntityType } = await import("@/lib/event-materializer");
  const { upsertEntity } = await import("@/lib/entity-resolution");

  // 1. Get authenticated user's email (prefer config, fallback to API)
  let userEmail = (config.email_address as string) || "";
  if (!userEmail) {
    const profileResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!profileResp.ok) {
      throw new Error(
        `Gmail API error: ${profileResp.status} ${profileResp.statusText}`
      );
    }
    const profile = await profileResp.json();
    userEmail = profile.emailAddress;
  }
  console.log(`[google-sync] Gmail connected as: ${userEmail}`);

  // 2. Determine sync window
  const syncAfter = since
    ? since
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const afterEpoch = Math.floor(syncAfter.getTime() / 1000);

  // 3. List all message IDs in the window
  const messageIds = await listMessageIds(accessToken, afterEpoch);

  // 4. Fetch and process messages in batches of 50
  const threadMessages = new Map<string, ThreadEntry[]>();
  const createdEmails = new Set<string>();

  for (let i = 0; i < messageIds.length; i += 50) {
    const batch = messageIds.slice(i, i + 50);
    const messages = await fetchMessageBatch(accessToken, batch);

    for (const message of messages) {
      const { yields: items, meta } = processMessage(message, userEmail);

      // Yield all sync items
      for (const item of items) {
        yield item;
      }

      // Post-yield processing: thread tracking and entity creation
      if (operatorId) {
        // Track thread entries for response time
        if (!threadMessages.has(message.threadId)) {
          threadMessages.set(message.threadId, []);
        }
        threadMessages.get(message.threadId)!.push(meta.threadEntry);

        // Entity creation for non-automated emails
        if (!meta.isAutomated) {
          for (const participant of meta.participants) {
            if (participant.email.toLowerCase() === userEmail.toLowerCase()) continue;
            if (createdEmails.has(participant.email)) continue;
            createdEmails.add(participant.email);

            await ensureContactEntity(operatorId, participant, ensureHardcodedEntityType, upsertEntity);
          }
        }
      }
    }
  }

  // 5. Yield response time signals from thread analysis
  for (const [threadId, entries] of threadMessages) {
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    for (let j = 0; j < entries.length - 1; j++) {
      if (
        entries[j].direction === "received" &&
        entries[j + 1].direction === "sent"
      ) {
        const delta =
          entries[j + 1].date.getTime() - entries[j].date.getTime();

        // Only record if positive and < 30 days
        if (delta > 0 && delta < 30 * 24 * 60 * 60 * 1000) {
          yield {
            kind: "activity" as const,
            data: {
              signalType: "email_response_time",
              actorEmail: userEmail,
              targetEmails: [entries[j].senderEmail],
              metadata: {
                threadId,
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
    `[google-sync] Gmail done. ${messageIds.length} messages processed, ${createdEmails.size} contacts created/resolved`
  );
}

async function* syncDrive(
  accessToken: string,
  since: Date | undefined,
  config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const supportedMimeTypes = new Set([
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.presentation",
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
  ]);

  // List files modified since last sync
  let fileCount = 0;
  let processedCount = 0;
  let contentCount = 0;
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set(
      "q",
      `modifiedTime > '${syncAfter.toISOString()}' and trashed = false`
    );
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,owners,lastModifyingUser,shared,size)"
    );
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get("Retry-After") || "5", 10);
        await sleep(retryAfter * 1000);
        continue;
      }
      throw new Error(`Drive list files: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    const files = data.files || [];
    pageToken = data.nextPageToken;

    for (const file of files) {
      fileCount++;

      // Skip spreadsheets (handled by syncSheets)
      if (file.mimeType === "application/vnd.google-apps.spreadsheet") continue;

      // Skip unsupported file types
      if (!supportedMimeTypes.has(file.mimeType)) continue;

      // Skip files larger than 5MB
      if (file.size && parseInt(file.size, 10) > 5 * 1024 * 1024) continue;

      processedCount++;

      // No event yield — Drive files don't need materializer processing.
      // Content and activity yields handle RAG indexing and signal tracking.

      // Extract text content
      let extractedText = "";
      try {
        if (
          file.mimeType === "application/vnd.google-apps.document" ||
          file.mimeType === "application/vnd.google-apps.presentation"
        ) {
          const exportResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (exportResp.ok) extractedText = await exportResp.text();
        } else if (
          file.mimeType === "text/plain" ||
          file.mimeType === "text/csv" ||
          file.mimeType === "text/markdown"
        ) {
          const dlResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (dlResp.ok) extractedText = await dlResp.text();
        } else if (file.mimeType === "application/pdf") {
          const dlResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!dlResp.ok) {
            console.warn(`[google-sync] Drive: failed to download PDF ${file.name}: ${dlResp.status}`);
          } else {
            const pdfBuffer = Buffer.from(await dlResp.arrayBuffer());
            // Size guard: skip files > 5MB to prevent memory issues
            if (pdfBuffer.byteLength > 5 * 1024 * 1024) {
              console.warn(`[google-sync] Drive: PDF too large, skipping text extraction: ${file.name} (${pdfBuffer.byteLength} bytes)`);
            } else {
              try {
                const { PDFParse } = await import("pdf-parse");
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const parser = new PDFParse({ data: pdfBuffer, verbosity: 0 }) as any;
                await parser.load();
                const result = await parser.getText();
                extractedText = typeof result === "string" ? result : result?.text ?? "";
                // Minimum text threshold: scanned PDFs produce near-empty text
                if (extractedText && extractedText.trim().length < 50) {
                  console.warn(`[google-sync] Drive: PDF text too short (likely scanned), skipping: ${file.name}`);
                  extractedText = "";
                }
              } catch (pdfErr) {
                console.warn(`[google-sync] Drive: PDF parse failed for ${file.name}:`, pdfErr);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[google-sync] Drive: failed to extract content from ${file.name}:`, err);
      }

      // Yield content if substantial
      if (extractedText && extractedText.trim().length > 50) {
        contentCount++;
        yield {
          kind: "content" as const,
          data: {
            sourceType: "drive_doc",
            sourceId: file.id,
            content: extractedText,
            metadata: {
              fileName: file.name,
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
              owners: file.owners?.map((o: { emailAddress: string }) => o.emailAddress),
              lastModifyingUser: file.lastModifyingUser?.emailAddress,
            },
            participantEmails: [
              ...(file.owners?.map((o: { emailAddress: string }) => o.emailAddress) || []),
              file.lastModifyingUser?.emailAddress,
            ].filter(Boolean),
          },
        };
      }

      // Activity: doc_created (only if within sync window)
      if (file.createdTime && new Date(file.createdTime) >= syncAfter) {
        yield {
          kind: "activity" as const,
          data: {
            signalType: "doc_created",
            actorEmail: file.owners?.[0]?.emailAddress,
            metadata: { fileName: file.name, mimeType: file.mimeType, fileId: file.id },
            occurredAt: new Date(file.createdTime),
          },
        };
      }

      // Activity: doc_edited (always — file was modified in window)
      yield {
        kind: "activity" as const,
        data: {
          signalType: "doc_edited",
          actorEmail: file.lastModifyingUser?.emailAddress,
          metadata: { fileName: file.name, mimeType: file.mimeType, fileId: file.id },
          occurredAt: new Date(file.modifiedTime),
        },
      };

      // Activity: doc_shared
      if (file.shared) {
        yield {
          kind: "activity" as const,
          data: {
            signalType: "doc_shared",
            actorEmail: file.owners?.[0]?.emailAddress,
            metadata: { fileName: file.name, fileId: file.id },
            occurredAt: new Date(file.modifiedTime),
          },
        };
      }
    }
  } while (pageToken);

  console.log(
    `[google-sync] Drive: found ${fileCount} files, processed ${processedCount}, ${contentCount} with content`
  );
}

async function* syncCalendar(
  accessToken: string,
  since: Date | undefined,
  _config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  let eventCount = 0;
  const meetingPairs = new Map<string, number>();
  let pageToken: string | undefined;

  do {
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    );
    url.searchParams.set("timeMin", syncAfter.toISOString());
    url.searchParams.set("timeMax", new Date().toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set(
      "fields",
      "nextPageToken,items(id,summary,description,start,end,attendees,organizer,status,recurringEventId,htmlLink)"
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get("Retry-After") || "5", 10);
        await sleep(retryAfter * 1000);
        continue;
      }
      throw new Error(`Calendar list events: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    const events = data.items || [];
    pageToken = data.nextPageToken;

    for (const event of events) {
      // Skip cancelled events
      if (event.status === "cancelled") continue;

      eventCount++;

      const startTime = event.start?.dateTime || event.start?.date;
      const endTime = event.end?.dateTime || event.end?.date;

      // Skip events with no parseable start time
      if (!startTime || isNaN(new Date(startTime).getTime())) continue;

      const attendeeEmails = (event.attendees || [])
        .filter((a: { responseStatus?: string }) => a.responseStatus !== "declined")
        .map((a: { email?: string }) => a.email)
        .filter(Boolean) as string[];
      const organizerEmail = event.organizer?.email as string | undefined;

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
            summary: event.summary || "(no title)",
            eventId: event.id,
            durationMs,
            durationMinutes: durationMs ? Math.round(durationMs / 60000) : null,
            attendeeCount: attendeeEmails.length,
            isRecurring: !!(event.recurringEventId),
            htmlLink: event.htmlLink,
          },
          occurredAt: new Date(startTime),
        },
      };

      // Content: event description (if substantial)
      if (event.description && event.description.trim().length > 50) {
        yield {
          kind: "content" as const,
          data: {
            sourceType: "calendar_note",
            sourceId: event.id,
            content: `Meeting: ${event.summary || "(no title)"}\nDate: ${startTime}\nAttendees: ${attendeeEmails.join(", ")}\n\n${event.description}`,
            metadata: {
              summary: event.summary,
              startTime,
              attendees: attendeeEmails,
              organizer: organizerEmail,
            },
            participantEmails: attendeeEmails,
          },
        };
      }

      // No event yield — calendar events don't need materializer processing.
      // Activity signals (meeting_held, meeting_frequency) handle pattern tracking.

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
  } while (pageToken);

  // Yield meeting frequency signals for pairs with > 1 meeting
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
    `[google-sync] Calendar: ${eventCount} events, ${meetingPairs.size} attendee pairs`
  );
}

async function* syncSheets(
  accessToken: string,
  since: Date | undefined,
  config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // 1. Discover spreadsheets via Drive API (track metadata for activity signals)
  const spreadsheetIds: string[] = [];
  const spreadsheetMeta = new Map<string, { name: string; lastModifyingEmail?: string }>();

  let pageToken: string | undefined;
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set(
      "q",
      `mimeType='application/vnd.google-apps.spreadsheet' and modifiedTime>'${syncAfter.toISOString()}' and trashed=false`
    );
    url.searchParams.set("fields", "nextPageToken,files(id,name,modifiedTime,lastModifyingUser)");
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get("Retry-After") || "5", 10);
        await sleep(retryAfter * 1000);
        continue;
      }
      console.warn(`[google-sync] Sheets: Drive discovery failed: ${resp.status}`);
      break;
    }

    const data = await resp.json();
    const files = data.files || [];
    for (const f of files) {
      if (!spreadsheetIds.includes(f.id)) {
        spreadsheetIds.push(f.id);
      }
      spreadsheetMeta.set(f.id, {
        name: f.name,
        lastModifyingEmail: f.lastModifyingUser?.emailAddress,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  // 2. Also include manually configured spreadsheet IDs
  if (config.spreadsheet_ids && Array.isArray(config.spreadsheet_ids)) {
    for (const id of config.spreadsheet_ids as string[]) {
      if (!spreadsheetIds.includes(id)) spreadsheetIds.push(id);
    }
  }
  if (config.spreadsheet_id) {
    const id = extractSpreadsheetId(config.spreadsheet_id as string);
    if (id && !spreadsheetIds.includes(id)) spreadsheetIds.push(id);
  }

  let sheetCount = 0;
  let rowCount = 0;

  // 3. Process each spreadsheet
  for (const spreadsheetId of spreadsheetIds) {
    // Fetch spreadsheet metadata (title + sheets) with 429 retry
    let metaResp: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      metaResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (metaResp.ok) break;
      if (metaResp.status === 429) {
        const retryAfter = parseInt(metaResp.headers.get("Retry-After") || "5", 10);
        await sleep(retryAfter * 1000);
        continue;
      }
      break; // non-429 error, don't retry
    }

    if (!metaResp || !metaResp.ok) {
      console.warn(`[google-sync] Sheets: failed to read ${spreadsheetId}: ${metaResp?.status ?? "no response"}`);
      continue;
    }

    const meta = await metaResp.json();
    const spreadsheetTitle = meta.properties?.title || spreadsheetId;

    for (const sheet of meta.sheets || []) {
      const sheetName = sheet.properties.title;
      sheetCount++;

      // Quote sheet name for A1 notation
      const quotedName = `'${sheetName.replace(/'/g, "''")}'`;
      const dataResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(quotedName)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!dataResp.ok) continue;
      const { values } = await dataResp.json();
      if (!values || values.length < 2) continue;

      const headers = values[0] as string[];
      const rows = values.slice(1) as string[][];
      rowCount += rows.length;

      // Content: text summary for RAG indexing (cap at 100 rows)
      const textLines = [headers.join(" | ")];
      const dataRows = rows.slice(0, 100);
      for (const row of dataRows) {
        textLines.push(
          headers.map((h, idx) => `${h}: ${row[idx] || ""}`).join(" | ")
        );
      }
      const sheetText = `Spreadsheet: ${spreadsheetTitle}\nSheet: ${sheetName}\n${textLines.join("\n")}`;

      if (sheetText.length > 50) {
        yield {
          kind: "content" as const,
          data: {
            sourceType: "drive_doc",
            sourceId: `${spreadsheetId}:${sheetName}`,
            content: sheetText,
            metadata: {
              fileName: spreadsheetTitle,
              sheetName,
              mimeType: "application/vnd.google-apps.spreadsheet",
              rowCount: rows.length,
            },
            participantEmails: [],
          },
        };
      }
    }

    // Activity: doc_edited per spreadsheet (use Drive metadata for actor)
    const fileMeta = spreadsheetMeta.get(spreadsheetId);
    yield {
      kind: "activity" as const,
      data: {
        signalType: "doc_edited",
        actorEmail: fileMeta?.lastModifyingEmail,
        metadata: {
          fileName: spreadsheetTitle,
          mimeType: "application/vnd.google-apps.spreadsheet",
          fileId: spreadsheetId,
        },
        occurredAt: new Date(),
      },
    };
  }

  console.log(
    `[google-sync] Sheets: ${spreadsheetIds.length} spreadsheets, ${sheetCount} sheets, ${rowCount} rows`
  );
}

function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return input.trim();
}

// ── Gmail write-back helpers ─────────────────────────────────

async function sendEmail(
  accessToken: string,
  input: Record<string, unknown>
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

  // Build RFC 2822 email message
  const messageParts = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '', // RFC 2822: blank line separates headers from body
    body,
  ].filter((p): p is string => p !== null).join('\r\n');

  // Base64url encode for Gmail API
  const encoded = Buffer.from(messageParts)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const resp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Gmail send failed: ${resp.status} ${errText}` };
  }

  const result = await resp.json();
  return { success: true, result: { messageId: result.id, threadId: result.threadId } };
}

async function replyToThread(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const threadId = input.threadId as string;
  const body = input.body as string;
  const cc = input.cc as string | undefined;

  // Fetch the thread to get the last message's headers
  const threadResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!threadResp.ok) {
    return { success: false, error: `Failed to fetch thread: ${threadResp.status}` };
  }

  const thread = await threadResp.json();
  const lastMessage = thread.messages?.[thread.messages.length - 1];
  if (!lastMessage) {
    return { success: false, error: 'Thread has no messages' };
  }

  const headers = lastMessage.payload?.headers || [];
  const getHdr = (name: string) =>
    headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value;

  const originalSubject = getHdr('Subject') || '';
  const replyTo = getHdr('From') || '';
  const messageId = getHdr('Message-ID') || '';
  const subject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;

  const messageParts = [
    `To: ${replyTo}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '', // RFC 2822: blank line separates headers from body
    body,
  ].filter((p): p is string => p !== null).join('\r\n');

  const encoded = Buffer.from(messageParts)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const resp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded, threadId }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Gmail reply failed: ${resp.status} ${errText}` };
  }

  const result = await resp.json();
  return { success: true, result: { messageId: result.id, threadId: result.threadId } };
}

// ── Document write-back helpers ──────────────────────────────

async function createSpreadsheet(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const title = input.title as string;
  const sheetName = (input.sheetName as string) || "Sheet1";
  const initialData = input.initialData as string[][] | undefined;

  const resp = await fetch(
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: { title },
        sheets: [{ properties: { title: sheetName } }],
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Create spreadsheet failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl;

  // Write initial data if provided
  if (initialData && initialData.length > 0) {
    const writeResult = await updateSpreadsheetCells(accessToken, {
      spreadsheetId,
      range: `${sheetName}!A1`,
      values: initialData,
    });
    if (!writeResult.success) {
      return { success: true, result: { spreadsheetId, spreadsheetUrl, warning: `Created but failed to write initial data: ${writeResult.error}` } };
    }
  }

  return { success: true, result: { spreadsheetId, spreadsheetUrl } };
}

async function updateSpreadsheetCells(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const spreadsheetId = input.spreadsheetId as string;
  const range = input.range as string;
  const values = input.values as string[][];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Update cells failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return {
    success: true,
    result: {
      updatedRange: data.updatedRange,
      updatedRows: data.updatedRows,
      updatedColumns: data.updatedColumns,
    },
  };
}

async function createDocument(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const title = input.title as string;
  const content = input.content as string | undefined;

  // Step 1: Create empty doc
  const createResp = await fetch(
    "https://docs.googleapis.com/v1/documents",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!createResp.ok) {
    const errText = await createResp.text();
    return { success: false, error: `Create document failed: ${createResp.status} ${errText}` };
  }

  const doc = await createResp.json();
  const documentId = doc.documentId;
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  // Step 2: Insert content if provided
  if (content) {
    const updateResp = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            { insertText: { location: { index: 1 }, text: content } },
          ],
        }),
      }
    );

    if (!updateResp.ok) {
      return { success: true, result: { documentId, documentUrl, warning: "Created but failed to insert content" } };
    }
  }

  return { success: true, result: { documentId, documentUrl } };
}

async function appendToDocument(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const documentId = input.documentId as string;
  const content = input.content as string;

  // Get current document to find end index
  const getResp = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!getResp.ok) {
    const errText = await getResp.text();
    return { success: false, error: `Get document failed: ${getResp.status} ${errText}` };
  }

  const doc = await getResp.json();
  const endIndex = doc.body?.content?.[doc.body.content.length - 1]?.endIndex || 1;
  // Insert before the final newline character
  const insertIndex = Math.max(1, endIndex - 1);

  const updateResp = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          { insertText: { location: { index: insertIndex }, text: content } },
        ],
      }),
    }
  );

  if (!updateResp.ok) {
    const errText = await updateResp.text();
    return { success: false, error: `Append to document failed: ${updateResp.status} ${errText}` };
  }

  return { success: true, result: { documentId } };
}

// ── Drive write-back helpers ─────────────────────────────────

async function createPresentation(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const title = input.title as string;
  if (!title) return { success: false, error: "title is required" };
  const slides = input.slides as Array<{ title: string; body: string }> | undefined;
  const folderId = input.folderId as string | undefined;

  // Create empty presentation
  const createResp = await fetch(
    "https://slides.googleapis.com/v1/presentations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!createResp.ok) {
    const errText = await createResp.text();
    return { success: false, error: `Create presentation failed: ${createResp.status} ${errText}` };
  }

  const pres = await createResp.json();
  const presentationId = pres.presentationId;
  const presentationUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;

  // Add slides if provided
  if (slides && slides.length > 0) {
    const requests: Record<string, unknown>[] = [];
    for (let i = slides.length - 1; i >= 0; i--) {
      const slideObjectId = `slide_${i}`;
      requests.push({
        createSlide: {
          objectId: slideObjectId,
          insertionIndex: 1,
          slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        },
      });
    }

    const layoutResp = await fetch(
      `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (layoutResp.ok) {
      // Fetch presentation to get placeholder IDs
      const getResp = await fetch(
        `https://slides.googleapis.com/v1/presentations/${presentationId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (getResp.ok) {
        const fullPres = await getResp.json();
        const presSlides = fullPres.slides || [];
        // Skip first slide (default title slide), process our created slides
        for (let i = 0; i < slides.length && i + 1 < presSlides.length; i++) {
          const slide = presSlides[i + 1];
          const textRequests: Record<string, unknown>[] = [];

          for (const element of slide.pageElements || []) {
            const placeholder = element.placeholder;
            if (placeholder?.type === "TITLE" || placeholder?.type === "CENTERED_TITLE") {
              textRequests.push({
                insertText: { objectId: element.objectId, text: slides[i].title },
              });
            } else if (placeholder?.type === "BODY" || placeholder?.type === "SUBTITLE") {
              textRequests.push({
                insertText: { objectId: element.objectId, text: slides[i].body },
              });
            }
          }

          if (textRequests.length > 0) {
            await fetch(
              `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ requests: textRequests }),
              }
            );
          }
        }
      }
    }
  }

  // Move to folder if specified
  if (folderId) {
    await moveFileToDrive(accessToken, presentationId, folderId);
  }

  return { success: true, result: { presentationId, presentationUrl } };
}

async function uploadFile(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const name = input.name as string;
  if (!name) return { success: false, error: "name is required" };
  const mimeType = input.mimeType as string;
  if (!mimeType) return { success: false, error: "mimeType is required" };
  const content = input.content as string;
  if (!content) return { success: false, error: "content is required (base64)" };
  const folderId = input.folderId as string | undefined;

  const fileBuffer = Buffer.from(content, "base64");
  if (fileBuffer.length > 5 * 1024 * 1024) {
    return { success: false, error: "File size exceeds 5MB limit" };
  }

  const metadata: Record<string, unknown> = { name, mimeType };
  if (folderId) metadata.parents = [folderId];

  const boundary = "qorpera_upload_boundary";
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "Content-Transfer-Encoding: base64",
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Upload file failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { fileId: data.id, name: data.name } };
}

async function createFolder(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const name = input.name as string;
  if (!name) return { success: false, error: "name is required" };
  const parentFolderId = input.parentFolderId as string | undefined;

  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentFolderId) metadata.parents = [parentFolderId];

  const resp = await fetch(
    "https://www.googleapis.com/drive/v3/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Create folder failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { folderId: data.id, name: data.name } };
}

async function moveFile(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  if (!fileId) return { success: false, error: "fileId is required" };
  const targetFolderId = input.targetFolderId as string;
  if (!targetFolderId) return { success: false, error: "targetFolderId is required" };

  // Get current parents
  const getResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!getResp.ok) {
    const errText = await getResp.text();
    return { success: false, error: `Get file parents failed: ${getResp.status} ${errText}` };
  }

  const fileData = await getResp.json();
  const previousParents = (fileData.parents || []).join(",");

  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(targetFolderId)}&removeParents=${encodeURIComponent(previousParents)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Move file failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { fileId, targetFolderId } };
}

async function shareFile(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  if (!fileId) return { success: false, error: "fileId is required" };
  const email = input.email as string;
  if (!email) return { success: false, error: "email is required" };
  const role = input.role as string;
  if (!role || !["reader", "writer", "commenter"].includes(role)) {
    return { success: false, error: "role must be 'reader', 'writer', or 'commenter'" };
  }

  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "user", role, emailAddress: email }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Share file failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { permissionId: data.id, fileId, email, role } };
}

async function copyFile(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const fileId = input.fileId as string;
  if (!fileId) return { success: false, error: "fileId is required" };
  const newName = input.newName as string;
  if (!newName) return { success: false, error: "newName is required" };
  const folderId = input.folderId as string | undefined;

  const body: Record<string, unknown> = { name: newName };
  if (folderId) body.parents = [folderId];

  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Copy file failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return { success: true, result: { fileId: data.id, name: data.name } };
}

/** Helper to move a newly created file into a target folder */
async function moveFileToDrive(
  accessToken: string,
  fileId: string,
  folderId: string
): Promise<void> {
  try {
    await moveFile(accessToken, { fileId, targetFolderId: folderId });
  } catch {
    // Best-effort — file was created successfully, just not moved
  }
}

// ── Sheets write-back helpers ───────────────────────────────

async function writeCells(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const spreadsheetId = input.spreadsheetId as string;
  if (!spreadsheetId) return { success: false, error: "spreadsheetId is required" };
  const range = input.range as string;
  if (!range) return { success: false, error: "range is required" };
  const values = input.values as string[][];
  if (!values) return { success: false, error: "values is required" };

  return updateSpreadsheetCells(accessToken, { spreadsheetId, range, values });
}

async function appendRows(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const spreadsheetId = input.spreadsheetId as string;
  if (!spreadsheetId) return { success: false, error: "spreadsheetId is required" };
  const sheetName = input.sheetName as string;
  if (!sheetName) return { success: false, error: "sheetName is required" };
  const rows = input.rows as string[][];
  if (!rows) return { success: false, error: "rows is required" };

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: rows }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Append rows failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  return {
    success: true,
    result: {
      updatedRange: data.updates?.updatedRange,
      updatedRows: data.updates?.updatedRows,
    },
  };
}

async function createSheetTab(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const spreadsheetId = input.spreadsheetId as string;
  if (!spreadsheetId) return { success: false, error: "spreadsheetId is required" };
  const tabName = input.tabName as string;
  if (!tabName) return { success: false, error: "tabName is required" };

  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: tabName } } }],
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Create sheet tab failed: ${resp.status} ${errText}` };
  }

  const data = await resp.json();
  const sheetId = data.replies?.[0]?.addSheet?.properties?.sheetId;
  return { success: true, result: { sheetId, tabName } };
}

// ── Gmail extended write-back helpers ───────────────────────

async function replyEmail(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const threadId = input.threadId as string;
  if (!threadId) return { success: false, error: "threadId is required" };
  const messageId = input.messageId as string;
  if (!messageId) return { success: false, error: "messageId is required" };
  let body = input.body as string;
  if (!body) return { success: false, error: "body is required" };
  const isAiGenerated = input.isAiGenerated as boolean | undefined;
  const operatorName = input._operatorName as string | undefined;

  if (isAiGenerated) {
    const org = operatorName || "the organization";
    body += `\n\n---\nThis message was drafted with AI assistance by ${org}'s operational AI (Qorpera).`;
  }

  // Fetch original message headers
  const msgResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!msgResp.ok) {
    return { success: false, error: `Failed to fetch message: ${msgResp.status}` };
  }

  const msg = await msgResp.json();
  const headers = msg.payload?.headers || [];
  const getHdr = (name: string) =>
    headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value;

  const originalSubject = getHdr("Subject") || "";
  const replyTo = getHdr("From") || "";
  const originalMessageId = getHdr("Message-ID") || "";
  const subject = originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`;

  const messageParts = [
    `To: ${replyTo}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${originalMessageId}`,
    `References: ${originalMessageId}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");

  const encoded = Buffer.from(messageParts)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const resp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded, threadId }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Gmail reply failed: ${resp.status} ${errText}` };
  }

  const result = await resp.json();
  return { success: true, result: { messageId: result.id, threadId: result.threadId } };
}

async function forwardEmail(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const originalMessageId = input.messageId as string;
  if (!originalMessageId) return { success: false, error: "messageId is required" };
  const to = input.to as string;
  if (!to) return { success: false, error: "to is required" };
  const additionalBody = input.additionalBody as string | undefined;
  const isAiGenerated = input.isAiGenerated as boolean | undefined;
  const operatorName = input._operatorName as string | undefined;

  // Fetch original message
  const msgResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(originalMessageId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!msgResp.ok) {
    return { success: false, error: `Failed to fetch message: ${msgResp.status}` };
  }

  const msg = await msgResp.json();
  const headers = msg.payload?.headers || [];
  const getHdr = (name: string) =>
    headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value;

  const originalSubject = getHdr("Subject") || "";
  const originalFrom = getHdr("From") || "";
  const originalDate = getHdr("Date") || "";
  const subject = originalSubject.startsWith("Fwd:") ? originalSubject : `Fwd: ${originalSubject}`;

  // Extract original body
  let originalBody = "";
  if (msg.payload?.body?.data) {
    originalBody = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
  } else if (msg.payload?.parts) {
    const textPart = msg.payload.parts.find((p: { mimeType: string }) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      originalBody = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
  }

  let body = additionalBody ? `${additionalBody}\n\n` : "";
  if (isAiGenerated) {
    const org = operatorName || "the organization";
    body += `---\nThis message was drafted with AI assistance by ${org}'s operational AI (Qorpera).\n\n`;
  }
  body += `---------- Forwarded message ----------\nFrom: ${originalFrom}\nDate: ${originalDate}\nSubject: ${originalSubject}\n\n${originalBody}`;

  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");

  const encoded = Buffer.from(messageParts)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const resp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Gmail forward failed: ${resp.status} ${errText}` };
  }

  const result = await resp.json();
  return { success: true, result: { messageId: result.id, threadId: result.threadId } };
}

async function createDraft(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const to = input.to as string;
  if (!to) return { success: false, error: "to is required" };
  const subject = input.subject as string;
  if (!subject) return { success: false, error: "subject is required" };
  const body = input.body as string;
  if (!body) return { success: false, error: "body is required" };

  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");

  const encoded = Buffer.from(messageParts)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const resp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw: encoded } }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Create draft failed: ${resp.status} ${errText}` };
  }

  const result = await resp.json();
  return { success: true, result: { draftId: result.id, messageId: result.message?.id } };
}

async function sendWithAttachment(
  accessToken: string,
  input: Record<string, unknown>
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

  // Validate attachment sizes
  let totalSize = 0;
  for (const att of attachments) {
    const size = Buffer.from(att.content, "base64").length;
    if (size > 5 * 1024 * 1024) {
      return { success: false, error: `Attachment "${att.name}" exceeds 5MB limit` };
    }
    totalSize += size;
  }
  if (totalSize > 25 * 1024 * 1024) {
    return { success: false, error: "Total attachment size exceeds 25MB limit" };
  }

  if (isAiGenerated) {
    const org = operatorName || "the organization";
    body += `\n\n---\nThis message was drafted with AI assistance by ${org}'s operational AI (Qorpera).`;
  }

  const boundary = "qorpera_mime_boundary_" + Date.now();
  const mimeParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ];

  for (const att of attachments) {
    mimeParts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.name}"`,
      `Content-Disposition: attachment; filename="${att.name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      att.content
    );
  }

  mimeParts.push(`--${boundary}--`);

  const encoded = Buffer.from(mimeParts.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const resp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Send with attachment failed: ${resp.status} ${errText}` };
  }

  const result = await resp.json();
  return { success: true, result: { messageId: result.id, threadId: result.threadId } };
}

async function addLabel(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const msgId = input.messageId as string;
  if (!msgId) return { success: false, error: "messageId is required" };
  const labelName = input.labelName as string;
  if (!labelName) return { success: false, error: "labelName is required" };

  // List labels to find by name
  const listResp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listResp.ok) {
    return { success: false, error: `Failed to list labels: ${listResp.status}` };
  }

  const labelsData = await listResp.json();
  let labelId = (labelsData.labels || []).find(
    (l: { name: string; id: string }) => l.name.toLowerCase() === labelName.toLowerCase()
  )?.id;

  // Create label if it doesn't exist
  if (!labelId) {
    const createResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      }
    );

    if (!createResp.ok) {
      const errText = await createResp.text();
      return { success: false, error: `Create label failed: ${createResp.status} ${errText}` };
    }

    const newLabel = await createResp.json();
    labelId = newLabel.id;
  }

  // Apply label to message
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msgId)}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addLabelIds: [labelId] }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Add label failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { messageId: msgId, labelId, labelName } };
}

async function archiveMessage(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const msgId = input.messageId as string;
  if (!msgId) return { success: false, error: "messageId is required" };

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msgId)}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Archive failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { messageId: msgId, archived: true } };
}

async function markRead(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const msgId = input.messageId as string;
  if (!msgId) return { success: false, error: "messageId is required" };

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msgId)}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Mark read failed: ${resp.status} ${errText}` };
  }

  return { success: true, result: { messageId: msgId, read: true } };
}

// ── Provider ────────────────────────────────────────────────

export const googleProvider: ConnectorProvider = {
  id: "google",
  name: "Google",

  configSchema: [
    { key: "oauth", label: "Google Account", type: "oauth", required: true },
  ],

  async testConnection(config) {
    try {
      const token = await getGoogleAccessToken(config);
      const resp = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok) {
        return {
          ok: false,
          error: `Google API ${resp.status}: ${resp.statusText}`,
        };
      }
      await resp.json();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?): AsyncGenerator<SyncYield> {
    const accessToken = await getGoogleAccessToken(config);
    const scopes = config.scopes as string[] || [];

    if (scopes.some((s) => s.includes("gmail"))) {
      yield* syncGmail(accessToken, since, config);
    }

    if (scopes.some((s) => s.includes("drive"))) {
      yield* syncDrive(accessToken, since, config);
    }

    if (scopes.some((s) => s.includes("calendar"))) {
      yield* syncCalendar(accessToken, since, config);
    }

    if (scopes.some((s) => s.includes("spreadsheets"))) {
      yield* syncSheets(accessToken, since, config);
    }
  },

  async executeAction(config, actionId, params) {
    const accessToken = await getGoogleAccessToken(config);

    switch (actionId) {
      // Gmail
      case "send_email":
        return await sendEmail(accessToken, params);
      case "reply_to_thread":
        return await replyToThread(accessToken, params);
      case "reply_email":
        return await replyEmail(accessToken, params);
      case "forward_email":
        return await forwardEmail(accessToken, params);
      case "create_draft":
        return await createDraft(accessToken, params);
      case "send_with_attachment":
        return await sendWithAttachment(accessToken, params);
      case "add_label":
        return await addLabel(accessToken, params);
      case "archive":
        return await archiveMessage(accessToken, params);
      case "mark_read":
        return await markRead(accessToken, params);
      // Drive
      case "create_document":
        return await createDocument(accessToken, params);
      case "append_to_document":
        return await appendToDocument(accessToken, params);
      case "create_presentation":
        return await createPresentation(accessToken, params);
      case "upload_file":
        return await uploadFile(accessToken, params);
      case "create_folder":
        return await createFolder(accessToken, params);
      case "move_file":
        return await moveFile(accessToken, params);
      case "share_file":
        return await shareFile(accessToken, params);
      case "copy_file":
        return await copyFile(accessToken, params);
      // Sheets
      case "create_spreadsheet":
        return await createSpreadsheet(accessToken, params);
      case "update_spreadsheet_cells":
        return await updateSpreadsheetCells(accessToken, params);
      case "write_cells":
        return await writeCells(accessToken, params);
      case "append_rows":
        return await appendRows(accessToken, params);
      case "create_sheet_tab":
        return await createSheetTab(accessToken, params);
      // Calendar
      case "create_calendar_event":
        return await createGoogleCalendarEvent(accessToken, params);
      case "update_calendar_event":
        return await updateGoogleCalendarEvent(accessToken, params);
      case "delete_event":
        return await deleteCalendarEvent(accessToken, params);
      case "rsvp_event":
        return await rsvpEvent(accessToken, params);
      default:
        return { success: false, error: `Unknown action: ${actionId}` };
    }
  },

  writeCapabilities: [
    // Drive
    { slug: "create_document", name: "Create Document", description: "Create a new Google Doc", inputSchema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, folderId: { type: "string" } }, required: ["title"] } },
    { slug: "create_spreadsheet", name: "Create Spreadsheet", description: "Create a new Google Spreadsheet", inputSchema: { type: "object", properties: { title: { type: "string" }, sheetName: { type: "string" }, initialData: { type: "array" } }, required: ["title"] } },
    { slug: "create_presentation", name: "Create Presentation", description: "Create a new Google Slides presentation", inputSchema: { type: "object", properties: { title: { type: "string" }, slides: { type: "array" }, folderId: { type: "string" } }, required: ["title"] } },
    { slug: "upload_file", name: "Upload File", description: "Upload a file to Google Drive (max 5MB)", inputSchema: { type: "object", properties: { name: { type: "string" }, mimeType: { type: "string" }, content: { type: "string" }, folderId: { type: "string" } }, required: ["name", "mimeType", "content"] } },
    { slug: "create_folder", name: "Create Folder", description: "Create a new folder in Google Drive", inputSchema: { type: "object", properties: { name: { type: "string" }, parentFolderId: { type: "string" } }, required: ["name"] } },
    { slug: "move_file", name: "Move File", description: "Move a file to a different folder in Google Drive", inputSchema: { type: "object", properties: { fileId: { type: "string" }, targetFolderId: { type: "string" } }, required: ["fileId", "targetFolderId"] } },
    { slug: "share_file", name: "Share File", description: "Share a Google Drive file with a user", inputSchema: { type: "object", properties: { fileId: { type: "string" }, email: { type: "string" }, role: { type: "string", enum: ["reader", "writer", "commenter"] } }, required: ["fileId", "email", "role"] } },
    { slug: "copy_file", name: "Copy File", description: "Copy a file in Google Drive", inputSchema: { type: "object", properties: { fileId: { type: "string" }, newName: { type: "string" }, folderId: { type: "string" } }, required: ["fileId", "newName"] } },
    // Sheets
    { slug: "write_cells", name: "Write Cells", description: "Write values to a cell range in Google Sheets", inputSchema: { type: "object", properties: { spreadsheetId: { type: "string" }, range: { type: "string" }, values: { type: "array" } }, required: ["spreadsheetId", "range", "values"] } },
    { slug: "append_rows", name: "Append Rows", description: "Append rows to the end of a Google Sheet", inputSchema: { type: "object", properties: { spreadsheetId: { type: "string" }, sheetName: { type: "string" }, rows: { type: "array" } }, required: ["spreadsheetId", "sheetName", "rows"] } },
    { slug: "create_sheet_tab", name: "Create Sheet Tab", description: "Add a new sheet tab to a Google Spreadsheet", inputSchema: { type: "object", properties: { spreadsheetId: { type: "string" }, tabName: { type: "string" } }, required: ["spreadsheetId", "tabName"] } },
    // Gmail
    { slug: "reply_email", name: "Reply to Email", description: "Reply to a specific email message", inputSchema: { type: "object", properties: { threadId: { type: "string" }, messageId: { type: "string" }, body: { type: "string" } }, required: ["threadId", "messageId", "body"] } },
    { slug: "forward_email", name: "Forward Email", description: "Forward an email to another recipient", inputSchema: { type: "object", properties: { messageId: { type: "string" }, to: { type: "string" }, additionalBody: { type: "string" } }, required: ["messageId", "to"] } },
    { slug: "create_draft", name: "Create Draft", description: "Create a draft email in Gmail", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] } },
    { slug: "send_with_attachment", name: "Send with Attachment", description: "Send an email with file attachments", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, attachments: { type: "array" } }, required: ["to", "subject", "body", "attachments"] } },
    { slug: "add_label", name: "Add Label", description: "Add a label to a Gmail message", inputSchema: { type: "object", properties: { messageId: { type: "string" }, labelName: { type: "string" } }, required: ["messageId", "labelName"] } },
    { slug: "archive", name: "Archive Message", description: "Archive a Gmail message (remove from inbox)", inputSchema: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] } },
    { slug: "mark_read", name: "Mark as Read", description: "Mark a Gmail message as read", inputSchema: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] } },
    // Calendar
    { slug: "create_calendar_event", name: "Create Calendar Event", description: "Creates a Google Calendar event with attendees", inputSchema: { type: "object", properties: { summary: { type: "string" }, description: { type: "string" }, startDateTime: { type: "string" }, endDateTime: { type: "string" }, attendeeEmails: { type: "array", items: { type: "string" } }, location: { type: "string" } }, required: ["summary", "startDateTime", "endDateTime", "attendeeEmails"] } },
    { slug: "update_calendar_event", name: "Update Calendar Event", description: "Updates an existing Google Calendar event", inputSchema: { type: "object", properties: { eventId: { type: "string" }, fields: { type: "object" } }, required: ["eventId", "fields"] } },
    { slug: "delete_event", name: "Delete Calendar Event", description: "Delete a Google Calendar event", inputSchema: { type: "object", properties: { eventId: { type: "string" }, calendarId: { type: "string" } }, required: ["eventId"] } },
    { slug: "rsvp_event", name: "RSVP to Event", description: "Respond to a Google Calendar event invitation", inputSchema: { type: "object", properties: { eventId: { type: "string" }, response: { type: "string", enum: ["accepted", "declined", "tentative"] } }, required: ["eventId", "response"] } },
  ],

  async getCapabilities(config) {
    const scopes = config.scopes as string[] || [];
    const caps: { name: string; description: string; inputSchema: Record<string, unknown>; sideEffects: string[] }[] = [];

    // Gmail send capabilities
    if (scopes.some((s) => s.includes("gmail.send"))) {
      caps.push(
        { name: "send_email", description: "Send an email via Gmail on behalf of the user", inputSchema: { to: { type: "string", required: true }, subject: { type: "string", required: true }, body: { type: "string", required: true }, cc: { type: "string", required: false } }, sideEffects: ["Sends an email from the user's Gmail account"] },
        { name: "reply_to_thread", description: "Reply to an existing email thread via Gmail", inputSchema: { threadId: { type: "string", required: true }, body: { type: "string", required: true }, cc: { type: "string", required: false } }, sideEffects: ["Sends a reply email from the user's Gmail account"] },
        { name: "reply_email", description: "Reply to a specific email message", inputSchema: { threadId: { type: "string", required: true }, messageId: { type: "string", required: true }, body: { type: "string", required: true } }, sideEffects: ["Sends a reply email from the user's Gmail account"] },
        { name: "forward_email", description: "Forward an email to another recipient", inputSchema: { messageId: { type: "string", required: true }, to: { type: "string", required: true }, additionalBody: { type: "string", required: false } }, sideEffects: ["Forwards an email from the user's Gmail account"] },
        { name: "create_draft", description: "Create a draft email in Gmail", inputSchema: { to: { type: "string", required: true }, subject: { type: "string", required: true }, body: { type: "string", required: true } }, sideEffects: ["Creates a draft in the user's Gmail"] },
        { name: "send_with_attachment", description: "Send an email with file attachments (max 5MB per file, 25MB total)", inputSchema: { to: { type: "string", required: true }, subject: { type: "string", required: true }, body: { type: "string", required: true }, attachments: { type: "array", required: true } }, sideEffects: ["Sends an email with attachments from the user's Gmail account"] },
      );
    }

    // Gmail modify capabilities (labels, archive, mark read)
    if (scopes.some((s) => s.includes("gmail.modify"))) {
      caps.push(
        { name: "add_label", description: "Add a label to a Gmail message (creates label if needed)", inputSchema: { messageId: { type: "string", required: true }, labelName: { type: "string", required: true } }, sideEffects: ["Adds a label to the message"] },
        { name: "archive", description: "Archive a Gmail message (remove from inbox)", inputSchema: { messageId: { type: "string", required: true } }, sideEffects: ["Removes the message from inbox"] },
        { name: "mark_read", description: "Mark a Gmail message as read", inputSchema: { messageId: { type: "string", required: true } }, sideEffects: ["Marks the message as read"] },
      );
    }

    // Spreadsheet capabilities (write scope)
    if (scopes.some((s) => s.includes("spreadsheets") && !s.includes("readonly"))) {
      caps.push(
        { name: "create_spreadsheet", description: "Create a new Google Spreadsheet, optionally with initial data", inputSchema: { title: { type: "string", required: true }, sheetName: { type: "string", required: false }, initialData: { type: "array", required: false } }, sideEffects: ["Creates a new Google Spreadsheet in the user's Drive"] },
        { name: "update_spreadsheet_cells", description: "Update cells in an existing Google Spreadsheet", inputSchema: { spreadsheetId: { type: "string", required: true }, range: { type: "string", required: true }, values: { type: "array", required: true } }, sideEffects: ["Modifies cells in an existing Google Spreadsheet"] },
        { name: "write_cells", description: "Write values to a cell range in Google Sheets", inputSchema: { spreadsheetId: { type: "string", required: true }, range: { type: "string", required: true }, values: { type: "array", required: true } }, sideEffects: ["Writes values to cells in a Google Spreadsheet"] },
        { name: "append_rows", description: "Append rows after the last row with data", inputSchema: { spreadsheetId: { type: "string", required: true }, sheetName: { type: "string", required: true }, rows: { type: "array", required: true } }, sideEffects: ["Appends rows to a Google Spreadsheet"] },
        { name: "create_sheet_tab", description: "Add a new sheet tab to a Google Spreadsheet", inputSchema: { spreadsheetId: { type: "string", required: true }, tabName: { type: "string", required: true } }, sideEffects: ["Adds a new tab to the spreadsheet"] },
      );
    }

    // Document capabilities
    if (scopes.some((s) => s.includes("documents"))) {
      caps.push(
        { name: "create_document", description: "Create a new Google Doc with optional initial content", inputSchema: { title: { type: "string", required: true }, content: { type: "string", required: false } }, sideEffects: ["Creates a new Google Doc in the user's Drive"] },
        { name: "append_to_document", description: "Append text content to an existing Google Doc", inputSchema: { documentId: { type: "string", required: true }, content: { type: "string", required: true } }, sideEffects: ["Appends content to an existing Google Doc"] },
      );
    }

    // Drive capabilities
    if (scopes.some((s) => s.includes("drive"))) {
      caps.push(
        { name: "create_presentation", description: "Create a new Google Slides presentation", inputSchema: { title: { type: "string", required: true }, slides: { type: "array", required: false }, folderId: { type: "string", required: false } }, sideEffects: ["Creates a new Google Slides presentation in the user's Drive"] },
        { name: "upload_file", description: "Upload a file to Google Drive (max 5MB)", inputSchema: { name: { type: "string", required: true }, mimeType: { type: "string", required: true }, content: { type: "string", required: true }, folderId: { type: "string", required: false } }, sideEffects: ["Uploads a file to the user's Google Drive"] },
        { name: "create_folder", description: "Create a new folder in Google Drive", inputSchema: { name: { type: "string", required: true }, parentFolderId: { type: "string", required: false } }, sideEffects: ["Creates a new folder in the user's Google Drive"] },
        { name: "move_file", description: "Move a file to a different folder in Google Drive", inputSchema: { fileId: { type: "string", required: true }, targetFolderId: { type: "string", required: true } }, sideEffects: ["Moves a file between folders in Google Drive"] },
        { name: "share_file", description: "Share a Google Drive file with a user", inputSchema: { fileId: { type: "string", required: true }, email: { type: "string", required: true }, role: { type: "string", required: true } }, sideEffects: ["Shares a file and sends a notification email"] },
        { name: "copy_file", description: "Copy a file in Google Drive", inputSchema: { fileId: { type: "string", required: true }, newName: { type: "string", required: true }, folderId: { type: "string", required: false } }, sideEffects: ["Creates a copy of the file in Google Drive"] },
      );
    }

    // Calendar capabilities (always available — calendar scope implied)
    if (scopes.some((s) => s.includes("calendar"))) {
      caps.push(
        { name: "delete_event", description: "Delete a Google Calendar event", inputSchema: { eventId: { type: "string", required: true }, calendarId: { type: "string", required: false } }, sideEffects: ["Deletes a calendar event"] },
        { name: "rsvp_event", description: "Respond to a Google Calendar event invitation", inputSchema: { eventId: { type: "string", required: true }, response: { type: "string", required: true } }, sideEffects: ["Updates RSVP status on a calendar event"] },
      );
    }

    return caps;
  },

  async inferSchema(_config) {
    return [];
  },
};

// ── Google Calendar write-back ──────────────────────────────

async function createGoogleCalendarEvent(
  accessToken: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const body = {
    summary: params.summary,
    description: params.description || undefined,
    start: { dateTime: params.startDateTime },
    end: { dateTime: params.endDateTime },
    attendees: ((params.attendeeEmails || []) as string[]).map(email => ({ email })),
    location: params.location || undefined,
  };

  const resp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { success: false, error: `Create calendar event failed (${resp.status}): ${err}` };
  }
  const data = await resp.json();
  return { success: true, result: { eventId: data.id, platform: "google", attendees: params.attendeeEmails } };
}

async function updateGoogleCalendarEvent(
  accessToken: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const fields = (params.fields || {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  if (fields.summary) body.summary = fields.summary;
  if (fields.description) body.description = fields.description;
  if (fields.startDateTime) body.start = { dateTime: fields.startDateTime };
  if (fields.endDateTime) body.end = { dateTime: fields.endDateTime };
  if (fields.attendeeEmails) body.attendees = (fields.attendeeEmails as string[]).map(email => ({ email }));
  if (fields.location) body.location = fields.location;

  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${params.eventId}?sendUpdates=all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { success: false, error: `Update calendar event failed (${resp.status}): ${err}` };
  }
  const data = await resp.json();
  return { success: true, result: { eventId: data.id, platform: "google" } };
}

async function deleteCalendarEvent(
  accessToken: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const eventId = params.eventId as string;
  if (!eventId) return { success: false, error: "eventId is required" };
  const calendarId = (params.calendarId as string) || "primary";

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    return { success: false, error: `Delete calendar event failed (${resp.status}): ${err}` };
  }

  return { success: true, result: { eventId, deleted: true } };
}

async function rsvpEvent(
  accessToken: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const eventId = params.eventId as string;
  if (!eventId) return { success: false, error: "eventId is required" };
  const response = params.response as string;
  if (!response || !["accepted", "declined", "tentative"].includes(response)) {
    return { success: false, error: "response must be 'accepted', 'declined', or 'tentative'" };
  }

  // Fetch current event to get attendee list and find authenticated user
  const getResp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!getResp.ok) {
    const err = await getResp.text();
    return { success: false, error: `Fetch event failed (${getResp.status}): ${err}` };
  }

  const event = await getResp.json();

  // Get authenticated user's email
  const profileResp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!profileResp.ok) {
    return { success: false, error: "Failed to determine authenticated user email" };
  }
  const profile = await profileResp.json();
  const userEmail = profile.emailAddress?.toLowerCase();

  // Update the attendee's responseStatus
  const attendees = (event.attendees || []) as Array<{ email: string; responseStatus?: string }>;
  let found = false;
  for (const att of attendees) {
    if (att.email.toLowerCase() === userEmail) {
      att.responseStatus = response;
      found = true;
      break;
    }
  }

  if (!found) {
    // User is not in the attendees list — add them with the response
    attendees.push({ email: userEmail, responseStatus: response });
  }

  const patchResp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ attendees }),
    }
  );

  if (!patchResp.ok) {
    const err = await patchResp.text();
    return { success: false, error: `RSVP event failed (${patchResp.status}): ${err}` };
  }

  return { success: true, result: { eventId, response, email: userEmail } };
}
