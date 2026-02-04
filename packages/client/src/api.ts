export function apiBase(): string {
  return window.__VIBX_SERVER_URL ?? "";
}

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
  const res = await fetch(`${apiBase()}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return (await res.json()) as SessionInfo;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await fetch(`${apiBase()}/api/sessions`);
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return (await res.json()) as SessionInfo[];
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${apiBase()}/api/sessions/${sessionId}`, { method: "DELETE" });
}

export interface IssueListItem {
  id: string;
  ref: string;
  title: string;
  status: string;
}

export async function listIssues(): Promise<IssueListItem[]> {
  const res = await fetch(`${apiBase()}/api/issues`);
  if (!res.ok) throw new Error(`Failed to list issues: ${res.status}`);
  return (await res.json()) as IssueListItem[];
}

export interface PaneStateInfo {
  id: string;
  title: string;
  cwd: string;
  bell: boolean;
  pendingStdin: boolean;
  notes: string[];
}

export interface PaneStatePatchInput {
  title?: string;
  bell?: boolean;
  pendingStdin?: boolean;
  notes?: string[];
}

export async function listPanes(): Promise<PaneStateInfo[]> {
  const res = await fetch(`${apiBase()}/api/panes`);
  if (!res.ok) throw new Error(`Failed to list panes: ${res.status}`);
  return (await res.json()) as PaneStateInfo[];
}

export async function getPane(id: string): Promise<PaneStateInfo> {
  const res = await fetch(`${apiBase()}/api/panes/${id}`);
  if (!res.ok) throw new Error(`Failed to get pane: ${res.status}`);
  return (await res.json()) as PaneStateInfo;
}

export async function updatePane(id: string, patch: PaneStatePatchInput): Promise<PaneStateInfo> {
  const res = await fetch(`${apiBase()}/api/panes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update pane: ${res.status}`);
  return (await res.json()) as PaneStateInfo;
}

export async function listGitHubRepositories(): Promise<string[]> {
  const res = await fetch(`${apiBase()}/api/github/repositories`);
  if (!res.ok) throw new Error(`Failed to list repositories: ${res.status}`);
  return (await res.json()) as string[];
}
