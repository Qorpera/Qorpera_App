import { prisma } from "@/lib/db";
import type { AITool } from "@/lib/ai-provider";
import { encryptConfig, decryptConfig } from "@/lib/config-encryption";
import { getValidAccessToken } from "@/lib/connectors/google-auth";
import { getValidAccessToken as getMicrosoftAccessToken } from "@/lib/connectors/microsoft-auth";
import { getValidHubSpotToken } from "@/lib/connectors/hubspot-auth";
import type { ConnectorConfig } from "@/lib/connectors/types";

// ── Helpers ─────────────────────────────────────────────────────────────────

const MAX_RESULT_CHARS = 12_000;

function capResult(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return text.slice(0, MAX_RESULT_CHARS) + "\n\n[Result truncated]";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function persistRefreshedConfig(connectorId: string, config: ConnectorConfig): Promise<void> {
  await prisma.sourceConnector.update({
    where: { id: connectorId },
    data: { config: encryptConfig(config as Record<string, unknown>) },
  }).catch(() => {});
}

// ── Tool Definitions ────────────────────────────────────────────────────────

const GET_CALENDAR_EVENTS_TOOL: AITool = {
  name: "get_calendar_events",
  description:
    "Fetch calendar events for a date range. Returns event titles, times, attendees, and locations. Use to check scheduling conflicts or find meeting context.",
  parameters: {
    type: "object",
    properties: {
      startDate: { type: "string", description: "Start of range (ISO date, e.g. '2026-04-07')" },
      endDate: { type: "string", description: "End of range (ISO date, e.g. '2026-04-14')" },
      attendeeEmail: { type: "string", description: "Optional: filter to events involving this email address" },
    },
    required: ["startDate", "endDate"],
  },
};

const GET_EMAIL_THREAD_TOOL: AITool = {
  name: "get_email_thread",
  description:
    "Fetch a complete email thread by thread ID or message ID. Returns all messages in the thread with sender, subject, timestamp, and body text.",
  parameters: {
    type: "object",
    properties: {
      threadId: { type: "string", description: "Email thread ID (from Gmail or Outlook)" },
      messageId: { type: "string", description: "Alternative: specific message ID to find the thread for" },
    },
    required: [],
  },
};

const LIST_RECENT_EMAILS_TOOL: AITool = {
  name: "list_recent_emails",
  description:
    "Search or list recent emails. Returns subject, sender, date, and preview for matching emails.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query (subject, sender, or content keywords)" },
      fromEmail: { type: "string", description: "Optional: filter by sender email" },
      days: { type: "number", description: "Look back N days (default 14, max 90)" },
      limit: { type: "number", description: "Max results (default 10, max 25)" },
    },
    required: [],
  },
};

const READ_FILE_TOOL: AITool = {
  name: "read_file",
  description:
    "Read the text content of a file from Google Drive or OneDrive. Returns extracted text. Works with documents, PDFs, presentations, and text files.",
  parameters: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "File ID from Drive/OneDrive" },
      fileName: { type: "string", description: "Alternative: search by file name (returns first match)" },
    },
    required: [],
  },
};

const LIST_FILES_TOOL: AITool = {
  name: "list_files",
  description:
    "List files in Google Drive or OneDrive, optionally filtered by search query. Returns file names, types, modification dates, and IDs.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query for file names or content" },
      folderId: { type: "string", description: "Optional: list files in a specific folder" },
      limit: { type: "number", description: "Max results (default 15, max 30)" },
    },
    required: [],
  },
};

const READ_SPREADSHEET_TOOL: AITool = {
  name: "read_spreadsheet",
  description:
    "Read data from a Google Sheet or Excel Online spreadsheet. Returns cell values as rows. Specify a range for targeted reads.",
  parameters: {
    type: "object",
    properties: {
      spreadsheetId: { type: "string", description: "Spreadsheet ID" },
      range: { type: "string", description: "Cell range in A1 notation (e.g. 'Sheet1!A1:D20'). Default: first 50 rows." },
      sheetName: { type: "string", description: "Sheet/tab name if not in range" },
    },
    required: ["spreadsheetId"],
  },
};

const GET_CHANNEL_HISTORY_TOOL: AITool = {
  name: "get_channel_history",
  description:
    "Read recent messages from a Slack or Teams channel. Returns messages with sender, timestamp, and text.",
  parameters: {
    type: "object",
    properties: {
      channelName: { type: "string", description: "Channel name (without #) or channel ID" },
      limit: { type: "number", description: "Number of messages (default 20, max 50)" },
      query: { type: "string", description: "Optional: search for specific content in the channel" },
    },
    required: ["channelName"],
  },
};

