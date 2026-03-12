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

export async function getGoogleAccessToken(
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

  // --- Event ---
  yields.push({
    kind: "event" as const,
    data: {
      eventType: direction === "sent" ? "email.sent" : "email.received",
      payload: {
        externalId: message.id,
        subject,
        from: fromParsed,
        to: toParsed,
        cc: ccParsed,
        threadId: message.threadId,
        messageId: messageIdHeader,
        snippet: message.snippet,
        direction,
        timestamp: date.toISOString(),
        entityRefs: allEmails,
        isAutomated: automated,
      },
    },
  });

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
  _accessToken: string,
  _since?: Date,
  _config?: ConnectorConfig
): AsyncGenerator<SyncYield> {
  console.log("[google-sync] Drive sync: not yet implemented");
}

async function* syncCalendar(
  _accessToken: string,
  _since?: Date,
  _config?: ConnectorConfig
): AsyncGenerator<SyncYield> {
  console.log("[google-sync] Calendar sync: not yet implemented");
}

async function* syncSheets(
  _accessToken: string,
  _since?: Date,
  _config?: ConnectorConfig
): AsyncGenerator<SyncYield> {
  console.log("[google-sync] Sheets sync: not yet implemented");
}

// ── Gmail write-back helpers ─────────────────────────────────

async function sendEmail(
  accessToken: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const to = input.to as string;
  const subject = input.subject as string;
  const body = input.body as string;
  const cc = input.cc as string | undefined;

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
      case "send_email":
        return await sendEmail(accessToken, params);
      case "reply_to_thread":
        return await replyToThread(accessToken, params);
      default:
        return { success: false, error: `Unknown action: ${actionId}` };
    }
  },

  async getCapabilities(config) {
    const scopes = config.scopes as string[] || [];
    const caps: { name: string; description: string; inputSchema: Record<string, unknown>; sideEffects: string[] }[] = [];

    if (scopes.some((s) => s.includes("gmail.send"))) {
      caps.push({
        name: "send_email",
        description: "Send an email via Gmail on behalf of the user",
        inputSchema: {
          to: { type: "string", required: true, description: "Recipient email address(es), comma-separated" },
          subject: { type: "string", required: true, description: "Email subject line" },
          body: { type: "string", required: true, description: "Email body text (plain text)" },
          cc: { type: "string", required: false, description: "CC recipients, comma-separated" },
        },
        sideEffects: ["Sends an email from the user's Gmail account"],
      });
      caps.push({
        name: "reply_to_thread",
        description: "Reply to an existing email thread via Gmail",
        inputSchema: {
          threadId: { type: "string", required: true, description: "Gmail thread ID to reply to" },
          body: { type: "string", required: true, description: "Reply body text (plain text)" },
          cc: { type: "string", required: false, description: "CC recipients, comma-separated" },
        },
        sideEffects: ["Sends a reply email from the user's Gmail account"],
      });
    }

    return caps;
  },

  async inferSchema(_config) {
    return [];
  },
};
