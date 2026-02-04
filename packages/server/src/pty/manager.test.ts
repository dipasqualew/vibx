import { test as base, expect, vi } from "vitest";

import type { PtySessionEvents } from "@vibx/shared";

import { createPtyManager } from "./manager.js";
import type { IDisposable, PtyFactory, PtyProcess } from "./types.js";

interface MockPtyProcess extends PtyProcess {
  simulateData: (data: string) => void;
  simulateExit: (exitCode: number, signal?: number) => void;
}

function createMockProcess(): MockPtyProcess {
  let dataCallback: ((data: string) => void) | null = null;
  let exitCallback: ((e: { exitCode: number; signal?: number }) => void) | null = null;

  return {
    pid: Math.floor(Math.random() * 10000),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb): IDisposable => {
      dataCallback = cb;
      return { dispose: () => { dataCallback = null; } };
    },
    onExit: (cb): IDisposable => {
      exitCallback = cb;
      return { dispose: () => { exitCallback = null; } };
    },
    simulateData: (data) => dataCallback?.(data),
    simulateExit: (exitCode, signal) => {
      const exit = signal !== undefined ? { exitCode, signal } : { exitCode };
      exitCallback?.(exit);
    },
  };
}

interface PtyFixtures {
  mockProcess: MockPtyProcess;
  factory: PtyFactory;
  events: PtySessionEvents;
}

const test = base.extend<PtyFixtures>({
  mockProcess: async ({ }, use) => {
    await use(createMockProcess());
  },
  factory: async ({ mockProcess }, use) => {
    await use(() => mockProcess);
  },
  events: async ({ }, use) => {
    await use({
      onData: vi.fn(),
      onExit: vi.fn(),
    });
  },
});

const SPAWN_OPTIONS = { shell: "/bin/bash" };

test("create returns a PtySession", ({ factory, events }) => {
  let callCount = 0;
  const manager = createPtyManager({ factory, generateId: () => `id-${++callCount}` });

  const session = manager.create(SPAWN_OPTIONS, events);

  expect(session.id).toBe("id-1");
  expect(session.shell).toBe("/bin/bash");
  expect(typeof session.pid).toBe("number");
});

test("getSession returns session by id", ({ factory, events }) => {
  const manager = createPtyManager({ factory, generateId: () => "test-id" });
  manager.create(SPAWN_OPTIONS, events);

  const session = manager.getSession("test-id");

  expect(session).toBeDefined();
  expect(session?.id).toBe("test-id");
});

test("getSession returns undefined for unknown id", ({ factory }) => {
  const manager = createPtyManager({ factory, generateId: () => "x" });

  expect(manager.getSession("unknown")).toBeUndefined();
});

test("getSessions returns all sessions", ({ events }) => {
  let callCount = 0;
  const factory: PtyFactory = () => createMockProcess();
  const manager = createPtyManager({ factory, generateId: () => `id-${++callCount}` });

  manager.create(SPAWN_OPTIONS, events);
  manager.create(SPAWN_OPTIONS, events);

  expect(manager.getSessions()).toHaveLength(2);
});

test("write forwards data to process", ({ factory, events, mockProcess }) => {
  const manager = createPtyManager({ factory, generateId: () => "w" });
  manager.create(SPAWN_OPTIONS, events);

  manager.write("w", "hello");

  expect(mockProcess.write).toHaveBeenCalledWith("hello");
});

test("write throws for unknown session", ({ factory }) => {
  const manager = createPtyManager({ factory, generateId: () => "x" });

  expect(() => manager.write("unknown", "data")).toThrow("PTY session not found: unknown");
});

test("resize forwards to process", ({ factory, events, mockProcess }) => {
  const manager = createPtyManager({ factory, generateId: () => "r" });
  manager.create(SPAWN_OPTIONS, events);

  manager.resize("r", { cols: 120, rows: 40 });

  expect(mockProcess.resize).toHaveBeenCalledWith(120, 40);
});

test("onData callback is invoked", ({ factory, events, mockProcess }) => {
  const manager = createPtyManager({ factory, generateId: () => "d" });
  manager.create(SPAWN_OPTIONS, events);

  mockProcess.simulateData("output");

  expect(events.onData).toHaveBeenCalledWith("d", "output");
});

