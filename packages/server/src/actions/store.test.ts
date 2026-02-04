import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { test as base, expect } from "vitest";

import { createActionsStore } from "./store.js";
import type { ActionsStore } from "./store.js";

interface StoreFixtures {
  dataDir: string;
  store: ActionsStore;
}

const test = base.extend<StoreFixtures>({
  dataDir: async ({ }, use) => {
    const dir = await mkdtemp(join(tmpdir(), "vibx-actions-test-"));
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },
  store: async ({ dataDir }, use) => {
    await use(createActionsStore({ dataDir }));
  },
});

test("listActions returns empty array when no file exists", async ({ store }) => {
  const actions = await store.listActions("testuser");
  expect(actions).toEqual([]);
});

test("createAction creates and returns an action with generated id", async ({ store }) => {
  const action = await store.createAction("testuser", {
    name: "Deploy",
    scope: "global",
    steps: [{ type: "run-bash-command", command: "echo deploy" }],
  });
  expect(action.id).toBeTypeOf("string");
  expect(action.name).toBe("Deploy");
  expect(action.scope).toBe("global");
  expect(action.steps).toHaveLength(1);
});

test("listActions returns created actions", async ({ store }) => {
  await store.createAction("testuser", {
    name: "Build",
    scope: "global",
    steps: [],
  });
  await store.createAction("testuser", {
    name: "Test",
    scope: "global",
    steps: [],
  });
  const actions = await store.listActions("testuser");
  expect(actions).toHaveLength(2);
  expect(actions.map((a) => a.name)).toEqual(["Build", "Test"]);
});

test("getAction returns action by id", async ({ store }) => {
  const created = await store.createAction("testuser", {
    name: "Deploy",
    scope: "global",
    steps: [],
  });
  const found = await store.getAction("testuser", created.id);
  expect(found).toEqual(created);
});

test("getAction returns null for unknown id", async ({ store }) => {
  const found = await store.getAction("testuser", "nonexistent");
  expect(found).toBeNull();
});

test("updateAction updates and returns the action", async ({ store }) => {
  const created = await store.createAction("testuser", {
    name: "Deploy",
    scope: "global",
    steps: [],
  });
  const updated = await store.updateAction("testuser", created.id, {
    name: "Deploy v2",
    steps: [{ type: "sleep", durationSeconds: 5 }],
  });
  expect(updated.id).toBe(created.id);
  expect(updated.name).toBe("Deploy v2");
  expect(updated.steps).toHaveLength(1);
});

test("updateAction throws for unknown id", async ({ store }) => {
  await expect(
    store.updateAction("testuser", "nonexistent", { name: "X" }),
  ).rejects.toThrow("Action not found: nonexistent");
});

test("deleteAction removes the action", async ({ store }) => {
  const created = await store.createAction("testuser", {
    name: "Deploy",
    scope: "global",
    steps: [],
  });
  await store.deleteAction("testuser", created.id);
  const actions = await store.listActions("testuser");
  expect(actions).toHaveLength(0);
});

test("actions are namespaced by userId", async ({ store }) => {
  await store.createAction("alice", {
    name: "Alice Action",
    scope: "global",
    steps: [],
  });
  await store.createAction("bob", {
    name: "Bob Action",
    scope: "global",
    steps: [],
  });

  const aliceActions = await store.listActions("alice");
  const bobActions = await store.listActions("bob");

  expect(aliceActions).toHaveLength(1);
  expect(aliceActions[0]!.name).toBe("Alice Action");

  expect(bobActions).toHaveLength(1);
  expect(bobActions[0]!.name).toBe("Bob Action");
});
