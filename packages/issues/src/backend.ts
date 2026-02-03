import type { Issue, IssueComment, IssueStatus } from "./types.js";

export interface IssuesBackend {
  listIssues(): Promise<Issue[]>;
  createIssue(title: string, body: string): Promise<Issue>;
  updateIssue(ref: string, updates: { title?: string; body?: string }): Promise<Issue>;
  deleteIssue(ref: string): Promise<void>;
  commentOnIssue(ref: string, body: string): Promise<IssueComment>;
  readComments(ref: string): Promise<IssueComment[]>;
  changeStatus(ref: string, status: IssueStatus): Promise<Issue>;
  createSubissue(parentRef: string, title: string, body: string): Promise<Issue>;
  labelIssue(ref: string, labels: string[]): Promise<Issue>;
}
