import { test as base, expect, vi } from "vitest";

import type { PaneState, PaneStatePatch, PtyManager } from "@vibx/shared";

import { handlePanesRequest } from "./routes.js";
import type { PaneRouteDeps } from "./routes.js";

const DEFAULT_PANE_STATE: PaneState = {
  id: "s-1",
  title: "/bin/bash",
  cwd: "/home/user",
  bell: false,
  pendingStdin: false,
  notes: [],
};

function createMockPtyManager() {
  return {
    create: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    getSession: vi.fn(),
    getSessions: vi.fn(),
    getPaneState: vi.fn<(id: string) => PaneState | undefined>(),
    getPaneStates: vi.fn<() => PaneState[]>(),
    updatePaneState: vi.fn<(id: string, patch: PaneStatePatch) => PaneState>(),
    destroy: vi.fn(),
    destroyAll: vi.fn(),
  } satisfies PtyManager;
}

interface Fixtures {
  mockManager: ReturnType<typeof createMockPtyManager>;
  deps: PaneRouteDeps;
}

const test = base.extend<Fixtures>({
  mockManager: async ({ }, use) => {
    await use(createMockPtyManager());
  },
  deps: async ({ mockManager }, use) => {
    await use({ ptyManager: mockManager });
  },
});

test("GET /api/panes returns all pane states", async ({ deps, mockManager }) => {
  mockManager.getPaneStates.mockReturnValue([DEFAULT_PANE_STATE]);

  const req = new Request("http://localhost/api/panes", { method: "GET" });
  const res = await handlePanesRequest(req, deps);

  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  const body = await res!.json();
  expect(body).toEqual([DEFAULT_PANE_STATE]);
});

test("GET /api/panes/:id returns single pane state", async ({ deps, mockManager }) => {
  mockManager.getPaneState.mockReturnValue(DEFAULT_PANE_STATE);

  const req = new Request("http://localhost/api/panes/s-1", { method: "GET" });
  const res = await handlePanesRequest(req, deps);

  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  const body = await res!.json();
  expect(body).toEqual(DEFAULT_PANE_STATE);
  expect(mockManager.getPaneState).toHaveBeenCalledWith("s-1");
});

test("GET /api/panes/:id returns 404 for unknown id", async ({ deps, mockManager }) => {
  mockManager.getPaneState.mockReturnValue(undefined);

  const req = new Request("http://localhost/api/panes/unknown", { method: "GET" });
  const res = await handlePanesRequest(req, deps);

  expect(res).not.toBeNull();
  expect(res!.status).toBe(404);
});

test("PATCH /api/panes/:id updates and returns pane state", async ({ deps, mockManager }) => {
  mockManager.getPaneState.mockReturnValue(DEFAULT_PANE_STATE);
  const updated = { ...DEFAULT_PANE_STATE, title: "new-title" };
  mockManager.updatePaneState.mockReturnValue(updated);

  const patch: PaneStatePatch = { title: "new-title" };
  const req = new Request("http://localhost/api/panes/s-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const res = await handlePanesRequest(req, deps);

  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  const body = await res!.json();
  expect(body).toEqual(updated);
  expect(mockManager.updatePaneState).toHaveBeenCalledWith("s-1", patch);
});

test("PATCH /api/panes/:id returns 404 for unknown id", async ({ deps, mockManager }) => {
  mockManager.getPaneState.mockReturnValue(undefined);

  const req = new Request("http://localhost/api/panes/unknown", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bell: false }),
  });
  const res = await handlePanesRequest(req, deps);

  expect(res).not.toBeNull();
  expect(res!.status).toBe(404);
});

test("OPTIONS /api/panes returns 204", async ({ deps }) => {
  const req = new Request("http://localhost/api/panes", { method: "OPTIONS" });
  const res = await handlePanesRequest(req, deps);

  expect(res).not.toBeNull();
  expect(res!.status).toBe(204);
});

test("returns null for non-pane paths", async ({ deps }) => {
  const req = new Request("http://localhost/api/settings", { method: "GET" });
  const res = await handlePanesRequest(req, deps);

  expect(res).toBeNull();
});
