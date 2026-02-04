export type ActionStepType = "change-issue-status" | "run-bash-command" | "sleep";

export interface ActionStepChangeIssueStatus {
  type: "change-issue-status";
  targetStatus: "todo" | "in_progress" | "in_review" | "done" | "wont_do";
}

export interface ActionStepRunBashCommand {
  type: "run-bash-command";
  command: string; // supports ${issue.ref}, ${issue.title}, etc.
}

export interface ActionStepSleep {
  type: "sleep";
  durationSeconds: number;
}

export type ActionStep =
  | ActionStepChangeIssueStatus
  | ActionStepRunBashCommand
  | ActionStepSleep;

export interface Action {
  id: string;
  name: string;
  scope: "global" | string; // string = repo identifier for per-repo
  steps: ActionStep[];
}
