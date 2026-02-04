import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { test as base, expect, vi } from "vitest";

import { createActionsStore } from "./store.js";
import type { ActionsStore } from "./store.js";
import { handleActionsRequest } from "./routes.js";
import type { ActionsRouteDeps } from "./routes.js";

interface RouteFixtures {
  dataDir: string;
  store: ActionsStore;
  deps: ActionsRouteDeps;
}

const test = base.extend<RouteFixtures>({
  dataDir: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "vibx2-actions-routes-test-"));
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },
  store: async ({ dataDir }, use) => {
    await use(createActionsStore({ dataDir }));
  },
  deps: async ({ store }, use) => {
    await use({
      actionsStore: store,
      userId: "testuser",
      getBackend: vi.fn().mockResolvedValue({ changeStatus: vi.fn().mockResolvedValue({}) }),
      ptyManager: {
        create: vi.fn((_opts, events) => {
          setTimeout(() => events.onExit("mock-id", 0), 0);
          return { id: "mock-id", shell: "bash", pid: 1234 };
        }),
        write: vi.fn(),
        resize: vi.fn(),
        getSession: vi.fn(),
        getSessions: vi.fn().mockReturnValue([]),
        getPaneState: vi.fn(),
        getPaneStates: vi.fn().mockReturnValue([]),
        updatePaneState: vi.fn(),
        destroy: vi.fn(),
        destroyAll: vi.fn(),
      },
      sleep: vi.fn().mockResolvedValue(undefined),
    });
  },
});

function makeRequest(method: string, path: string, body?: unknown): Request {
  const url = `http://localhost${path}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init);
}

test("GET /api/actions returns empty list", async ({ deps }) => {
  const res = await handleActionsRequest(makeRequest("GET", "/api/actions"), deps);
  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  const data = await res!.json();
  expect(data).toEqual([]);
});

test("POST /api/actions creates an action", async ({ deps }) => {
  const res = await handleActionsRequest(
    makeRequest("POST", "/api/actions", {
      name: "Deploy",
      scope: "global",
      steps: [{ type: "run-bash-command", command: "echo deploy" }],
    }),
    deps,
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(201);
  const data = await res!.json();
  expect(data.id).toBeTypeOf("string");
  expect(data.name).toBe("Deploy");
});

test("GET /api/actions/:id returns a specific action", async ({ deps }) => {
  const createRes = await handleActionsRequest(
    makeRequest("POST", "/api/actions", {
      name: "Build",
      scope: "global",
      steps: [],
    }),
    deps,
  );
  const created = await createRes!.json();

  const res = await handleActionsRequest(makeRequest("GET", `/api/actions/${created.id}`), deps);
  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  const data = await res!.json();
  expect(data.id).toBe(created.id);
  expect(data.name).toBe("Build");
});

test("GET /api/actions/:id returns 404 for unknown id", async ({ deps }) => {
  const res = await handleActionsRequest(makeRequest("GET", "/api/actions/nonexistent"), deps);
  expect(res).not.toBeNull();
  expect(res!.status).toBe(404);
});

test("PUT /api/actions/:id updates an action", async ({ deps }) => {
  const createRes = await handleActionsRequest(
    makeRequest("POST", "/api/actions", {
      name: "Deploy",
      scope: "global",
      steps: [],
    }),
    deps,
  );
  const created = await createRes!.json();

  const res = await handleActionsRequest(
    makeRequest("PUT", `/api/actions/${created.id}`, { name: "Deploy v2" }),
    deps,
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  const data = await res!.json();
  expect(data.name).toBe("Deploy v2");
});

test("PUT /api/actions/:id returns 404 for unknown id", async ({ deps }) => {
  const res = await handleActionsRequest(
    makeRequest("PUT", "/api/actions/nonexistent", { name: "X" }),
    deps,
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(404);
});

test("DELETE /api/actions/:id removes an action", async ({ deps }) => {
  const createRes = await handleActionsRequest(
    makeRequest("POST", "/api/actions", {
      name: "Deploy",
      scope: "global",
      steps: [],
    }),
    deps,
  );
  const created = await createRes!.json();

  const delRes = await handleActionsRequest(makeRequest("DELETE", `/api/actions/${created.id}`), deps);
  expect(delRes).not.toBeNull();
  expect(delRes!.status).toBe(200);

  const listRes = await handleActionsRequest(makeRequest("GET", "/api/actions"), deps);
  const data = await listRes!.json();
  expect(data).toEqual([]);
});

test("OPTIONS /api/actions returns CORS preflight", async ({ deps }) => {
  const res = await handleActionsRequest(makeRequest("OPTIONS", "/api/actions"), deps);
  expect(res).not.toBeNull();
  expect(res!.status).toBe(204);
  expect(res!.headers.get("Access-Control-Allow-Methods")).toContain("DELETE");
});

test("returns null for non-matching paths", async ({ deps }) => {
  const res = await handleActionsRequest(makeRequest("GET", "/api/other"), deps);
  expect(res).toBeNull();
});

test("POST /api/actions/:id/run executes an action", async ({ deps }) => {
  const createRes = await handleActionsRequest(
    makeRequest("POST", "/api/actions", {
      name: "Echo",
      scope: "global",
      steps: [{ type: "run-bash-command", command: "echo hello" }],
    }),
    deps,
  );
  const created = await createRes!.json();

  const res = await handleActionsRequest(
    makeRequest("POST", `/api/actions/${created.id}/run`, {}),
    deps,
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  const data = await res!.json();
  expect(data).toEqual({ ok: true });
});

test("POST /api/actions/:id/run returns 404 for unknown action", async ({ deps }) => {
  const res = await handleActionsRequest(
    makeRequest("POST", "/api/actions/nonexistent/run", {}),
    deps,
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(404);
});

test("POST /api/actions/:id/run with issue context", async ({ deps }) => {
  const createRes = await handleActionsRequest(
    makeRequest("POST", "/api/actions", {
      name: "Status",
      scope: "global",
      steps: [{ type: "change-issue-status", targetStatus: "in_progress" }],
    }),
    deps,
  );
  const created = await createRes!.json();

  const res = await handleActionsRequest(
    makeRequest("POST", `/api/actions/${created.id}/run`, {
      issue: { ref: "42", title: "Test", body: "", status: "todo", labels: [] },
    }),
    deps,
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
});

test("OPTIONS /api/actions/:id/run returns CORS preflight", async ({ deps }) => {
  const res = await handleActionsRequest(
    makeRequest("OPTIONS", "/api/actions/some-id/run"),
    deps,
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(204);
});