const GET_CRM_RECORD_TOOL: AITool = {
  name: "get_crm_record",
  description:
    "Fetch a CRM record with full field data and recent activity. Works with HubSpot.",
  parameters: {
    type: "object",
    properties: {
      recordId: { type: "string", description: "CRM record ID" },
      recordType: { type: "string", description: "Record type: deal, contact, company" },
      searchName: { type: "string", description: "Alternative: search by name (returns first match)" },
    },
    required: [],
  },
};

// ── Dynamic Tool Assembly ───────────────────────────────────────────────────

export async function getConnectorReadTools(operatorId: string): Promise<{
  tools: AITool[];
  availableToolNames: Set<string>;
}> {
  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId, deletedAt: null, status: "active" },
    select: { id: true, provider: true },
  });

  const tools: AITool[] = [];
  const availableToolNames = new Set<string>();
  const providerSet = new Set(connectors.map((c) => c.provider));

  // Calendar tools — Google or Microsoft
  if (providerSet.has("google") || providerSet.has("microsoft")) {
    tools.push(GET_CALENDAR_EVENTS_TOOL);
    availableToolNames.add("get_calendar_events");
  }

  // Email tools — Google (Gmail) or Microsoft (Outlook)
  if (providerSet.has("google") || providerSet.has("microsoft")) {
    tools.push(GET_EMAIL_THREAD_TOOL, LIST_RECENT_EMAILS_TOOL);
    availableToolNames.add("get_email_thread");
    availableToolNames.add("list_recent_emails");
  }

  // File/Drive tools — Google or Microsoft
  if (providerSet.has("google") || providerSet.has("microsoft")) {
    tools.push(READ_FILE_TOOL, LIST_FILES_TOOL, READ_SPREADSHEET_TOOL);
    availableToolNames.add("read_file");
    availableToolNames.add("list_files");
    availableToolNames.add("read_spreadsheet");
  }

  // Slack/Teams channel history
  if (providerSet.has("slack") || providerSet.has("microsoft")) {
    tools.push(GET_CHANNEL_HISTORY_TOOL);
    availableToolNames.add("get_channel_history");
  }

  // CRM record read
  if (providerSet.has("hubspot")) {
    tools.push(GET_CRM_RECORD_TOOL);
    availableToolNames.add("get_crm_record");
  }

  return { tools, availableToolNames };
}

// ── Dispatch ────────────────────────────────────────────────────────────────

export async function executeConnectorReadTool(
  operatorId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const connector = await findConnectorForTool(operatorId, toolName);
    if (!connector) {
      return `No active connector available for ${toolName}. The company may not have this system connected.`;
    }

    const config = decryptConfig(connector.config || "{}") as ConnectorConfig;

    const result = await (async () => {
      switch (toolName) {
        case "get_calendar_events":
          return executeGetCalendarEvents(connector.id, config, connector.provider, args);
        case "get_email_thread":
          return executeGetEmailThread(connector.id, config, connector.provider, args);
        case "list_recent_emails":
          return executeListRecentEmails(connector.id, config, connector.provider, args);
        case "read_file":
          return executeReadFile(connector.id, config, connector.provider, args);
        case "list_files":
          return executeListFiles(connector.id, config, connector.provider, args);
        case "read_spreadsheet":
          return executeReadSpreadsheet(connector.id, config, connector.provider, args);
        case "get_channel_history":
          return executeGetChannelHistory(connector.id, config, connector.provider, args);
        case "get_crm_record":
          return executeGetCrmRecord(connector.id, config, connector.provider, args);
        default:
          return `Unknown connector tool: "${toolName}"`;
      }
    })();

    return capResult(result);
  } catch (err) {
    console.error(`[connector-read-tools] ${toolName} failed:`, err);
    return `Tool "${toolName}" encountered an error: ${err instanceof Error ? err.message : "unknown error"}. The connector may need re-authentication.`;
  }
}

// ── Connector Lookup ────────────────────────────────────────────────────────

async function findConnectorForTool(
  operatorId: string,
  toolName: string,
): Promise<{ id: string; provider: string; config: string | null } | null> {
  const providerMap: Record<string, string[]> = {
    get_calendar_events: ["google", "microsoft"],
    get_email_thread: ["google", "microsoft"],
    list_recent_emails: ["google", "microsoft"],
    read_file: ["google", "microsoft"],
    list_files: ["google", "microsoft"],
    read_spreadsheet: ["google", "microsoft"],
    get_channel_history: ["slack", "microsoft"],
    get_crm_record: ["hubspot"],
  };

  const providers = providerMap[toolName];
  if (!providers) return null;

  return prisma.sourceConnector.findFirst({
    where: { operatorId, provider: { in: providers }, deletedAt: null, status: "active" },
    select: { id: true, provider: true, config: true },
  });
}

// ── Auth Helpers ─────────────────────────────────────────────────────────────

