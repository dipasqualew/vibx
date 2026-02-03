import { test as base, expect, vi } from "vitest";

import { createConnectionRegistry } from "./registry.js";
import type { ConnectionRegistry, WsConnection } from "./types.js";

function createMockConnection(): WsConnection {
  return {
    send: vi.fn(),
    close: vi.fn(),
  };
}

interface RegistryFixtures {
  registry: ConnectionRegistry;
  ws1: WsConnection;
  ws2: WsConnection;
}

const test = base.extend<RegistryFixtures>({
  registry: async ({}, use) => {
    await use(createConnectionRegistry());
  },
  ws1: async ({}, use) => {
    await use(createMockConnection());
  },
  ws2: async ({}, use) => {
    await use(createMockConnection());
  },
});

test("add and getConnections returns the connection", ({ registry, ws1 }) => {
  registry.add("s1", ws1);

  const conns = registry.getConnections("s1");

  expect(conns.size).toBe(1);
  expect(conns.has(ws1)).toBe(true);
});

test("getConnections returns empty set for unknown session", ({ registry }) => {
  const conns = registry.getConnections("unknown");

  expect(conns.size).toBe(0);
});

test("hasConnections returns false for unknown session", ({ registry }) => {
  expect(registry.hasConnections("unknown")).toBe(false);
});

test("hasConnections returns true after add", ({ registry, ws1 }) => {
  registry.add("s1", ws1);

  expect(registry.hasConnections("s1")).toBe(true);
});

test("remove deletes the connection", ({ registry, ws1 }) => {
  registry.add("s1", ws1);
  registry.remove("s1", ws1);

  expect(registry.hasConnections("s1")).toBe(false);
});

test("remove is a no-op for unknown session", ({ registry, ws1 }) => {
  expect(() => registry.remove("unknown", ws1)).not.toThrow();
});

test("broadcast sends message to all connections", ({ registry, ws1, ws2 }) => {
  registry.add("s1", ws1);
  registry.add("s1", ws2);

  registry.broadcast("s1", "hello");

  expect(ws1.send).toHaveBeenCalledWith("hello");
  expect(ws2.send).toHaveBeenCalledWith("hello");
});

test("broadcast is a no-op for unknown session", ({ registry }) => {
  expect(() => registry.broadcast("unknown", "msg")).not.toThrow();
});

test("multiple sessions are independent", ({ registry, ws1, ws2 }) => {
  registry.add("s1", ws1);
  registry.add("s2", ws2);

  registry.broadcast("s1", "only-s1");

  expect(ws1.send).toHaveBeenCalledWith("only-s1");
  expect(ws2.send).not.toHaveBeenCalled();
});

test("removing last connection cleans up session entry", ({ registry, ws1 }) => {
  registry.add("s1", ws1);
  registry.remove("s1", ws1);

  expect(registry.getConnections("s1").size).toBe(0);
  expect(registry.hasConnections("s1")).toBe(false);
});
