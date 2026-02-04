import { test as base, expect, vi } from "vitest";

import type { PtyManager, PtySession, PtySessionEvents } from "@vibx2/shared";

import { createWsBridge } from "./bridge.js";
import { createConnectionRegistry } from "./registry.js";
import type { ConnectionRegistry, WsConnection } from "./types.js";
import type { WsBridge } from "./bridge.js";

function createMockConnection(): WsConnection {
  return {
    send: vi.fn(),
    close: vi.fn(),
  };
}

interface MockPtyManager extends PtyManager {
  lastEvents: PtySessionEvents | undefined;
}

function createMockPtyManager(): MockPtyManager {
  let lastEvents: PtySessionEvents | undefined;
  const sessions = new Map<string, PtySession>();

  return {
    get lastEvents() {
      return lastEvents;
    },
    create: vi.fn((options, events) => {
      lastEvents = events;
      const session: PtySession = { id: "pty-1", shell: options.shell, pid: 42 };
      sessions.set(session.id, session);
      return session;
    }),
    write: vi.fn(),
    resize: vi.fn(),
    getSession: vi.fn((id) => sessions.get(id)),
    getSessions: vi.fn(() => [...sessions.values()]),
    getPaneState: vi.fn(),
    getPaneStates: vi.fn(),
    updatePaneState: vi.fn(),
    destroy: vi.fn(),
    destroyAll: vi.fn(),
  };
}

interface BridgeFixtures {
  ptyManager: MockPtyManager;
  registry: ConnectionRegistry;
  bridge: WsBridge;
  ws: WsConnection;
}

const test = base.extend<BridgeFixtures>({
  ptyManager: async ({}, use) => {
    await use(createMockPtyManager());
  },
  registry: async ({}, use) => {
    await use(createConnectionRegistry());
  },
  bridge: async ({ ptyManager, registry }, use) => {
    await use(createWsBridge({ ptyManager, registry }));
  },
  ws: async ({}, use) => {
    await use(createMockConnection());
  },
});

test("handleOpen sends error and closes if session not found", ({ bridge, ws }) => {
  bridge.handleOpen(ws, "unknown");

  expect(ws.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "error", message: "Session not found: unknown" }),
  );
  expect(ws.close).toHaveBeenCalledWith(4004, "Session not found");
});

test("handleOpen sends session_info for existing session", ({ bridge, ws, ptyManager }) => {
  ptyManager.create({ shell: "/bin/bash" }, { onData: vi.fn(), onExit: vi.fn() });

  bridge.handleOpen(ws, "pty-1");

  expect(ws.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "session_info", sessionId: "pty-1", shell: "/bin/bash", pid: 42 }),
  );
  expect(ws.close).not.toHaveBeenCalled();
});

test("handleOpen adds ws to registry", ({ bridge, ws, ptyManager, registry }) => {
  ptyManager.create({ shell: "/bin/bash" }, { onData: vi.fn(), onExit: vi.fn() });

  bridge.handleOpen(ws, "pty-1");

  expect(registry.hasConnections("pty-1")).toBe(true);
});

test("handleMessage forwards input to ptyManager.write", ({ bridge, ws, ptyManager }) => {
  const msg = JSON.stringify({ type: "input", data: "ls\n" });

  bridge.handleMessage(ws, "s1", msg);

  expect(ptyManager.write).toHaveBeenCalledWith("s1", "ls\n");
});

test("handleMessage forwards resize to ptyManager.resize", ({ bridge, ws, ptyManager }) => {
  const msg = JSON.stringify({ type: "resize", cols: 120, rows: 40 });

  bridge.handleMessage(ws, "s1", msg);

  expect(ptyManager.resize).toHaveBeenCalledWith("s1", { cols: 120, rows: 40 });
});

test("handleMessage ignores invalid JSON", ({ bridge, ws, ptyManager }) => {
  bridge.handleMessage(ws, "s1", "not-json");

  expect(ptyManager.write).not.toHaveBeenCalled();
  expect(ptyManager.resize).not.toHaveBeenCalled();
});