async function getAccessToken(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
): Promise<string> {
  let token: string;
  if (provider === "google") {
    token = await getValidAccessToken(config);
  } else if (provider === "microsoft") {
    token = await getMicrosoftAccessToken(config);
  } else if (provider === "hubspot") {
    token = await getValidHubSpotToken(config);
  } else if (provider === "slack") {
    token = (config.bot_token as string) || (config.access_token as string) || "";
  } else {
    throw new Error(`Unsupported provider for token refresh: ${provider}`);
  }
  // Persist any refreshed tokens
  await persistRefreshedConfig(connectorId, config);
  return token;
}

// ── Google / Microsoft shared fetch ─────────────────────────────────────────

async function apiFetch(
  url: string,
  token: string,
  params?: Record<string, string>,
): Promise<Response> {
  const u = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  }
  const resp = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 429) {
    return Promise.resolve(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
  }
  return resp;
}

function checkResp(resp: Response, apiName: string): void {
  if (resp.status === 429) {
    throw new Error(`${apiName} rate limited — try again shortly`);
  }
  if (!resp.ok) {
    throw new Error(`${apiName} returned ${resp.status}`);
  }
}

function msUserPrefix(config: ConnectorConfig): string {
  if (config.delegation_type === "app-permissions" && config.target_user_email) {
    return `/users/${encodeURIComponent(config.target_user_email as string)}`;
  }
  return "/me";
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool Implementations
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. get_calendar_events ──────────────────────────────────────────────────

async function executeGetCalendarEvents(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
  args: Record<string, unknown>,
): Promise<string> {
  const startDate = args.startDate as string;
  const endDate = args.endDate as string;
  const attendeeEmail = args.attendeeEmail as string | undefined;
  const token = await getAccessToken(connectorId, config, provider);

  if (provider === "google") {
    const resp = await apiFetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      token,
      {
        timeMin: new Date(startDate).toISOString(),
        timeMax: new Date(endDate + "T23:59:59").toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
        fields: "items(id,summary,description,start,end,attendees,location,status)",
      },
    );
    checkResp(resp, "Google Calendar API");
    const data = await resp.json();
    const items = (data.items || []) as Array<Record<string, unknown>>;

    if (items.length === 0) return `No calendar events found between ${startDate} and ${endDate}.`;

    const lines = items
      .filter((ev) => ev.status !== "cancelled")
      .filter((ev) => {
        if (!attendeeEmail) return true;
        const attendees = (ev.attendees || []) as Array<Record<string, unknown>>;
        return attendees.some(
          (a) => (a.email as string)?.toLowerCase() === attendeeEmail.toLowerCase(),
        );
      })
      .map((ev) => {
        const start = (ev.start as Record<string, string>)?.dateTime || (ev.start as Record<string, string>)?.date || "?";
        const end = (ev.end as Record<string, string>)?.dateTime || (ev.end as Record<string, string>)?.date || "?";
        const attendees = ((ev.attendees || []) as Array<Record<string, unknown>>)
          .filter((a) => a.responseStatus !== "declined")
          .map((a) => a.email as string)
          .join(", ");
        const parts = [`[${start} → ${end}] ${ev.summary || "(no title)"}`];
        if (attendees) parts.push(`Attendees: ${attendees}`);
        if (ev.location) parts.push(`Location: ${ev.location}`);
        return parts.join(" — ");
      });

    return `Calendar events (${startDate} to ${endDate}):\n\n${lines.join("\n")}`;
  }

  // Microsoft
  const prefix = msUserPrefix(config);
  const resp = await apiFetch(
    `https://graph.microsoft.com/v1.0${prefix}/calendarView`,
    token,
    {
      startDateTime: new Date(startDate).toISOString(),
      endDateTime: new Date(endDate + "T23:59:59").toISOString(),
      $top: "50",
      $select: "subject,start,end,attendees,location,organizer",
      $orderby: "start/dateTime",
    },
  );
  checkResp(resp, "Microsoft Calendar API");
  const data = await resp.json();
  const items = (data.value || []) as Array<Record<string, unknown>>;

  if (items.length === 0) return `No calendar events found between ${startDate} and ${endDate}.`;

  const lines = items
    .filter((ev) => {
      if (!attendeeEmail) return true;
      const attendees = (ev.attendees || []) as Array<Record<string, unknown>>;
      return attendees.some((a) => {
        const addr = (a as Record<string, unknown>).emailAddress as Record<string, string> | undefined;
        return addr?.address?.toLowerCase() === attendeeEmail.toLowerCase();
      });
    })
    .map((ev) => {
      const start = (ev.start as Record<string, string>)?.dateTime || "?";
      const end = (ev.end as Record<string, string>)?.dateTime || "?";
      const attendees = ((ev.attendees || []) as Array<Record<string, unknown>>)
        .map((a) => {
          const addr = (a as Record<string, unknown>).emailAddress as Record<string, string> | undefined;
          return addr?.address || "?";
        })
        .join(", ");
      const loc = (ev.location as Record<string, string>)?.displayName;
      const parts = [`[${start} → ${end}] ${ev.subject || "(no title)"}`];
      if (attendees) parts.push(`Attendees: ${attendees}`);
      if (loc) parts.push(`Location: ${loc}`);
      return parts.join(" — ");
    });

  return `Calendar events (${startDate} to ${endDate}):\n\n${lines.join("\n")}`;
}

