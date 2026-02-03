export type IssueStatus = "todo" | "in_progress" | "in_review" | "done" | "wont_do";

export interface Issue {
  id: string;
  ref: string;
  title: string;
  body: string;
  status: IssueStatus;
  labels: string[];
}

export interface IssueComment {
  id: string;
  body: string;
}
