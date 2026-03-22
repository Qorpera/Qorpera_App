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

function getSlackBotToken(config: ConnectorConfig): string {
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
  let text = params.text as string;
  const isAiGenerated = params.isAiGenerated as boolean | undefined;

  // EU AI Act Article 50: disclose AI-generated content
  if (isAiGenerated) {
    text = `🤖 [AI] ${text}`;
  }

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

// ── New write-back helpers ───────────────────────────────────

async function replyInThread(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  const threadTs = params.threadTs as string;
  let text = params.text as string;
  const isAiGenerated = params.isAiGenerated as boolean | undefined;

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!threadTs) return { success: false, error: "threadTs is required" };
  if (!text) return { success: false, error: "text is required" };

  if (isAiGenerated) {
    text = `🤖 [AI] ${text}`;
  }

  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, text, thread_ts: threadTs }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack chat.postMessage (thread) failed: ${data.error}` };
  }

  return { success: true, result: { ts: data.ts, channel: data.channel, thread_ts: threadTs } };
}

async function pinMessage(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  const messageTs = params.messageTs as string;

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!messageTs) return { success: false, error: "messageTs is required" };

  const resp = await fetch("https://slack.com/api/pins.add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, timestamp: messageTs }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack pins.add failed: ${data.error}` };
  }

  return { success: true, result: { ok: true } };
}

async function unpinMessage(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  const messageTs = params.messageTs as string;

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!messageTs) return { success: false, error: "messageTs is required" };

  const resp = await fetch("https://slack.com/api/pins.remove", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, timestamp: messageTs }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack pins.remove failed: ${data.error}` };
  }

  return { success: true, result: { ok: true } };
}

async function setChannelTopic(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  let topic = params.topic as string;

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!topic) return { success: false, error: "topic is required" };

  topic = topic.slice(0, 250);

  const resp = await fetch("https://slack.com/api/conversations.setTopic", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, topic }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack conversations.setTopic failed: ${data.error}` };
  }

  return { success: true, result: { topic: (data.channel as Record<string, unknown>)?.topic } };
}

async function setChannelPurpose(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  let purpose = params.purpose as string;

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!purpose) return { success: false, error: "purpose is required" };

  purpose = purpose.slice(0, 250);

  const resp = await fetch("https://slack.com/api/conversations.setPurpose", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, purpose }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack conversations.setPurpose failed: ${data.error}` };
  }

  return { success: true, result: { purpose: (data.channel as Record<string, unknown>)?.purpose } };
}

async function createChannel(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  let name = params.name as string;
  const isPrivate = (params.isPrivate as boolean) || false;

  if (!name) return { success: false, error: "name is required" };

  // Sanitize: lowercase, replace spaces with hyphens, truncate to 80 chars
  name = name.toLowerCase().replace(/\s+/g, "-").slice(0, 80);

  const resp = await fetch("https://slack.com/api/conversations.create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, is_private: isPrivate }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack conversations.create failed: ${data.error}` };
  }

  const ch = data.channel as Record<string, unknown>;
  return { success: true, result: { id: ch?.id, name: ch?.name } };
}

async function inviteToChannel(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  const userIds = params.userIds as string[];

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return { success: false, error: "userIds (string[]) is required" };
  }

  const resp = await fetch("https://slack.com/api/conversations.invite", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, users: userIds.join(",") }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack conversations.invite failed: ${data.error}` };
  }

  return { success: true, result: { channel: (data.channel as Record<string, unknown>)?.id } };
}

async function addReaction(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  const messageTs = params.messageTs as string;
  let emoji = params.emoji as string;

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!messageTs) return { success: false, error: "messageTs is required" };
  if (!emoji) return { success: false, error: "emoji is required" };

  emoji = emoji.replace(/:/g, "");

  const resp = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, timestamp: messageTs, name: emoji }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack reactions.add failed: ${data.error}` };
  }

  return { success: true, result: { ok: true } };
}

