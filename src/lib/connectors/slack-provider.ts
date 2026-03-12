import type {
  ConnectorProvider,
  ConnectorConfig,
} from "./types";
import type { SyncYield } from "./sync-types";
import type { EntityInput, ExternalRef } from "@/lib/entity-resolution";

// ── Types ───────────────────────────────────────────────────

type SlackUser = {
  email: string;
  name: string;
};

type SlackChannel = {
  id: string;
  name: string;
  num_members: number;
};

type SlackMessage = {
  ts: string;
  user?: string;
  text: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
};

// ── Token helper ────────────────────────────────────────────

export function getSlackBotToken(config: ConnectorConfig): string {
  return config.bot_token as string;
}

// ── Slack API helpers ───────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function slackApiFetch(
  url: string,
  botToken: string,
  params?: Record<string, string>
): Promise<Record<string, unknown>> {
  const fullUrl = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      fullUrl.searchParams.set(k, v);
    }
  }

  const resp = await fetch(fullUrl.toString(), {
    headers: { Authorization: `Bearer ${botToken}` },
  });

  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get("Retry-After") || "5", 10);
    await sleep(retryAfter * 1000);
    const retry = await fetch(fullUrl.toString(), {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    return await retry.json();
  }

  if (!resp.ok) {
    throw new Error(`Slack API ${url}: ${resp.status} ${resp.statusText}`);
  }

  return await resp.json();
}

// ── User identity mapping ───────────────────────────────────

async function fetchSlackUsers(
  botToken: string
): Promise<Map<string, SlackUser>> {
  const userMap = new Map<string, SlackUser>();
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = { limit: "200" };
    if (cursor) params.cursor = cursor;

    const data = await slackApiFetch(
      "https://slack.com/api/users.list",
      botToken,
      params
    );

    if (!data.ok) {
      console.warn("[slack-sync] users.list failed:", data.error);
      break;
    }

    const members = (data.members || []) as Array<{
      id: string;
      is_bot: boolean;
      deleted: boolean;
      profile: { email?: string; real_name?: string };
    }>;

    for (const member of members) {
      if (member.is_bot || member.deleted) continue;
      const email = member.profile?.email;
      if (!email) continue;
      userMap.set(member.id, {
        email,
        name: member.profile.real_name || email,
      });
    }

    cursor = (data.response_metadata as { next_cursor?: string })?.next_cursor || undefined;
    if (cursor) await sleep(200);
  } while (cursor);

  console.log(`[slack-sync] Mapped ${userMap.size} Slack users to emails`);
  return userMap;
}

// ── Channel listing ─────────────────────────────────────────

async function fetchChannels(
  botToken: string
): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = {
      types: "public_channel",
      limit: "200",
      exclude_archived: "true",
    };
    if (cursor) params.cursor = cursor;

    const data = await slackApiFetch(
      "https://slack.com/api/conversations.list",
      botToken,
      params
    );

    if (!data.ok) {
      console.warn("[slack-sync] conversations.list failed:", data.error);
      break;
    }

    const chans = (data.channels || []) as Array<{
      id: string;
      name: string;
      num_members: number;
    }>;

    for (const ch of chans) {
      channels.push({ id: ch.id, name: ch.name, num_members: ch.num_members });
    }

    cursor = (data.response_metadata as { next_cursor?: string })?.next_cursor || undefined;
    if (cursor) await sleep(200);
  } while (cursor);

  return channels;
}

// ── Thread replies ──────────────────────────────────────────

async function fetchThreadReplies(
  botToken: string,
  channelId: string,
  threadTs: string
): Promise<SlackMessage[]> {
  const replies: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = {
      channel: channelId,
      ts: threadTs,
      limit: "200",
    };
    if (cursor) params.cursor = cursor;

    await sleep(200);
    const data = await slackApiFetch(
      "https://slack.com/api/conversations.replies",
      botToken,
      params
    );

    if (!data.ok) {
      console.warn(`[slack-sync] conversations.replies failed for ${threadTs}:`, data.error);
      break;
    }

    const msgs = (data.messages || []) as SlackMessage[];
    // First message is the parent — skip it in replies
    for (const msg of msgs) {
      if (msg.ts !== threadTs) {
        replies.push(msg);
      }
    }

    cursor = (data.response_metadata as { next_cursor?: string })?.next_cursor || undefined;
  } while (cursor);

  return replies;
}

