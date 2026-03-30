import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

async function mondayQuery(
  config: ConnectorConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<any> {
  const accessToken = config.access_token as string;

  const resp = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!resp.ok) {
    throw new Error(`Monday.com API ${resp.status}: ${resp.statusText}`);
  }

  return resp.json();
}

// ── Provider Implementation ──────────────────────────────

export const mondayProvider: ConnectorProvider = {
  id: "monday",
  name: "Monday.com",

  configSchema: [
    { key: "oauth", label: "Monday.com Account", type: "oauth" as const, required: true },
  ],

  async testConnection(config) {
    try {
      const result = await mondayQuery(config, "{ me { id name } }");
      if (result.errors) {
        return { ok: false, error: result.errors[0]?.message || "Unknown error" };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── 1. Boards → project.synced ──────────────────────────
    const boardsResult = await mondayQuery(
      config,
      "{ boards(limit: 50) { id name state board_kind owner { id name } items_count } }",
    );

    const boards = boardsResult?.data?.boards || [];

    for (const board of boards) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "project.synced",
          payload: {
            id: board.id,
            name: board.name,
            status: board.state,
            owner: board.owner?.name,
            taskCount: board.items_count,
          },
        },
      };

      // ── 2. Items → task.synced (per board) ──────────────────
      const itemsResult = await mondayQuery(
        config,
        `{ boards(ids: [${board.id}]) { items_page(limit: 500) { items { id name state column_values { id text type } group { title } created_at updated_at } } } }`,
      );

      const items =
        itemsResult?.data?.boards?.[0]?.items_page?.items || [];

      for (const item of items) {
        const columns: any[] = item.column_values || [];

        // Extract known column values
        const personCol = columns.find(
          (c: any) => c.type === "person" || c.id === "person",
        );
        const priorityCol = columns.find((c: any) => c.id === "priority");
        const dateCol = columns.find((c: any) => c.id === "date");
        const statusCol = columns.find((c: any) => c.id === "status");

        yield {
          kind: "event" as const,
          data: {
            eventType: "task.synced",
            payload: {
              id: item.id,
              name: item.name,
              status: statusCol?.text || item.state,
              assignee: personCol?.text || undefined,
              priority: priorityCol?.text || undefined,
              dueDate: dateCol?.text || undefined,
              projectName: board.name,
              labels: item.group?.title || undefined,
              createdDate: item.created_at,
            },
          },
        };
      }
    }
  },

  async executeAction(config, actionId, params) {
    switch (actionId) {
      case "create_item": {
        const { boardId, itemName, columnValues } = params as {
          boardId: string;
          itemName: string;
          columnValues?: Record<string, string>;
        };
        if (!boardId) return { success: false, error: "boardId is required" };
        if (!itemName) return { success: false, error: "itemName is required" };

        const colValuesStr = columnValues
          ? `column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"`
          : "";

        const mutation = `mutation { create_item(board_id: ${boardId}, item_name: "${itemName}"${colValuesStr ? ", " + colValuesStr : ""}) { id } }`;
        const result = await mondayQuery(config, mutation);

        if (result.errors) {
          return { success: false, error: result.errors[0]?.message || "Create item failed" };
        }
        return { success: true, result: result.data?.create_item };
      }

      case "update_item_status": {
        const { itemId, boardId, statusLabel } = params as {
          itemId: string;
          boardId: string;
          statusLabel: string;
        };
        if (!itemId) return { success: false, error: "itemId is required" };
        if (!boardId) return { success: false, error: "boardId is required" };
        if (!statusLabel) return { success: false, error: "statusLabel is required" };

        const valueStr = JSON.stringify({ label: statusLabel }).replace(/"/g, '\\"');
        const mutation = `mutation { change_column_value(board_id: ${boardId}, item_id: ${itemId}, column_id: "status", value: "${valueStr}") { id } }`;
        const result = await mondayQuery(config, mutation);

        if (result.errors) {
          return { success: false, error: result.errors[0]?.message || "Update status failed" };
        }
        return { success: true, result: result.data?.change_column_value };
      }

      default:
        return { success: false, error: `Unknown action: ${actionId}` };
    }
  },

  writeCapabilities: [
    {
      slug: "create_item",
      name: "Create Item",
      description: "Create a new item on a Monday.com board",
      inputSchema: {
        type: "object",
        properties: {
          boardId: { type: "string" },
          itemName: { type: "string" },
          columnValues: { type: "object" },
        },
        required: ["boardId", "itemName"],
      },
    },
    {
      slug: "update_item_status",
      name: "Update Item Status",
      description: "Update the status column of a Monday.com item",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string" },
          boardId: { type: "string" },
          statusLabel: { type: "string" },
        },
        required: ["itemId", "boardId", "statusLabel"],
      },
    },
  ],

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_item",
        description: "Create a new item on a Monday.com board",
        inputSchema: {
          boardId: { type: "string", required: true },
          itemName: { type: "string", required: true },
          columnValues: { type: "object", required: false },
        },
        sideEffects: ["Creates a new item on the specified Monday.com board"],
      },
      {
        name: "update_item_status",
        description: "Update the status column of a Monday.com item",
        inputSchema: {
          itemId: { type: "string", required: true },
          boardId: { type: "string", required: true },
          statusLabel: { type: "string", required: true },
        },
        sideEffects: ["Changes the status of an item on Monday.com"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