test("onExit auto-removes session", ({ factory, events, mockProcess }) => {
  const manager = createPtyManager({ factory, generateId: () => "e" });
  manager.create(SPAWN_OPTIONS, events);

  mockProcess.simulateExit(0, 15);

  expect(events.onExit).toHaveBeenCalledWith("e", 0, 15);
  expect(manager.getSession("e")).toBeUndefined();
});

test("destroy kills process and removes session", ({ factory, events, mockProcess }) => {
  const manager = createPtyManager({ factory, generateId: () => "k" });
  manager.create(SPAWN_OPTIONS, events);

  manager.destroy("k");

  expect(mockProcess.kill).toHaveBeenCalled();
  expect(manager.getSession("k")).toBeUndefined();
});

test("destroyAll kills all sessions", ({ events }) => {
  const processes: MockPtyProcess[] = [];
  const factory: PtyFactory = () => {
    const p = createMockProcess();
    processes.push(p);
    return p;
  };
  let callCount = 0;
  const manager = createPtyManager({ factory, generateId: () => `a-${++callCount}` });

  manager.create(SPAWN_OPTIONS, events);
  manager.create(SPAWN_OPTIONS, events);
  manager.destroyAll();

  expect(manager.getSessions()).toHaveLength(0);
  processes.forEach((p) => expect(p.kill).toHaveBeenCalled());
});

test("getPaneState returns initial defaults", ({ factory, events }) => {
  const manager = createPtyManager({ factory, generateId: () => "ps-1" });
  manager.create(SPAWN_OPTIONS, events);

  const state = manager.getPaneState("ps-1");

  expect(state).toBeDefined();
  expect(state!.id).toBe("ps-1");
  expect(state!.title).toBe("/bin/bash");
  expect(state!.bell).toBe(false);
  expect(state!.pendingStdin).toBe(false);
  expect(state!.notes).toEqual([]);
});

test("getPaneState returns undefined for unknown id", ({ factory }) => {
  const manager = createPtyManager({ factory, generateId: () => "x" });

  expect(manager.getPaneState("unknown")).toBeUndefined();
});

test("getPaneStates returns all pane states", ({ events }) => {
  let callCount = 0;
  const factory: PtyFactory = () => createMockProcess();
  const manager = createPtyManager({ factory, generateId: () => `ps-${++callCount}` });

  manager.create(SPAWN_OPTIONS, events);
  manager.create(SPAWN_OPTIONS, events);

  const states = manager.getPaneStates();
  expect(states).toHaveLength(2);
  expect(states[0]!.id).toBe("ps-1");
  expect(states[1]!.id).toBe("ps-2");
});

test("updatePaneState applies patch", ({ factory, events }) => {
  const manager = createPtyManager({ factory, generateId: () => "up-1" });
  manager.create(SPAWN_OPTIONS, events);

  const updated = manager.updatePaneState("up-1", { title: "my-title", bell: true });

  expect(updated.title).toBe("my-title");
  expect(updated.bell).toBe(true);
  expect(updated.pendingStdin).toBe(false);
});

test("updatePaneState throws for unknown id", ({ factory }) => {
  const manager = createPtyManager({ factory, generateId: () => "x" });

  expect(() => manager.updatePaneState("unknown", { bell: true })).toThrow("PTY session not found: unknown");
});

test("getPaneState uses cwd from spawn options", ({ factory, events }) => {
  const manager = createPtyManager({ factory, generateId: () => "cwd-1" });
  manager.create({ shell: "/bin/bash", cwd: "/tmp" }, events);

  const state = manager.getPaneState("cwd-1");
  expect(state!.cwd).toBe("/tmp");
});

test("updatePaneState with notes", ({ factory, events }) => {
  const manager = createPtyManager({ factory, generateId: () => "n-1" });
  manager.create(SPAWN_OPTIONS, events);

  const updated = manager.updatePaneState("n-1", { notes: ["note1", "note2"] });

  expect(updated.notes).toEqual(["note1", "note2"]);
});
