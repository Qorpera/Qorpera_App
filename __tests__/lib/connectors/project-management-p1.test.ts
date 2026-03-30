import { describe, test, expect, vi, beforeEach } from "vitest";
import { mondayProvider } from "@/lib/connectors/monday-provider";
import { asanaProvider } from "@/lib/connectors/asana-provider";
import { jiraProvider } from "@/lib/connectors/jira-provider";

async function collectEvents(gen: AsyncGenerator<any>, max = 50): Promise<any[]> {
  const events: any[] = [];
  for await (const ev of gen) {
    events.push(ev);
    if (events.length >= max) break;
  }
  return events;
}

// ── Monday.com ────────────────────────────────────────────

describe("Monday.com connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema is OAuth-only", () => {
    expect(mondayProvider.configSchema).toHaveLength(1);
    expect(mondayProvider.configSchema[0].type).toBe("oauth");
  });

  test("sync yields project.synced from boards", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          data: {
            boards: [
              { id: "b1", name: "Sprint Board", state: "active", board_kind: "public", owner: { id: "u1", name: "Alice" }, items_count: 42 },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const config = { access_token: "tok" };
    const events = await collectEvents(mondayProvider.sync(config));

    const project = events.find(
      (e) => e.kind === "event" && e.data.eventType === "project.synced",
    );
    expect(project).toBeDefined();
    expect(project.data.payload.name).toBe("Sprint Board");
    expect(project.data.payload.owner).toBe("Alice");
  });

  test("sync yields task.synced from items", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Boards query
        return new Response(
          JSON.stringify({
            data: {
              boards: [
                { id: "b1", name: "Sprint Board", state: "active", owner: { name: "Alice" }, items_count: 1 },
              ],
            },
          }),
          { status: 200 },
        );
      }
      // Items query for board b1
      return new Response(
        JSON.stringify({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: "i1",
                      name: "Fix login bug",
                      state: "active",
                      column_values: [
                        { id: "person", text: "Bob", type: "person" },
                        { id: "status", text: "Working on it", type: "status" },
                        { id: "date", text: "2026-04-01", type: "date" },
                        { id: "priority", text: "High", type: "priority" },
                      ],
                      group: { title: "Sprint 5" },
                      created_at: "2026-03-20",
                    },
                  ],
                },
              },
            ],
          },
        }),
        { status: 200 },
      );
    });

    const config = { access_token: "tok" };
    const events = await collectEvents(mondayProvider.sync(config));

    const task = events.find(
      (e) => e.kind === "event" && e.data.eventType === "task.synced",
    );
    expect(task).toBeDefined();
    expect(task.data.payload.name).toBe("Fix login bug");
  });

  test("GraphQL mutation in executeAction", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({ data: { create_item: { id: "new-1" } } }),
        { status: 200 },
      ),
    );

    const config = { access_token: "tok" };
    const result = await mondayProvider.executeAction!(config, "create_item", {
      boardId: "b1",
      itemName: "New task",
    });

    expect(result.success).toBe(true);
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as any).body as string);
    expect(body.query).toContain("create_item");
  });

  test("writeCapabilities declared", () => {
    expect(mondayProvider.writeCapabilities).toBeDefined();
    const slugs = mondayProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_item");
    expect(slugs).toContain("update_item_status");
  });
});

// ── Asana ─────────────────────────────────────────────────

describe("Asana connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema is OAuth-only", () => {
    expect(asanaProvider.configSchema).toHaveLength(1);
    expect(asanaProvider.configSchema[0].type).toBe("oauth");
  });

  test("sync yields project.synced and task.synced", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Projects
        return new Response(
          JSON.stringify({
            data: [
              { gid: "p1", name: "Marketing Q2", owner: { name: "Carol" }, due_on: "2026-06-30", created_at: "2026-01-01", current_status_update: { status_type: "on_track" } },
            ],
            next_page: null,
          }),
          { status: 200 },
        );
      }
      if (callNum === 2) {
        // Tasks for project p1
        return new Response(
          JSON.stringify({
            data: [
              { gid: "t1", name: "Write blog post", assignee: { name: "Dave" }, due_on: "2026-04-15", completed: false, created_at: "2026-03-01", tags: [{ name: "content" }] },
            ],
            next_page: null,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: [], next_page: null }), { status: 200 });
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      workspace_gid: "w1",
    };
    const events = await collectEvents(asanaProvider.sync(config));

    const project = events.find(
      (e) => e.kind === "event" && e.data.eventType === "project.synced",
    );
    expect(project).toBeDefined();
    expect(project.data.payload.name).toBe("Marketing Q2");

    const task = events.find(
      (e) => e.kind === "event" && e.data.eventType === "task.synced",
    );
    expect(task).toBeDefined();
    expect(task.data.payload.assignee).toBe("Dave");
    expect(task.data.payload.status).toBe("open");
  });

  test("complete_task calls PUT with completed: true", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    );

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
    };
    const result = await asanaProvider.executeAction!(config, "complete_task", {
      taskGid: "t1",
    });

    expect(result.success).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    const urlStr = typeof url === "string" ? url : url.toString();
    expect(urlStr).toContain("/tasks/t1");
    expect((init as any).method).toBe("PUT");
    const body = JSON.parse((init as any).body as string);
    expect(body.data.completed).toBe(true);
  });

  test("cursor pagination follows next_page", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Projects page 1
        return new Response(
          JSON.stringify({
            data: [{ gid: "p1", name: "Project 1" }],
            next_page: { offset: "cursor-1" },
          }),
          { status: 200 },
        );
      }
      if (callNum === 2) {
        // Projects page 2
        return new Response(
          JSON.stringify({
            data: [{ gid: "p2", name: "Project 2" }],
            next_page: null,
          }),
          { status: 200 },
        );
      }
      // Tasks (empty for both projects)
      return new Response(JSON.stringify({ data: [], next_page: null }), { status: 200 });
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      workspace_gid: "w1",
    };
    const events = await collectEvents(asanaProvider.sync(config));

    const projects = events.filter(
      (e) => e.kind === "event" && e.data.eventType === "project.synced",
    );
    expect(projects).toHaveLength(2);
  });

  test("writeCapabilities declared", () => {
    expect(asanaProvider.writeCapabilities).toBeDefined();
    const slugs = asanaProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_task");
    expect(slugs).toContain("complete_task");
    expect(slugs).toContain("update_task");
  });
});

