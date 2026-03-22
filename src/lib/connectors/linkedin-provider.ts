import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const LINKEDIN_API = "https://api.linkedin.com/v2";

// ── Helpers ──────────────────────────────────────────────

function linkedinFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const accessToken = config.access_token as string;

  return fetch(`${LINKEDIN_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

// ── Provider Implementation ──────────────────────────────

export const linkedinProvider: ConnectorProvider = {
  id: "linkedin",
  name: "LinkedIn",

  configSchema: [
    { key: "oauth", label: "LinkedIn Page", type: "oauth", required: true },
  ],

  async testConnection(config) {
    try {
      const resp = await linkedinFetch(config, "me");
      if (!resp.ok) {
        return {
          ok: false,
          error: `LinkedIn API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const orgId = config.organization_id as string;
    if (!orgId) return;

    // ── Page posts → content + activity ───────────────────
    const postsResp = await linkedinFetch(
      config,
      `ugcPosts?q=authors&authors=List(urn:li:organization:${orgId})&sortBy=LAST_MODIFIED&count=50`,
    );

    if (postsResp.ok) {
      const postsData = await postsResp.json();
      const posts = postsData.elements || [];

      for (const post of posts) {
        const createdTime = post.created?.time;

        // Filter by since if provided
        if (since && createdTime && createdTime < since.getTime()) {
          continue;
        }

        const text =
          post.specificContent?.["com.linkedin.ugc.ShareContent"]
            ?.shareCommentary?.text || "";

        yield {
          kind: "content" as const,
          data: {
            sourceType: "linkedin_post",
            sourceId: post.id || String(createdTime),
            content: text,
            metadata: {
              createdAt: createdTime,
              author: post.created?.actor,
            },
          },
        };

        yield {
          kind: "activity" as const,
          data: {
            signalType: "linkedin_post_published",
            metadata: { postId: post.id },
            occurredAt: new Date(createdTime || Date.now()),
          },
        };
      }
    }

    // ── Follower stats → activity ─────────────────────────
    const statsResp = await linkedinFetch(
      config,
      `organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${orgId}`,
    );

    if (statsResp.ok) {
      const statsData = await statsResp.json();
      const elements = statsData.elements || [];
      if (elements.length > 0) {
        const counts = elements[0].followerCounts || {};
        const totalFollowers =
          (counts.organicFollowerCount || 0) + (counts.paidFollowerCount || 0);

        yield {
          kind: "activity" as const,
          data: {
            signalType: "linkedin_follower_count",
            metadata: { totalFollowers },
            occurredAt: new Date(),
          },
        };
      }
    }
  },

  writeCapabilities: [
    { slug: "create_post", name: "Create Post", description: "Publish a post to a LinkedIn organization page", inputSchema: { type: "object", properties: { text: { type: "string" }, visibility: { type: "string", enum: ["PUBLIC", "CONNECTIONS"] } }, required: ["text", "visibility"] } },
    { slug: "delete_post", name: "Delete Post", description: "Delete a post from LinkedIn", inputSchema: { type: "object", properties: { postId: { type: "string" } }, required: ["postId"] } },
  ],

  async executeAction(config, actionId, params) {
    try {
      const orgId = config.organization_id as string;

      switch (actionId) {
        case "create_post": {
          if (!params.text) return { success: false, error: "text is required" };
          if (!params.visibility) return { success: false, error: "visibility is required" };
          if (!orgId) return { success: false, error: "organization_id not configured" };

          const resp = await linkedinFetch(config, "rest/posts", {
            method: "POST",
            headers: { "LinkedIn-Version": "202401" },
            body: JSON.stringify({
              author: `urn:li:organization:${orgId}`,
              commentary: params.text,
              visibility: params.visibility,
              distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
              lifecycleState: "PUBLISHED",
            }),
          });

          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create post failed (${resp.status}): ${err}` };
          }

          // LinkedIn returns 201 with x-restli-id header for the post ID
          const postId = resp.headers.get("x-restli-id") || "";
          return { success: true, result: { postId, visibility: params.visibility } };
        }

        case "delete_post": {
          if (!params.postId) return { success: false, error: "postId is required" };

          const resp = await linkedinFetch(config, `rest/posts/${encodeURIComponent(params.postId as string)}`, {
            method: "DELETE",
            headers: { "LinkedIn-Version": "202401" },
          });

          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Delete post failed (${resp.status}): ${err}` };
          }

          return { success: true, result: { postId: params.postId, deleted: true } };
        }

        default:
          return { success: false, error: `Unknown action: ${actionId}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      { name: "create_post", description: "Publish a post to a LinkedIn organization page", inputSchema: { text: { type: "string", required: true }, visibility: { type: "string", required: true } }, sideEffects: ["Post published on LinkedIn page"] },
      { name: "delete_post", description: "Delete a LinkedIn post", inputSchema: { postId: { type: "string", required: true } }, sideEffects: ["Post removed from LinkedIn"] },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