// ── Entity creation from Slack ──────────────────────────────

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
        sourceSystem: "slack",
        externalId: participant.email,
        properties: {
          email: participant.email,
        },
      },
      { sourceSystem: "slack", externalId: participant.email }
    );

    return entityId;
  } catch (err) {
    console.warn(
      `[slack-sync] Failed to create contact for ${participant.email}:`,
      err
    );
    return null;
  }
}

// ── Message sync ────────────────────────────────────────────

async function* syncSlack(
  botToken: string,
  since: Date | undefined,
  config: ConnectorConfig
): AsyncGenerator<SyncYield> {
  const operatorId = config._operatorId as string | undefined;

  // Import entity creation utilities
  const { ensureHardcodedEntityType } = await import("@/lib/event-materializer");
  const { upsertEntity } = await import("@/lib/entity-resolution");

  // 1. Build user identity map
  const userMap = await fetchSlackUsers(botToken);
  config._slackUserMap = userMap;

  // 2. Entity creation for Slack users not already in org
  if (operatorId) {
    const createdEmails = new Set<string>();
    for (const [, slackUser] of userMap) {
      if (createdEmails.has(slackUser.email)) continue;
      createdEmails.add(slackUser.email);
      await ensureContactEntity(
        operatorId,
        { email: slackUser.email, name: slackUser.name },
        ensureHardcodedEntityType,
        upsertEntity
      );
    }
  }

  // 3. Determine sync window
  const syncAfter = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const oldestTs = String(Math.floor(syncAfter.getTime() / 1000));

  // 4. Fetch channels
  const channels = await fetchChannels(botToken);
  console.log(`[slack-sync] Found ${channels.length} public channels`);

  // 5. Process each channel
  const processedThreads = new Set<string>();

  for (const channel of channels) {
    let cursor: string | undefined;

    do {
      const params: Record<string, string> = {
        channel: channel.id,
        oldest: oldestTs,
        limit: "200",
      };
      if (cursor) params.cursor = cursor;

      await sleep(200);
      const data = await slackApiFetch(
        "https://slack.com/api/conversations.history",
        botToken,
        params
      );

      if (!data.ok) {
        console.warn(`[slack-sync] conversations.history failed for #${channel.name}:`, data.error);
        break;
      }

      const messages = (data.messages || []) as SlackMessage[];

      for (const message of messages) {
        // Skip bot messages unless they have user attribution
        if (message.subtype === "bot_message" && !message.user) continue;

        // Skip subtypes that aren't real messages
        if (message.subtype && message.subtype !== "bot_message") continue;

        const senderUser = message.user ? userMap.get(message.user) : undefined;
        const senderEmail = senderUser?.email;
        const senderName = senderUser?.name || message.user || "unknown";

        // Check if this is a thread parent with replies
        const isThreadParent = message.thread_ts === message.ts && (message.reply_count || 0) > 0;

        if (isThreadParent) {
          // Skip if we already processed this thread
          const threadKey = `${channel.id}:${message.ts}`;
          if (processedThreads.has(threadKey)) continue;
          processedThreads.add(threadKey);

          // Fetch thread replies
          const replies = await fetchThreadReplies(botToken, channel.id, message.ts);

          // Build concatenated thread text
          const threadLines = [`[#${channel.name}] ${senderName}: ${message.text}`];
          const participantEmails: string[] = senderEmail ? [senderEmail] : [];

          for (const reply of replies) {
            const replyUser = reply.user ? userMap.get(reply.user) : undefined;
            const replyName = replyUser?.name || reply.user || "unknown";
            const replyEmail = replyUser?.email;
            threadLines.push(`> ${replyName}: ${reply.text}`);
            if (replyEmail && !participantEmails.includes(replyEmail)) {
              participantEmails.push(replyEmail);
            }
          }

          const messageCount = 1 + replies.length;

          // Content yield for thread
          yield {
            kind: "content" as const,
            data: {
              sourceType: "slack_message",
              sourceId: message.ts,
              content: threadLines.join("\n"),
              metadata: {
                channel: channel.id,
                channelName: channel.name,
                threadTs: message.ts,
                timestamp: message.ts,
                authorEmail: senderEmail,
                isThread: true,
                messageCount,
              },
              participantEmails,
            },
          };

          // Activity yield (one per original message, not per thread)
          yield {
            kind: "activity" as const,
            data: {
              signalType: "slack_message",
              actorEmail: senderEmail,
              targetEmails: [],
              metadata: {
                channel: channel.id,
                channelName: channel.name,
                threadTs: message.ts,
                isThread: true,
                messageCount,
              },
              occurredAt: new Date(parseFloat(message.ts) * 1000),
            },
          };
        } else if (!message.thread_ts || message.thread_ts === message.ts) {
          // Standalone message (no thread)
          const text = `[#${channel.name}] ${senderName}: ${message.text}`;

          // Content yield
          if (message.text && message.text.trim().length > 0) {
            yield {
              kind: "content" as const,
              data: {
                sourceType: "slack_message",
                sourceId: message.ts,
                content: text,
                metadata: {
                  channel: channel.id,
                  channelName: channel.name,
                  threadTs: undefined,
                  timestamp: message.ts,
                  authorEmail: senderEmail,
                  isThread: false,
                  messageCount: 1,
                },
                participantEmails: senderEmail ? [senderEmail] : [],
              },
            };
          }

          // Activity yield
          yield {
            kind: "activity" as const,
            data: {
              signalType: "slack_message",
              actorEmail: senderEmail,
              targetEmails: [],
              metadata: {
                channel: channel.id,
                channelName: channel.name,
                threadTs: undefined,
                isThread: false,
                messageCount: 1,
              },
              occurredAt: new Date(parseFloat(message.ts) * 1000),
            },
          };
        }
        // Messages that are thread replies (thread_ts !== ts) are handled
        // when we process the thread parent — skip them here
      }

      cursor = (data.response_metadata as { next_cursor?: string })?.next_cursor || undefined;
    } while (cursor);
  }

  console.log(
    `[slack-sync] Done. ${channels.length} channels, ${processedThreads.size} threads processed`
  );
}