// ── Jira ──────────────────────────────────────────────────

describe("Jira connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema is OAuth-only", () => {
    expect(jiraProvider.configSchema).toHaveLength(1);
    expect(jiraProvider.configSchema[0].type).toBe("oauth");
  });

  test("sync yields task.synced with JQL-based incremental filter", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      callNum++;
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/project/search")) {
        return new Response(
          JSON.stringify({
            values: [
              { key: "ENG", name: "Engineering", projectTypeKey: "software", lead: { displayName: "Eve" } },
            ],
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/search")) {
        // Verify JQL has updated filter
        expect(urlStr).toContain("jql=");
        return new Response(
          JSON.stringify({
            issues: [
              {
                key: "ENG-42",
                fields: {
                  summary: "Fix API timeout",
                  status: { name: "In Progress" },
                  assignee: { displayName: "Frank" },
                  priority: { name: "High" },
                  duedate: "2026-04-10",
                  project: { name: "Engineering" },
                  labels: ["backend", "urgent"],
                  created: "2026-03-15T10:00:00Z",
                },
              },
            ],
            total: 1,
            startAt: 0,
            maxResults: 100,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      cloud_id: "cloud-1",
    };
    const since = new Date("2026-03-01");
    const events = await collectEvents(jiraProvider.sync(config, since));

    const task = events.find(
      (e) => e.kind === "event" && e.data.eventType === "task.synced",
    );
    expect(task).toBeDefined();
    expect(task.data.payload.name).toBe("Fix API timeout");
    expect(task.data.payload.assignee).toBe("Frank");
    expect(task.data.payload.priority).toBe("High");
    expect(task.data.payload.labels).toBe("backend,urgent");
  });

  test("create_issue builds correct fields payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ key: "ENG-99" }), { status: 201 }),
    );

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      cloud_id: "cloud-1",
    };
    const result = await jiraProvider.executeAction!(config, "create_issue", {
      projectKey: "ENG",
      summary: "New feature request",
      priority: "Medium",
    });

    expect(result.success).toBe(true);
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as any).body as string);
    expect(body.fields.project.key).toBe("ENG");
    expect(body.fields.summary).toBe("New feature request");
  });

  test("JQL startAt/maxResults pagination", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      callNum++;
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/project/search")) {
        return new Response(JSON.stringify({ values: [] }), { status: 200 });
      }
      if (urlStr.includes("/search") && urlStr.includes("startAt=0")) {
        return new Response(
          JSON.stringify({
            issues: Array.from({ length: 100 }, (_, i) => ({
              key: `T-${i}`,
              fields: { summary: `Task ${i}`, status: { name: "Open" }, project: { name: "P" }, labels: [], created: "2026-01-01" },
            })),
            total: 150,
            startAt: 0,
            maxResults: 100,
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/search") && urlStr.includes("startAt=100")) {
        return new Response(
          JSON.stringify({
            issues: Array.from({ length: 50 }, (_, i) => ({
              key: `T-${100 + i}`,
              fields: { summary: `Task ${100 + i}`, status: { name: "Open" }, project: { name: "P" }, labels: [], created: "2026-01-01" },
            })),
            total: 150,
            startAt: 100,
            maxResults: 100,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ issues: [], total: 0 }), { status: 200 });
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      cloud_id: "cloud-1",
    };
    const events = await collectEvents(jiraProvider.sync(config), 200);

    const tasks = events.filter(
      (e) => e.kind === "event" && e.data.eventType === "task.synced",
    );
    expect(tasks).toHaveLength(150);
  });

  test("writeCapabilities declared", () => {
    expect(jiraProvider.writeCapabilities).toBeDefined();
    const slugs = jiraProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_issue");
    expect(slugs).toContain("transition_issue");
    expect(slugs).toContain("update_issue");
  });
});
