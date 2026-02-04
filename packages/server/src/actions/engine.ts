import type { Action } from "@vibx2/shared";
import type { PtyManager } from "@vibx2/shared";
import type { IssuesBackend } from "@vibx2/issues";

import { interpolate } from "./interpolate.js";
import type { IssueContext } from "./interpolate.js";

export interface ActionEngineDeps {
  getBackend: () => Promise<IssuesBackend>;
  ptyManager: PtyManager;
  sleep: (ms: number) => Promise<void>;
}

function runBashCommand(command: string, ptyManager: PtyManager): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ptyManager.create(
      { shell: "bash", args: ["-c", command] },
      {
        onData: () => {},
        onExit: (_id, code) => {
          if (code === 0) resolve();
          else reject(new Error(`Command exited with code ${code}`));
        },
      },
    );
  });
}

export async function runAction(
  action: Action,
  issueContext: IssueContext | undefined,
  deps: ActionEngineDeps,
): Promise<void> {
  for (const step of action.steps) {
    switch (step.type) {
      case "change-issue-status": {
        if (!issueContext) {
          throw new Error("change-issue-status requires an issue context");
        }
        const backend = await deps.getBackend();
        await backend.changeStatus(issueContext.ref, step.targetStatus);
        break;
      }
      case "run-bash-command": {
        const command = interpolate(step.command, issueContext);
        await runBashCommand(command, deps.ptyManager);
        break;
      }
      case "sleep": {
        await deps.sleep(step.durationSeconds * 1000);
        break;
      }
    }
  }
}
