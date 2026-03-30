import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

const API_BASE = "https://app.asana.com/api/1.0";

async function refreshAsanaToken(
  config: ConnectorConfig,
): Promise<ConnectorConfig> {
  const resp = await fetch("https://app.asana.com/-/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ASANA_CLIENT_ID!,
      client_secret: process.env.ASANA_CLIENT_SECRET!,
      refresh_token: config.refresh_token as string,
    }),
  });

  if (!resp.ok) throw new Error(`Asana token refresh failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  if (data.refresh_token) config.refresh_token = data.refresh_token;
  config.token_expiry = Date.now() + (data.expires_in ?? 3600) * 1000;

  return config;
}

async function asanaFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const expiry = config.token_expiry as number;
  if (expiry < Date.now() + 5 * 60 * 1000) {
    await refreshAsanaToken(config);
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.access_token as string}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function* paginateAsana<T>(
  config: ConnectorConfig,
  path: string,
): AsyncGenerator<T> {
  const separator = path.includes("?") ? "&" : "?";
  let url = `${path}${separator}limit=100`;

  while (url) {
    const resp = await asanaFetch(config, url);
    if (!resp.ok) break;
    const body = await resp.json();

    for (const item of body.data ?? []) {
      yield item as T;
    }

    url = body.next_page?.offset
      ? `${path}${separator}limit=100&offset=${body.next_page.offset}`
      : "";
  }
}

// ── Provider Implementation ──────────────────────────────

export const asanaProvider: ConnectorProvider = {
  id: "asana",
  name: "Asana",

  configSchema: [
    { key: "oauth", label: "Asana Account", type: "oauth" as const, required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_task",
      name: "Create Task",
      description: "Creates a new task in an Asana project",
      inputSchema: {
        type: "object",
        properties: {
          projectGid: { type: "string" },
          name: { type: "string" },
          assignee: { type: "string" },
          dueOn: { type: "string" },
          notes: { type: "string" },
        },
        required: ["projectGid", "name"],
      },
    },
    {
      slug: "complete_task",
      name: "Complete Task",
      description: "Marks an Asana task as completed",
      inputSchema: {
        type: "object",
        properties: {
          taskGid: { type: "string" },
        },
        required: ["taskGid"],
      },
    },
    {
      slug: "update_task",
      name: "Update Task",
      description: "Updates fields on an existing Asana task",
      inputSchema: {
        type: "object",
        properties: {
          taskGid: { type: "string" },
          fields: { type: "object" },
        },
        required: ["taskGid", "fields"],
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await asanaFetch(config, "/users/me");
      if (!resp.ok) return { ok: false, error: `Asana API ${resp.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const workspaceGid = config.workspace_gid as string;

    // ── Projects ────────────────────────────────────────
    type AsanaProject = {
      gid: string;
      name: string;
      owner?: { name?: string };
      due_on?: string;
      created_at?: string;
      current_status_update?: { status_type?: string };
    };

    const projects: AsanaProject[] = [];

    for await (const project of paginateAsana<AsanaProject>(
      config,
      `/projects?workspace=${workspaceGid}&opt_fields=name,owner.name,due_on,created_at,current_status_update.status_type`,
    )) {
      projects.push(project);

      yield {
        kind: "event" as const,
        data: {
          eventType: "project.synced",
          payload: {
            id: project.gid,
            name: project.name,
            status: project.current_status_update?.status_type || "active",
            owner: project.owner?.name,
            dueDate: project.due_on,
            createdDate: project.created_at,
          },
        },
      };
    }

    // ── Tasks (per project) ─────────────────────────────
    type AsanaTask = {
      gid: string;
      name: string;
      assignee?: { name?: string };
      due_on?: string;
      completed: boolean;
      created_at?: string;
      memberships?: Array<{ section?: { name?: string } }>;
      tags?: Array<{ name: string }>;
    };

    for (const project of projects) {
      let taskPath = `/tasks?project=${project.gid}&opt_fields=name,assignee.name,due_on,completed,created_at,memberships.section.name,tags.name`;
      if (since) {
        taskPath += `&modified_since=${since.toISOString()}`;
      }

      for await (const task of paginateAsana<AsanaTask>(config, taskPath)) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "task.synced",
            payload: {
              id: task.gid,
              name: task.name,
              status: task.completed ? "completed" : "open",
              assignee: task.assignee?.name,
              dueDate: task.due_on,
              projectName: project.name,
              labels: task.tags?.map((t) => t.name).join(","),
              createdDate: task.created_at,
            },
          },
        };
      }
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_task": {
          if (!params.projectGid) return { success: false, error: "projectGid is required" };
          if (!params.name) return { success: false, error: "name is required" };

          const body: Record<string, unknown> = {
            projects: [params.projectGid],
            name: params.name,
          };
          if (params.assignee) body.assignee = params.assignee;
          if (params.dueOn) body.due_on = params.dueOn;
          if (params.notes) body.notes = params.notes;

          const resp = await asanaFetch(config, "/tasks", {
            method: "POST",
            body: JSON.stringify({ data: body }),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            return { success: false, error: `Create task failed (${resp.status}): ${errText}` };
          }
          const result = await resp.json();
          return { success: true, result: result.data };
        }

        case "complete_task": {
          if (!params.taskGid) return { success: false, error: "taskGid is required" };

          const resp = await asanaFetch(config, `/tasks/${params.taskGid}`, {
            method: "PUT",
            body: JSON.stringify({ data: { completed: true } }),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            return { success: false, error: `Complete task failed (${resp.status}): ${errText}` };
          }
          const result = await resp.json();
          return { success: true, result: result.data };
        }

        case "update_task": {
          if (!params.taskGid) return { success: false, error: "taskGid is required" };
          if (!params.fields) return { success: false, error: "fields is required" };

          const resp = await asanaFetch(config, `/tasks/${params.taskGid}`, {
            method: "PUT",
            body: JSON.stringify({ data: params.fields }),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            return { success: false, error: `Update task failed (${resp.status}): ${errText}` };
          }
          const result = await resp.json();
          return { success: true, result: result.data };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_task",
        description: "Create a new task in an Asana project",
        inputSchema: { projectGid: "string", name: "string", assignee: "string?", dueOn: "string?", notes: "string?" },
        sideEffects: ["Task created in Asana"],
      },
      {
        name: "complete_task",
        description: "Mark an Asana task as completed",
        inputSchema: { taskGid: "string" },
        sideEffects: ["Task marked as completed in Asana"],
      },
      {
        name: "update_task",
        description: "Update fields on an existing Asana task",
        inputSchema: { taskGid: "string", fields: "object" },
        sideEffects: ["Task modified in Asana"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