// ── Write-back helpers ──────────────────────────────────────

async function sendSlackMessage(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channel = params.channel as string;
  const text = params.text as string;

  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text }),
  });

  const data = await resp.json();

  if (!data.ok) {
    return { success: false, error: `Slack postMessage failed: ${data.error}` };
  }

  return {
    success: true,
    result: { ts: data.ts, channel: data.channel },
  };
}

async function reactToMessage(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channel = params.channel as string;
  const timestamp = params.timestamp as string;
  const name = params.name as string; // emoji name without colons

  const resp = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, timestamp, name }),
  });

  const data = await resp.json();

  if (!data.ok) {
    return { success: false, error: `Slack reactions.add failed: ${data.error}` };
  }

  return { success: true, result: { ok: true } };
}

// ── Provider ────────────────────────────────────────────────

export const slackProvider: ConnectorProvider = {
  id: "slack",
  name: "Slack",

  configSchema: [
    { key: "oauth", label: "Slack Workspace", type: "oauth", required: true },
  ],

  async testConnection(config) {
    try {
      const botToken = getSlackBotToken(config);
      const data = await slackApiFetch(
        "https://slack.com/api/auth.test",
        botToken
      );

      if (!data.ok) {
        return { ok: false, error: `Slack auth.test failed: ${data.error}` };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?): AsyncGenerator<SyncYield> {
    const botToken = getSlackBotToken(config);
    yield* syncSlack(botToken, since, config);
  },

  async executeAction(config, actionId, params) {
    const botToken = getSlackBotToken(config);

    switch (actionId) {
      case "send_slack_message":
        return await sendSlackMessage(botToken, params);
      case "react_to_message":
        return await reactToMessage(botToken, params);
      default:
        return { success: false, error: `Unknown action: ${actionId}` };
    }
  },

  async getCapabilities() {
    return [
      {
        name: "send_slack_message",
        description: "Send a message to a Slack channel",
        inputSchema: {
          channel: { type: "string", required: true, description: "Channel ID to post to" },
          text: { type: "string", required: true, description: "Message text" },
        },
        sideEffects: ["Posts a message to a Slack channel"],
      },
      {
        name: "react_to_message",
        description: "Add an emoji reaction to a Slack message",
        inputSchema: {
          channel: { type: "string", required: true, description: "Channel ID" },
          timestamp: { type: "string", required: true, description: "Message timestamp (ts)" },
          name: { type: "string", required: true, description: "Emoji name without colons (e.g. thumbsup)" },
        },
        sideEffects: ["Adds a reaction to a Slack message"],
      },
    ];
  },

  async inferSchema() {
    return [];
  },
};