// ── 2. get_email_thread ─────────────────────────────────────────────────────

async function executeGetEmailThread(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
  args: Record<string, unknown>,
): Promise<string> {
  const threadId = args.threadId as string | undefined;
  const messageId = args.messageId as string | undefined;
  if (!threadId && !messageId) return "Either threadId or messageId is required.";

  const token = await getAccessToken(connectorId, config, provider);

  if (provider === "google") {
    let tid = threadId;
    if (!tid && messageId) {
      // Look up thread from message
      const msgResp = await apiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        token,
        { format: "metadata", metadataHeaders: "Subject" },
      );
      checkResp(msgResp, "Gmail API");
      const msgData = await msgResp.json();
      tid = msgData.threadId as string;
    }

    const resp = await apiFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${tid}`,
      token,
      { format: "full" },
    );
    checkResp(resp, "Gmail API");
    const data = await resp.json();
    const messages = (data.messages || []) as Array<Record<string, unknown>>;

    if (messages.length === 0) return "Thread is empty or not found.";

    const formatted = messages.map((msg) => {
      const headers = (msg.payload as Record<string, unknown>)?.headers as Array<{ name: string; value: string }> || [];
      const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      const body = extractGmailBody(msg.payload as Record<string, unknown>);

      return [
        `From: ${getHeader("From")}`,
        `To: ${getHeader("To")}`,
        `Date: ${getHeader("Date")}`,
        `Subject: ${getHeader("Subject")}`,
        "",
        body,
      ].join("\n");
    });

    return `Email thread (${messages.length} messages):\n\n${formatted.join("\n\n---\n\n")}`;
  }

  // Microsoft
  const prefix = msUserPrefix(config);
  const conversationId = threadId || messageId;
  const resp = await apiFetch(
    `https://graph.microsoft.com/v1.0${prefix}/messages`,
    token,
    {
      $filter: `conversationId eq '${conversationId}'`,
      $select: "from,toRecipients,subject,receivedDateTime,body",
      $orderby: "receivedDateTime",
      $top: "50",
    },
  );
  checkResp(resp, "Microsoft Mail API");
  const data = await resp.json();
  const messages = (data.value || []) as Array<Record<string, unknown>>;

  if (messages.length === 0) return "Thread is empty or not found.";

  const formatted = messages.map((msg) => {
    const from = (msg.from as Record<string, unknown>)?.emailAddress as Record<string, string> | undefined;
    const to = ((msg.toRecipients || []) as Array<Record<string, unknown>>)
      .map((r) => ((r.emailAddress as Record<string, string>)?.address || "?"))
      .join(", ");
    const bodyContent = (msg.body as Record<string, string>)?.content || "";
    const bodyType = (msg.body as Record<string, string>)?.contentType || "text";
    const text = bodyType === "html" ? stripHtml(bodyContent) : bodyContent;

    return [
      `From: ${from?.name || ""} <${from?.address || "?"}>`,
      `To: ${to}`,
      `Date: ${msg.receivedDateTime}`,
      `Subject: ${msg.subject}`,
      "",
      text,
    ].join("\n");
  });

  return `Email thread (${messages.length} messages):\n\n${formatted.join("\n\n---\n\n")}`;
}

function extractGmailBody(payload: Record<string, unknown>): string {
  // Try text/plain first
  const parts = (payload.parts || []) as Array<Record<string, unknown>>;
  if (parts.length === 0) {
    // Single-part message
    const body = (payload.body as Record<string, unknown>)?.data as string | undefined;
    if (body) return Buffer.from(body, "base64url").toString("utf-8");
    return "(no body)";
  }

  // Look for text/plain
  for (const part of parts) {
    if (part.mimeType === "text/plain") {
      const data = (part.body as Record<string, unknown>)?.data as string | undefined;
      if (data) return Buffer.from(data, "base64url").toString("utf-8");
    }
  }

  // Fall back to text/html
  for (const part of parts) {
    if (part.mimeType === "text/html") {
      const data = (part.body as Record<string, unknown>)?.data as string | undefined;
      if (data) return stripHtml(Buffer.from(data, "base64url").toString("utf-8"));
    }
  }

  // Recurse into multipart
  for (const part of parts) {
    if ((part.mimeType as string)?.startsWith("multipart/")) {
      const nested = extractGmailBody(part);
      if (nested !== "(no body)") return nested;
    }
  }

  return "(no body)";
}

// ── 3. list_recent_emails ───────────────────────────────────────────────────

