import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const JIRA_API_BASE = "https://api.atlassian.com/ex/jira";

// ── Token Refresh ───────────────────────────────────────

async function refreshJiraToken(
  config: ConnectorConfig
): Promise<ConnectorConfig> {
  const expiry = config.token_expiry as number | undefined;
  if (expiry && Date.now() < expiry - 60_000) {
    return config; // still valid (with 1-min buffer)
  }

  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("JIRA_CLIENT_ID / JIRA_CLIENT_SECRET not configured");
  }

  const resp = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.refresh_token as string,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Jira token refresh failed (${resp.status}): ${err}`);
  }

  const tokens = await resp.json();
  return {
    ...config,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: Date.now() + tokens.expires_in * 1000,
  };
}

// ── Helpers ──────────────────────────────────────────────

function buildBaseUrl(config: ConnectorConfig): string {
  const cloudId = config.cloud_id as string;
  return `${JIRA_API_BASE}/${cloudId}/rest/api/3`;
}

async function jiraFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<{ resp: Response; config: ConnectorConfig }> {
  const freshConfig = await refreshJiraToken(config);
  const baseUrl = buildBaseUrl(freshConfig);
  const accessToken = freshConfig.access_token as string;

  const resp = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  return { resp, config: freshConfig };
}

// ── Provider Implementation ──────────────────────────────

export const jiraProvider: ConnectorProvider = {
  id: "jira",
  name: "Jira",

  configSchema: [
    { key: "oauth", label: "Jira Account", type: "oauth" as const, required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_issue",
      name: "Create Issue",
      description: "Create a new issue in a Jira project",
      inputSchema: {
        projectKey: "string",
        summary: "string",
        issueType: "string? (defaults to Task)",
        assignee: "string? (Atlassian account ID)",
        priority: "string? (e.g. High, Medium, Low)",
        description: "string?",
      },
    },
    {
      slug: "transition_issue",
      name: "Transition Issue",
      description: "Move a Jira issue to a different status via a workflow transition",
      inputSchema: {
        issueKey: "string",
        transitionId: "string",
      },
    },
    {
      slug: "update_issue",
      name: "Update Issue",
      description: "Update fields on an existing Jira issue",
      inputSchema: {
        issueKey: "string",
        fields: "object (Jira field updates)",
      },
    },
  ],

  async testConnection(config) {
    try {
      const { resp } = await jiraFetch(config, "/myself");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Jira API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Sync projects ─────────────────────────────────────
    const { resp: projResp, config: configAfterProjects } = await jiraFetch(
      config,
      "/project/search?maxResults=50"
    );

    let latestConfig = configAfterProjects;

    if (projResp.ok) {
      const projData = await projResp.json();
      const projects = projData.values || [];

      for (const project of projects) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "project.synced",
            payload: {
              id: project.key,
              name: project.name,
              status: project.projectTypeKey,
              owner: project.lead?.displayName,
              createdDate: undefined,
            },
          },
        };
      }
    }

    // ── Sync issues as tasks ──────────────────────────────
    const jql = since
      ? `updated >= "${since.toISOString()}"`
      : "order by updated DESC";

    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const params = new URLSearchParams({
        jql,
        fields: "summary,status,assignee,priority,duedate,project,labels,created",
        startAt: String(startAt),
        maxResults: String(maxResults),
      });

      const { resp: issueResp, config: freshConfig } = await jiraFetch(
        latestConfig,
        `/search?${params.toString()}`
      );
      latestConfig = freshConfig;

      if (!issueResp.ok) break;

      const issueData = await issueResp.json();
      const issues = issueData.issues || [];
      const total = issueData.total as number;

      for (const issue of issues) {
        const fields = issue.fields || {};

        yield {
          kind: "event" as const,
          data: {
            eventType: "task.synced",
            payload: {
              id: issue.key,
              name: fields.summary,
              status: fields.status?.name,
              assignee: fields.assignee?.displayName,
              priority: fields.priority?.name,
              dueDate: fields.duedate,
              projectName: fields.project?.name,
              labels: fields.labels?.join(","),
              createdDate: fields.created,
            },
          },
        };
      }

      startAt += issues.length;
      if (startAt >= total) break;
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_issue",
        description: "Create a new issue in a Jira project",
        inputSchema: {
          projectKey: { type: "string", required: true },
          summary: { type: "string", required: true },
          issueType: { type: "string", required: false },
          assignee: { type: "string", required: false },
          priority: { type: "string", required: false },
          description: { type: "string", required: false },
        },
        sideEffects: ["Issue created in Jira"],
      },
      {
        name: "transition_issue",
        description: "Move a Jira issue to a different status via a workflow transition",
        inputSchema: {
          issueKey: { type: "string", required: true },
          transitionId: { type: "string", required: true },
        },
        sideEffects: ["Issue status changed in Jira"],
      },
      {
        name: "update_issue",
        description: "Update fields on an existing Jira issue",
        inputSchema: {
          issueKey: { type: "string", required: true },
          fields: { type: "object", required: true },
        },
        sideEffects: ["Issue updated in Jira"],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        // ── 1. Create issue ─────────────────────────────────
        case "create_issue": {
          if (!params.projectKey)
            return { success: false, error: "projectKey is required" };
          if (!params.summary)
            return { success: false, error: "summary is required" };

          const projectKey = params.projectKey as string;
          const summary = params.summary as string;
          const issueType = (params.issueType as string) || "Task";
          const assignee = params.assignee as string | undefined;
          const priority = params.priority as string | undefined;
          const description = params.description as string | undefined;

          const fields: Record<string, unknown> = {
            project: { key: projectKey },
            summary,
            issuetype: { name: issueType },
          };
          if (assignee) fields.assignee = { id: assignee };
          if (priority) fields.priority = { name: priority };
          if (description) {
            fields.description = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: description }],
                },
              ],
            };
          }

          const { resp } = await jiraFetch(config, "/issue", {
            method: "POST",
            body: JSON.stringify({ fields }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Create issue failed (${resp.status}): ${err}`,
            };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 2. Transition issue ─────────────────────────────
        case "transition_issue": {
          if (!params.issueKey)
            return { success: false, error: "issueKey is required" };
          if (!params.transitionId)
            return { success: false, error: "transitionId is required" };

          const issueKey = params.issueKey as string;
          const transitionId = params.transitionId as string;

          const { resp } = await jiraFetch(
            config,
            `/issue/${issueKey}/transitions`,
            {
              method: "POST",
              body: JSON.stringify({ transition: { id: transitionId } }),
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Transition issue failed (${resp.status}): ${err}`,
            };
          }
          return { success: true };
        }

        // ── 3. Update issue ─────────────────────────────────
        case "update_issue": {
          if (!params.issueKey)
            return { success: false, error: "issueKey is required" };
          if (!params.fields)
            return { success: false, error: "fields is required" };

          const issueKey = params.issueKey as string;
          const fields = params.fields as Record<string, unknown>;

          const { resp } = await jiraFetch(config, `/issue/${issueKey}`, {
            method: "PUT",
            body: JSON.stringify({ fields }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Update issue failed (${resp.status}): ${err}`,
            };
          }
          return { success: true };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
