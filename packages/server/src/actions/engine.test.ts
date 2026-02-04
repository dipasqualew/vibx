import { describe, expect, test, vi } from "vitest";

import type { Action } from "@vibx/shared";

import { runAction } from "./engine.js";
import type { ActionEngineDeps } from "./engine.js";
import type { IssueContext } from "./interpolate.js";

function createMockDeps(overrides?: Partial<ActionEngineDeps>): ActionEngineDeps {
  const changeStatus = vi.fn().mockResolvedValue({});
  return {
    getBackend: vi.fn().mockResolvedValue({ changeStatus }),
    ptyManager: {
      create: vi.fn((_opts, events) => {
        // Simulate immediate successful exit
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
    ...overrides,
  };
}

const issueCtx: IssueContext = {
  ref: "42",
  title: "Fix login",
  body: "Cannot log in",
  status: "todo",
  labels: ["bug"],
};

describe("runAction", () => {
  test("executes sleep step", async () => {
    const deps = createMockDeps();
    const action: Action = {
      id: "a1",
      name: "Wait",
      scope: "global",
      steps: [{ type: "sleep", durationSeconds: 5 }],
    };

    await runAction(action, undefined, deps);
    expect(deps.sleep).toHaveBeenCalledWith(5000);
  });

  test("executes change-issue-status step", async () => {
    const deps = createMockDeps();
    const action: Action = {
      id: "a2",
      name: "Start",
      scope: "global",
      steps: [{ type: "change-issue-status", targetStatus: "in_progress" }],
    };

    await runAction(action, issueCtx, deps);

    expect(deps.getBackend).toHaveBeenCalled();
    const backend = await (deps.getBackend as ReturnType<typeof vi.fn>).mock.results[0]!.value;
    expect(backend.changeStatus).toHaveBeenCalledWith("42", "in_progress");
  });

  test("change-issue-status throws without issue context", async () => {
    const deps = createMockDeps();
    const action: Action = {
      id: "a3",
      name: "Start",
      scope: "global",
      steps: [{ type: "change-issue-status", targetStatus: "in_progress" }],
    };

    await expect(runAction(action, undefined, deps)).rejects.toThrow(
      "change-issue-status requires an issue context",
    );
  });

  test("executes run-bash-command step with interpolation", async () => {
    const deps = createMockDeps();
    const action: Action = {
      id: "a4",
      name: "Deploy",
      scope: "global",
      steps: [{ type: "run-bash-command", command: "echo ${issue.ref}" }],
    };

    await runAction(action, issueCtx, deps);

    expect(deps.ptyManager.create).toHaveBeenCalledWith(
      { shell: "bash", args: ["-c", "echo 42"] },
      expect.any(Object),
    );
  });

  test("executes run-bash-command without issue context (no interpolation)", async () => {
    const deps = createMockDeps();
    const action: Action = {
      id: "a5",
      name: "Build",
      scope: "global",
      steps: [{ type: "run-bash-command", command: "echo hello" }],
    };

    await runAction(action, undefined, deps);

    expect(deps.ptyManager.create).toHaveBeenCalledWith(
      { shell: "bash", args: ["-c", "echo hello"] },
      expect.any(Object),
    );
  });

  test("executes steps sequentially", async () => {
    const order: string[] = [];
    const deps = createMockDeps({
      sleep: vi.fn().mockImplementation(async () => {
        order.push("sleep");
      }),
      ptyManager: {
        create: vi.fn((_opts, events) => {
          order.push("bash");
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
    });

    const action: Action = {
      id: "a6",
      name: "Pipeline",
      scope: "global",
      steps: [
        { type: "sleep", durationSeconds: 1 },
        { type: "run-bash-command", command: "echo test" },
        { type: "sleep", durationSeconds: 2 },
      ],
    };

    await runAction(action, undefined, deps);
    expect(order).toEqual(["sleep", "bash", "sleep"]);
  });

  test("rejects when bash command exits with non-zero code", async () => {
    const deps = createMockDeps({
      ptyManager: {
        create: vi.fn((_opts, events) => {
          setTimeout(() => events.onExit("mock-id", 1), 0);
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
    });

    const action: Action = {
      id: "a7",
      name: "Fail",
      scope: "global",
      steps: [{ type: "run-bash-command", command: "exit 1" }],
    };

    await expect(runAction(action, undefined, deps)).rejects.toThrow(
      "Command exited with code 1",
    );
  });
});