async function executeListRecentEmails(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = args.query as string | undefined;
  const fromEmail = args.fromEmail as string | undefined;
  const days = Math.min(Math.max((args.days as number) || 14, 1), 90);
  const limit = Math.min(Math.max((args.limit as number) || 10, 1), 25);
  const token = await getAccessToken(connectorId, config, provider);

  if (provider === "google") {
    const afterEpoch = Math.floor((Date.now() - days * 86_400_000) / 1000);
    const qParts: string[] = [`after:${afterEpoch}`];
    if (query) qParts.push(query);
    if (fromEmail) qParts.push(`from:${fromEmail}`);

    const listResp = await apiFetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      token,
      { q: qParts.join(" "), maxResults: String(limit) },
    );
    checkResp(listResp, "Gmail API");
    const listData = await listResp.json();
    const msgIds = ((listData.messages || []) as Array<{ id: string }>).map((m) => m.id);

    if (msgIds.length === 0) return "No matching emails found.";

    const results: string[] = [];
    for (const id of msgIds) {
      const resp = await apiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`,
        token,
        { format: "metadata", metadataHeaders: "From,Subject,Date" },
      );
      if (!resp.ok) continue;
      const msg = await resp.json();
      const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>;
      const getH = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
      const subj = getH("Subject") || "(no subject)";
      const from = getH("From");
      const date = getH("Date");
      const preview = (msg.snippet as string) || "";
      results.push(
        "\u2022 " + subj + "\n  From: " + from + " \u2014 Date: " + date + "\n  Preview: " + preview,
      );
    }

    return "Recent emails (last " + days + " days, " + results.length + " results):\n\n" + results.join("\n\n");
  }

  // Microsoft
  const prefix = msUserPrefix(config);
  const sinceDate = new Date(Date.now() - days * 86_400_000).toISOString();
  const params: Record<string, string> = {
    $top: String(limit),
    $select: "from,subject,receivedDateTime,bodyPreview",
    $orderby: "receivedDateTime desc",
    $filter: `receivedDateTime ge ${sinceDate}`,
  };
  if (query) params.$search = `"${query}"`;
  if (fromEmail) {
    params.$filter += ` and from/emailAddress/address eq '${fromEmail}'`;
  }

  const resp = await apiFetch(
    `https://graph.microsoft.com/v1.0${prefix}/messages`,
    token,
    params,
  );
  checkResp(resp, "Microsoft Mail API");
  const data = await resp.json();
  const messages = (data.value || []) as Array<Record<string, unknown>>;

  if (messages.length === 0) return "No matching emails found.";

  const results = messages.map((msg) => {
    const from = (msg.from as Record<string, unknown>)?.emailAddress as Record<string, string> | undefined;
    return `• ${msg.subject || "(no subject)"}\n  From: ${from?.name || ""} <${from?.address || "?"}> — Date: ${msg.receivedDateTime}\n  Preview: ${msg.bodyPreview || ""}`;
  });

  return `Recent emails (last ${days} days, ${results.length} results):\n\n${results.join("\n\n")}`;
}

// ── 4. read_file ────────────────────────────────────────────────────────────

async function executeReadFile(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
  args: Record<string, unknown>,
): Promise<string> {
  let fileId = args.fileId as string | undefined;
  const fileName = args.fileName as string | undefined;
  if (!fileId && !fileName) return "Either fileId or fileName is required.";

  const token = await getAccessToken(connectorId, config, provider);

  if (provider === "google") {
    // Resolve fileName → fileId if needed
    if (!fileId && fileName) {
      const searchResp = await apiFetch(
        "https://www.googleapis.com/drive/v3/files",
        token,
        {
          q: `name contains '${fileName.replace(/'/g, "\\'")}'`,
          fields: "files(id,name,mimeType)",
          pageSize: "1",
        },
      );
      checkResp(searchResp, "Google Drive API");
      const searchData = await searchResp.json();
      const files = (searchData.files || []) as Array<Record<string, string>>;
      if (files.length === 0) return `No file found matching "${fileName}".`;
      fileId = files[0].id;
    }

    // Get file metadata for mime type
    const metaResp = await apiFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      token,
      { fields: "id,name,mimeType,size" },
    );
    checkResp(metaResp, "Google Drive API");
    const meta = await metaResp.json();
    const mimeType = meta.mimeType as string;
    const name = meta.name as string;

    let text: string;
    if (mimeType === "application/vnd.google-apps.document") {
      // Google Doc → export as plain text
      const exportResp = await apiFetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export`,
        token,
        { mimeType: "text/plain" },
      );
      checkResp(exportResp, "Google Drive export");
      text = await exportResp.text();
    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      return `"${name}" is a spreadsheet — use read_spreadsheet tool instead (spreadsheetId: "${fileId}").`;
    } else if (mimeType === "application/vnd.google-apps.presentation") {
      const exportResp = await apiFetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export`,
        token,
        { mimeType: "text/plain" },
      );
      checkResp(exportResp, "Google Drive export");
      text = await exportResp.text();
    } else {
      // Regular file — download content
      const dlResp = await apiFetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        token,
        { alt: "media" },
      );
      checkResp(dlResp, "Google Drive download");
      const buf = Buffer.from(await dlResp.arrayBuffer());
      if (buf.length > 5 * 1024 * 1024) return `File "${name}" is too large to read (${(buf.length / 1024 / 1024).toFixed(1)} MB, max 5 MB).`;
      text = buf.toString("utf-8");
    }

    return `File: ${name}\n\n${text}`;
  }

  // Microsoft OneDrive
  const prefix = msUserPrefix(config);
  if (!fileId && fileName) {
    const searchResp = await apiFetch(
      `https://graph.microsoft.com/v1.0${prefix}/drive/root/search(q='${encodeURIComponent(fileName)}')`,
      token,
      { $top: "1", $select: "id,name,file" },
    );
    checkResp(searchResp, "OneDrive API");
    const searchData = await searchResp.json();
    const files = (searchData.value || []) as Array<Record<string, unknown>>;
    if (files.length === 0) return `No file found matching "${fileName}".`;
    fileId = files[0].id as string;
  }

  // Download content
  const dlResp = await apiFetch(
    `https://graph.microsoft.com/v1.0${prefix}/drive/items/${fileId}/content`,
    token,
  );
  checkResp(dlResp, "OneDrive download");
  const buf = Buffer.from(await dlResp.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) return `File is too large to read (${(buf.length / 1024 / 1024).toFixed(1)} MB, max 5 MB).`;

  return `File content:\n\n${buf.toString("utf-8")}`;
}

