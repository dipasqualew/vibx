import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { test as base, expect } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@vibx/shared";

import { createSettingsStore } from "./store.js";
import type { SettingsStore } from "./store.js";

interface StoreFixtures {
  dataDir: string;
  store: SettingsStore;
}

const test = base.extend<StoreFixtures>({
  dataDir: async ({ }, use) => {
    const dir = await mkdtemp(join(tmpdir(), "vibx-settings-test-"));
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },
  store: async ({ dataDir }, use) => {
    await use(createSettingsStore({ dataDir }));
  },
});

test("getSettings returns defaults when no file exists", async ({ store }) => {
  const settings = await store.getSettings("testuser");
  expect(settings).toEqual(DEFAULT_USER_SETTINGS);
});

test("updateSettings writes and returns merged settings", async ({ store }) => {
  const updated = await store.updateSettings("testuser", {
    default_agent_framework: "mock-code",
  });
  expect(updated.default_agent_framework).toBe("mock-code");
  expect(updated.issue_provider).toBe("github");
});

test("getSettings reads previously saved settings", async ({ store }) => {
  await store.updateSettings("testuser", {
    issue_provider__github__github_token: "ghp_abc123",
  });
  const settings = await store.getSettings("testuser");
  expect(settings.issue_provider__github__github_token).toBe("ghp_abc123");
  expect(settings.default_agent_framework).toBe("claude");
});

test("updateSettings merges partial updates", async ({ store }) => {
  await store.updateSettings("testuser", {
    default_agent_framework: "mock-code",
  });
  const updated = await store.updateSettings("testuser", {
    issue_provider__github__github_token: "ghp_xyz",
  });
  expect(updated.default_agent_framework).toBe("mock-code");
  expect(updated.issue_provider__github__github_token).toBe("ghp_xyz");
});

test("settings are namespaced by userId", async ({ store }) => {
  await store.updateSettings("alice", {
    default_agent_framework: "mock-code",
  });
  await store.updateSettings("bob", {
    issue_provider__github__github_token: "ghp_bob",
  });

  const alice = await store.getSettings("alice");
  const bob = await store.getSettings("bob");

  expect(alice.default_agent_framework).toBe("mock-code");
  expect(alice.issue_provider__github__github_token).toBe("");

  expect(bob.default_agent_framework).toBe("claude");
  expect(bob.issue_provider__github__github_token).toBe("ghp_bob");
});