async function removeReaction(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  const messageTs = params.messageTs as string;
  let emoji = params.emoji as string;

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!messageTs) return { success: false, error: "messageTs is required" };
  if (!emoji) return { success: false, error: "emoji is required" };

  emoji = emoji.replace(/:/g, "");

  const resp = await fetch("https://slack.com/api/reactions.remove", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, timestamp: messageTs, name: emoji }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack reactions.remove failed: ${data.error}` };
  }

  return { success: true, result: { ok: true } };
}

async function uploadFile(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const channelId = params.channelId as string;
  const filename = params.filename as string;
  const content = params.content as string; // base64-encoded
  const title = params.title as string | undefined;
  const comment = params.comment as string | undefined;

  if (!channelId) return { success: false, error: "channelId is required" };
  if (!filename) return { success: false, error: "filename is required" };
  if (!content) return { success: false, error: "content (base64) is required" };

  const fileBuffer = Buffer.from(content, "base64");

  // 10 MB limit
  if (fileBuffer.length > 10 * 1024 * 1024) {
    return { success: false, error: "File exceeds 10 MB limit" };
  }

  const formData = new FormData();
  formData.append("channels", channelId);
  formData.append("filename", filename);
  formData.append("file", new Blob([fileBuffer]), filename);
  if (title) formData.append("title", title);
  if (comment) formData.append("initial_comment", comment);

  const resp = await fetch("https://slack.com/api/files.upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}` },
    body: formData,
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack files.upload failed: ${data.error}` };
  }

  const file = data.file as Record<string, unknown>;
  return { success: true, result: { id: file?.id, name: file?.name } };
}

async function setReminder(
  botToken: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  const text = params.text as string;
  const time = params.time as string;

  if (!text) return { success: false, error: "text is required" };
  if (!time) return { success: false, error: "time is required" };

  const resp = await fetch("https://slack.com/api/reminders.add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, time }),
  });

  const data = await resp.json();
  if (!data.ok) {
    return { success: false, error: `Slack reminders.add failed: ${data.error}` };
  }

  const reminder = data.reminder as Record<string, unknown>;
  return { success: true, result: { id: reminder?.id, text: reminder?.text } };
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
      case "reply_in_thread":
        return await replyInThread(botToken, params);
      case "pin_message":
        return await pinMessage(botToken, params);
      case "unpin_message":
        return await unpinMessage(botToken, params);
      case "set_channel_topic":
        return await setChannelTopic(botToken, params);
      case "set_channel_purpose":
        return await setChannelPurpose(botToken, params);
      case "create_channel":
        return await createChannel(botToken, params);
      case "invite_to_channel":
        return await inviteToChannel(botToken, params);
      case "add_reaction":
        return await addReaction(botToken, params);
      case "remove_reaction":
        return await removeReaction(botToken, params);
      case "upload_file":
        return await uploadFile(botToken, params);
      case "set_reminder":
        return await setReminder(botToken, params);
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
      {
        name: "reply_in_thread",
        description: "Reply to a message thread in a Slack channel",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          threadTs: { type: "string", required: true, description: "Thread parent message timestamp" },
          text: { type: "string", required: true, description: "Reply text" },
          isAiGenerated: { type: "boolean", required: false, description: "If true, prepends AI disclosure" },
        },
        sideEffects: ["Posts a threaded reply in a Slack channel"],
      },
      {
        name: "pin_message",
        description: "Pin a message in a Slack channel",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          messageTs: { type: "string", required: true, description: "Message timestamp to pin" },
        },
        sideEffects: ["Pins a message in a Slack channel"],
      },
      {
        name: "unpin_message",
        description: "Unpin a message in a Slack channel",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          messageTs: { type: "string", required: true, description: "Message timestamp to unpin" },
        },
        sideEffects: ["Unpins a message in a Slack channel"],
      },
      {
        name: "set_channel_topic",
        description: "Set the topic of a Slack channel",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          topic: { type: "string", required: true, description: "Channel topic (max 250 chars)" },
        },
        sideEffects: ["Changes the topic of a Slack channel"],
      },
      {
        name: "set_channel_purpose",
        description: "Set the purpose of a Slack channel",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          purpose: { type: "string", required: true, description: "Channel purpose (max 250 chars)" },
        },
        sideEffects: ["Changes the purpose of a Slack channel"],
      },
      {
        name: "create_channel",
        description: "Create a new Slack channel",
        inputSchema: {
          name: { type: "string", required: true, description: "Channel name (auto-sanitized)" },
          isPrivate: { type: "boolean", required: false, description: "Create as private channel (default false)" },
        },
        sideEffects: ["Creates a new Slack channel in the workspace"],
      },
      {
        name: "invite_to_channel",
        description: "Invite users to a Slack channel",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          userIds: { type: "array", required: true, description: "Array of user IDs to invite" },
        },
        sideEffects: ["Invites users to a Slack channel"],
      },
      {
        name: "add_reaction",
        description: "Add an emoji reaction to a Slack message",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          messageTs: { type: "string", required: true, description: "Message timestamp" },
          emoji: { type: "string", required: true, description: "Emoji name (colons stripped automatically)" },
        },
        sideEffects: ["Adds a reaction to a Slack message"],
      },
      {
        name: "remove_reaction",
        description: "Remove an emoji reaction from a Slack message",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          messageTs: { type: "string", required: true, description: "Message timestamp" },
          emoji: { type: "string", required: true, description: "Emoji name (colons stripped automatically)" },
        },
        sideEffects: ["Removes a reaction from a Slack message"],
      },
      {
        name: "upload_file",
        description: "Upload a file to a Slack channel",
        inputSchema: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          filename: { type: "string", required: true, description: "File name" },
          content: { type: "string", required: true, description: "Base64-encoded file content (max 10 MB)" },
          title: { type: "string", required: false, description: "File title" },
          comment: { type: "string", required: false, description: "Initial comment with the file" },
        },
        sideEffects: ["Uploads a file to a Slack channel"],
      },
      {
        name: "set_reminder",
        description: "Set a Slack reminder",
        inputSchema: {
          text: { type: "string", required: true, description: "Reminder text" },
          time: { type: "string", required: true, description: "Unix timestamp or natural language time" },
        },
        sideEffects: ["Creates a Slack reminder"],
      },
    ];
  },

  writeCapabilities: [
    { slug: "reply_in_thread", name: "Reply in Thread", description: "Reply to a message thread in a Slack channel", inputSchema: { type: "object", properties: { channelId: { type: "string" }, threadTs: { type: "string" }, text: { type: "string" }, isAiGenerated: { type: "boolean" } }, required: ["channelId", "threadTs", "text"] } },
    { slug: "pin_message", name: "Pin Message", description: "Pin a message in a Slack channel", inputSchema: { type: "object", properties: { channelId: { type: "string" }, messageTs: { type: "string" } }, required: ["channelId", "messageTs"] } },
    { slug: "unpin_message", name: "Unpin Message", description: "Unpin a message in a Slack channel", inputSchema: { type: "object", properties: { channelId: { type: "string" }, messageTs: { type: "string" } }, required: ["channelId", "messageTs"] } },
    { slug: "set_channel_topic", name: "Set Channel Topic", description: "Set the topic of a Slack channel", inputSchema: { type: "object", properties: { channelId: { type: "string" }, topic: { type: "string" } }, required: ["channelId", "topic"] } },
    { slug: "set_channel_purpose", name: "Set Channel Purpose", description: "Set the purpose of a Slack channel", inputSchema: { type: "object", properties: { channelId: { type: "string" }, purpose: { type: "string" } }, required: ["channelId", "purpose"] } },
    { slug: "create_channel", name: "Create Channel", description: "Create a new Slack channel", inputSchema: { type: "object", properties: { name: { type: "string" }, isPrivate: { type: "boolean" } }, required: ["name"] } },
    { slug: "invite_to_channel", name: "Invite to Channel", description: "Invite users to a Slack channel", inputSchema: { type: "object", properties: { channelId: { type: "string" }, userIds: { type: "array", items: { type: "string" } } }, required: ["channelId", "userIds"] } },
    { slug: "add_reaction", name: "Add Reaction", description: "Add an emoji reaction to a Slack message", inputSchema: { type: "object", properties: { channelId: { type: "string" }, messageTs: { type: "string" }, emoji: { type: "string" } }, required: ["channelId", "messageTs", "emoji"] } },
    { slug: "remove_reaction", name: "Remove Reaction", description: "Remove an emoji reaction from a Slack message", inputSchema: { type: "object", properties: { channelId: { type: "string" }, messageTs: { type: "string" }, emoji: { type: "string" } }, required: ["channelId", "messageTs", "emoji"] } },
    { slug: "upload_file", name: "Upload File", description: "Upload a file to a Slack channel", inputSchema: { type: "object", properties: { channelId: { type: "string" }, filename: { type: "string" }, content: { type: "string" }, title: { type: "string" }, comment: { type: "string" } }, required: ["channelId", "filename", "content"] } },
    { slug: "set_reminder", name: "Set Reminder", description: "Set a Slack reminder", inputSchema: { type: "object", properties: { text: { type: "string" }, time: { type: "string" } }, required: ["text", "time"] } },
  ],

  async inferSchema() {
    return [];
  },
};