// ── 5. list_files ───────────────────────────────────────────────────────────

async function executeListFiles(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = args.query as string | undefined;
  const folderId = args.folderId as string | undefined;
  const limit = Math.min(Math.max((args.limit as number) || 15, 1), 30);
  const token = await getAccessToken(connectorId, config, provider);

  if (provider === "google") {
    const qParts: string[] = ["trashed = false"];
    if (query) qParts.push(`name contains '${query.replace(/'/g, "\\'")}'`);
    if (folderId) qParts.push(`'${folderId}' in parents`);

    const resp = await apiFetch(
      "https://www.googleapis.com/drive/v3/files",
      token,
      {
        q: qParts.join(" and "),
        fields: "files(id,name,mimeType,modifiedTime,size)",
        pageSize: String(limit),
        orderBy: "modifiedTime desc",
      },
    );
    checkResp(resp, "Google Drive API");
    const data = await resp.json();
    const files = (data.files || []) as Array<Record<string, unknown>>;

    if (files.length === 0) return "No files found.";

    const lines = files.map((f) => {
      const size = f.size ? `${(Number(f.size) / 1024).toFixed(0)} KB` : "—";
      return `• ${f.name} (${f.mimeType}) — Modified: ${f.modifiedTime} — Size: ${size} — ID: ${f.id}`;
    });

    return `Files (${files.length} results):\n\n${lines.join("\n")}`;
  }

  // Microsoft OneDrive
  const prefix = msUserPrefix(config);
  let url: string;
  if (query) {
    url = `https://graph.microsoft.com/v1.0${prefix}/drive/root/search(q='${encodeURIComponent(query)}')`;
  } else if (folderId) {
    url = `https://graph.microsoft.com/v1.0${prefix}/drive/items/${folderId}/children`;
  } else {
    url = `https://graph.microsoft.com/v1.0${prefix}/drive/root/children`;
  }

  const resp = await apiFetch(url, token, {
    $top: String(limit),
    $select: "id,name,file,lastModifiedDateTime,size",
  });
  checkResp(resp, "OneDrive API");
  const data = await resp.json();
  const files = (data.value || []) as Array<Record<string, unknown>>;

  if (files.length === 0) return "No files found.";

  const lines = files.map((f) => {
    const size = f.size ? `${(Number(f.size) / 1024).toFixed(0)} KB` : "—";
    const mime = (f.file as Record<string, string>)?.mimeType || "folder";
    return `• ${f.name} (${mime}) — Modified: ${f.lastModifiedDateTime} — Size: ${size} — ID: ${f.id}`;
  });

  return `Files (${files.length} results):\n\n${lines.join("\n")}`;
}

// ── 6. read_spreadsheet ─────────────────────────────────────────────────────

