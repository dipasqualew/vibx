export interface SessionInfo {
  sessionId: string;
  shell: string;
  pid: number;
}

export interface CreateSessionOptions {
  shell?: string;
  cols?: number;
  rows?: number;
}

export async function createSession(options?: CreateSessionOptions): Promise<SessionInfo> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return (await res.json()) as SessionInfo;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return (await res.json()) as SessionInfo[];
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
}

export interface IssueListItem {
  id: string;
  ref: string;
  title: string;
  status: string;
}

export async function listIssues(): Promise<IssueListItem[]> {
  const res = await fetch("/api/issues");
  if (!res.ok) throw new Error(`Failed to list issues: ${res.status}`);
  return (await res.json()) as IssueListItem[];
}

export async function listGitHubRepositories(): Promise<string[]> {
  const res = await fetch("/api/github/repositories");
  if (!res.ok) throw new Error(`Failed to list repositories: ${res.status}`);
  return (await res.json()) as string[];
}