test("handleMessage ignores unknown message types", ({ bridge, ws, ptyManager }) => {
  const msg = JSON.stringify({ type: "unknown" });

  bridge.handleMessage(ws, "s1", msg);

  expect(ptyManager.write).not.toHaveBeenCalled();
  expect(ptyManager.resize).not.toHaveBeenCalled();
});

test("handleClose removes ws from registry", ({ bridge, ws, ptyManager, registry }) => {
  ptyManager.create({ shell: "/bin/bash" }, { onData: vi.fn(), onExit: vi.fn() });
  bridge.handleOpen(ws, "pty-1");

  bridge.handleClose(ws, "pty-1");

  expect(registry.hasConnections("pty-1")).toBe(false);
});

test("attachSession creates session and broadcasts output", ({ bridge, registry }) => {
  const ws = createMockConnection();
  registry.add("s1", ws);

  bridge.attachSession("s1", { shell: "/bin/zsh" });

  expect(bridge).toBeDefined();
});

test("attachSession broadcasts output on PTY data", ({ bridge, ptyManager, registry }) => {
  const ws = createMockConnection();
  registry.add("s1", ws);

  bridge.attachSession("s1", { shell: "/bin/zsh" });
  ptyManager.lastEvents?.onData("pty-1", "hello");

  expect(ws.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "output", data: "hello" }),
  );
});

test("attachSession broadcasts exit on PTY exit", ({ bridge, ptyManager, registry }) => {
  const ws = createMockConnection();
  registry.add("s1", ws);

  bridge.attachSession("s1", { shell: "/bin/zsh" });
  ptyManager.lastEvents?.onExit("pty-1", 0);

  expect(ws.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "exit", code: 0 }),
  );
});

test("attachSession broadcasts exit with signal", ({ bridge, ptyManager, registry }) => {
  const ws = createMockConnection();
  registry.add("s1", ws);

  bridge.attachSession("s1", { shell: "/bin/zsh" });
  ptyManager.lastEvents?.onExit("pty-1", 1, 15);

  expect(ws.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "exit", code: 1, signal: 15 }),
  );
});

test("attachSession detects bell character in data", ({ bridge, ptyManager, registry }) => {
  const ws = createMockConnection();
  registry.add("s1", ws);

  bridge.attachSession("s1", { shell: "/bin/zsh" });
  ptyManager.lastEvents?.onData("pty-1", "hello\x07world");

  expect(ptyManager.updatePaneState).toHaveBeenCalledWith("s1", { bell: true });
});

test("attachSession does not set bell for data without bell char", ({ bridge, ptyManager, registry }) => {
  const ws = createMockConnection();
  registry.add("s1", ws);

  bridge.attachSession("s1", { shell: "/bin/zsh" });
  ptyManager.lastEvents?.onData("pty-1", "hello world");

  expect(ptyManager.updatePaneState).not.toHaveBeenCalled();
});

test("createSession passes cwd through to ptyManager.create", ({ bridge, ptyManager }) => {
  bridge.createSession({ cwd: "/some/path" });

  expect(ptyManager.create).toHaveBeenCalledWith(
    expect.objectContaining({ cwd: "/some/path" }),
    expect.any(Object),
  );
});

test("createSession omits cwd when not provided", ({ bridge, ptyManager }) => {
  bridge.createSession({ shell: "/bin/bash" });

  const spawnOptions = (ptyManager.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
  expect(spawnOptions).not.toHaveProperty("cwd");
});

test("createSession detects bell character in data", ({ bridge, ptyManager, registry }) => {
  bridge.createSession({ shell: "/bin/bash" });
  const ws = createMockConnection();
  registry.add("pty-1", ws);

  ptyManager.lastEvents?.onData("pty-1", "beep\x07");

  expect(ptyManager.updatePaneState).toHaveBeenCalledWith("pty-1", { bell: true });
});