async function executeReadSpreadsheet(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
  args: Record<string, unknown>,
): Promise<string> {
  const spreadsheetId = args.spreadsheetId as string;
  const sheetName = args.sheetName as string | undefined;
  const range = args.range as string | undefined;
  const token = await getAccessToken(connectorId, config, provider);

  if (provider === "google") {
    const effectiveRange = range || (sheetName ? `${sheetName}!A1:Z50` : "A1:Z50");

    const resp = await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(effectiveRange)}`,
      token,
      { valueRenderOption: "FORMATTED_VALUE" },
    );
    checkResp(resp, "Google Sheets API");
    const data = await resp.json();
    const rows = (data.values || []) as string[][];

    if (rows.length === 0) return "Spreadsheet range is empty.";

    // Format as text table
    const header = rows[0];
    const lines = [header.join(" | "), header.map(() => "---").join(" | ")];
    for (let i = 1; i < rows.length; i++) {
      lines.push(rows[i].join(" | "));
    }

    return `Spreadsheet data (${rows.length} rows, range: ${effectiveRange}):\n\n${lines.join("\n")}`;
  }

  // Microsoft Excel Online
  const prefix = msUserPrefix(config);
  const effectiveSheet = sheetName || "Sheet1";
  const effectiveRange = range || `${effectiveSheet}!A1:Z50`;

  // If range doesn't include sheet name, prepend it
  const fullRange = effectiveRange.includes("!") ? effectiveRange : `${effectiveSheet}!${effectiveRange}`;
  const sheetPart = fullRange.split("!")[0];
  const rangePart = fullRange.split("!")[1] || "A1:Z50";

  const resp = await apiFetch(
    `https://graph.microsoft.com/v1.0${prefix}/drive/items/${spreadsheetId}/workbook/worksheets/${encodeURIComponent(sheetPart)}/range(address='${rangePart}')`,
    token,
  );
  checkResp(resp, "Microsoft Excel API");
  const data = await resp.json();
  const rows = (data.values || []) as string[][];

  if (rows.length === 0) return "Spreadsheet range is empty.";

  const header = rows[0];
  const lines = [header.join(" | "), header.map(() => "---").join(" | ")];
  for (let i = 1; i < rows.length; i++) {
    lines.push(rows[i].join(" | "));
  }

  return `Spreadsheet data (${rows.length} rows, range: ${fullRange}):\n\n${lines.join("\n")}`;
}

// ── 7. get_channel_history ──────────────────────────────────────────────────

async function executeGetChannelHistory(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
  args: Record<string, unknown>,
): Promise<string> {
  const channelName = args.channelName as string;
  const limit = Math.min(Math.max((args.limit as number) || 20, 1), 50);
  const token = await getAccessToken(connectorId, config, provider);

  if (provider === "slack") {
    const botToken = (config.bot_token as string) || token;

    // Resolve channel name to ID (unless already an ID like "C012345")
    let channelId = channelName;
    if (!channelName.startsWith("C") || channelName.includes(" ")) {
      // Try local DB mapping first
      const mapping = await prisma.slackChannelMapping.findFirst({
        where: {
          connectorId,
          channelName: { contains: channelName.replace(/^#/, ""), mode: "insensitive" },
        },
      });
      if (mapping) {
        channelId = mapping.channelId;
      } else {
        // Fall back to Slack API
        const listResp = await fetch(
          `https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true`,
          { headers: { Authorization: `Bearer ${botToken}` } },
        );
        if (!listResp.ok) throw new Error(`Slack conversations.list returned ${listResp.status}`);
        const listData = await listResp.json();
        const channels = (listData.channels || []) as Array<Record<string, string>>;
        const match = channels.find(
          (c) => c.name?.toLowerCase() === channelName.replace(/^#/, "").toLowerCase(),
        );
        if (!match) return `Channel "${channelName}" not found. Check the channel name and try again.`;
        channelId = match.id;
      }
    }

    // Fetch history
    const histResp = await fetch(
      `https://slack.com/api/conversations.history?channel=${channelId}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${botToken}` } },
    );
    if (!histResp.ok) throw new Error(`Slack conversations.history returned ${histResp.status}`);
    const histData = await histResp.json();
    if (!histData.ok) throw new Error(`Slack API error: ${histData.error}`);
    const messages = (histData.messages || []) as Array<Record<string, unknown>>;

    if (messages.length === 0) return `No messages found in #${channelName}.`;

    // Resolve user IDs to names (batch)
    const userIds = [...new Set(messages.map((m) => m.user as string).filter(Boolean))];
    const userMap = new Map<string, string>();
    for (const uid of userIds) {
      const uResp = await fetch(
        `https://slack.com/api/users.info?user=${uid}`,
        { headers: { Authorization: `Bearer ${botToken}` } },
      );
      if (uResp.ok) {
        const uData = await uResp.json();
        if (uData.ok && uData.user) {
          userMap.set(uid, uData.user.profile?.real_name || uData.user.name || uid);
        }
      }
    }

    // Format chronologically (messages come newest-first from Slack)
    const formatted = messages.reverse().map((msg) => {
      const ts = new Date(Number(msg.ts) * 1000).toISOString();
      const user = userMap.get(msg.user as string) || (msg.user as string) || "bot";
      return `[${ts}] ${user}: ${msg.text}`;
    });

    return `#${channelName} — last ${messages.length} messages:\n\n${formatted.join("\n")}`;
  }

  // Microsoft Teams
  // Teams channel resolution is complex — need teamId + channelId
  // Try to find from stored channel mappings or use search
  const prefix = msUserPrefix(config);

  // List joined teams
  const teamsResp = await apiFetch(
    `https://graph.microsoft.com/v1.0${prefix}/joinedTeams`,
    token,
    { $select: "id,displayName" },
  );
  checkResp(teamsResp, "Microsoft Teams API");
  const teamsData = await teamsResp.json();
  const teams = (teamsData.value || []) as Array<Record<string, string>>;

  // Search each team for the channel
  for (const team of teams) {
    const chResp = await apiFetch(
      `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`,
      token,
      { $filter: `displayName eq '${channelName}'` },
    );
    if (!chResp.ok) continue;
    const chData = await chResp.json();
    const channels = (chData.value || []) as Array<Record<string, string>>;
    if (channels.length === 0) continue;

    const channelId = channels[0].id;
    const msgResp = await apiFetch(
      `https://graph.microsoft.com/v1.0/teams/${team.id}/channels/${channelId}/messages`,
      token,
      { $top: String(limit) },
    );
    checkResp(msgResp, "Microsoft Teams API");
    const msgData = await msgResp.json();
    const messages = (msgData.value || []) as Array<Record<string, unknown>>;

    if (messages.length === 0) return `No messages found in ${channelName}.`;

    const formatted = messages.map((msg) => {
      const from = (msg.from as Record<string, unknown>)?.user as Record<string, string> | undefined;
      const body = (msg.body as Record<string, string>)?.content || "";
      const bodyType = (msg.body as Record<string, string>)?.contentType || "text";
      const text = bodyType === "html" ? stripHtml(body) : body;
      return `[${msg.createdDateTime}] ${from?.displayName || "?"}: ${text}`;
    });

    return `${channelName} (${team.displayName}) — last ${messages.length} messages:\n\n${formatted.join("\n")}`;
  }

  return `Channel "${channelName}" not found in any team.`;
}

// ── 8. get_crm_record ───────────────────────────────────────────────────────

async function executeGetCrmRecord(
  connectorId: string,
  config: ConnectorConfig,
  provider: string,
  args: Record<string, unknown>,
): Promise<string> {
  const recordId = args.recordId as string | undefined;
  const recordType = (args.recordType as string) || "contact";
  const searchName = args.searchName as string | undefined;
  if (!recordId && !searchName) return "Either recordId or searchName is required.";

  const token = await getAccessToken(connectorId, config, provider);

  if (provider === "hubspot") {
    const objectType = recordType === "company" ? "companies"
      : recordType === "deal" ? "deals"
      : "contacts";

    let id = recordId;
    if (!id && searchName) {
      // Search by name
      const searchResp = await fetch(
        `https://api.hubapi.com/crm/v3/objects/${objectType}/search`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filterGroups: [{
              filters: [{
                propertyName: recordType === "contact" ? "email" : "name",
                operator: "CONTAINS_TOKEN",
                value: searchName,
              }],
            }],
            limit: 1,
          }),
        },
      );
      checkResp(searchResp, "HubSpot Search API");
      const searchData = await searchResp.json();
      const results = (searchData.results || []) as Array<Record<string, unknown>>;
      if (results.length === 0) return `No ${recordType} found matching "${searchName}".`;
      id = results[0].id as string;
    }

    // Fetch record with all properties
    const resp = await fetch(
      `https://api.hubapi.com/crm/v3/objects/${objectType}/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    checkResp(resp, "HubSpot API");
    const record = await resp.json();
    const props = (record.properties || {}) as Record<string, string>;

    // Format as structured text
    const lines = [`${recordType.toUpperCase()} — ${props.firstname ? `${props.firstname} ${props.lastname || ""}`.trim() : props.name || id}`];
    lines.push("");
    for (const [key, value] of Object.entries(props)) {
      if (value && key !== "hs_object_id" && !key.startsWith("hs_")) {
        lines.push(`${key}: ${value}`);
      }
    }

    // Fetch associations
    const assocResp = await fetch(
      `https://api.hubapi.com/crm/v4/objects/${objectType}/${id}/associations`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (assocResp.ok) {
      const assocData = await assocResp.json();
      const assocs = (assocData.results || []) as Array<Record<string, unknown>>;
      if (assocs.length > 0) {
        lines.push("");
        lines.push("Associations:");
        for (const a of assocs.slice(0, 20)) {
          lines.push(`  • ${a.toObjectType}: ${a.toObjectId}`);
        }
      }
    }

    return lines.join("\n");
  }

  return `CRM provider "${provider}" is not yet supported for direct reads.`;
}
