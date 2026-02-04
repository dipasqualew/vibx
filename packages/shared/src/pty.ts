export interface PtySize {
  cols: number;
  rows: number;
}

export interface PtySpawnOptions {
  shell: string;
  args?: string[];
  env?: Record<string, string>;
  size?: PtySize;
  cwd?: string;
}

export interface PtySession {
  readonly id: string;
  readonly shell: string;
  readonly pid: number;
}

export interface PtySessionEvents {
  onData: (id: string, data: string) => void;
  onExit: (id: string, code: number, signal?: number) => void;
}

export interface PaneState {
  id: string;
  title: string;
  cwd: string;
  bell: boolean;
  pendingStdin: boolean;
  notes: string[];
}

export interface PaneStatePatch {
  title?: string;
  bell?: boolean;
  pendingStdin?: boolean;
  notes?: string[];
}

export interface PtyManager {
  create: (options: PtySpawnOptions, events: PtySessionEvents) => PtySession;
  write: (id: string, data: string) => void;
  resize: (id: string, size: PtySize) => void;
  getSession: (id: string) => PtySession | undefined;
  getSessions: () => PtySession[];
  getPaneState: (id: string) => PaneState | undefined;
  getPaneStates: () => PaneState[];
  updatePaneState: (id: string, patch: PaneStatePatch) => PaneState;
  destroy: (id: string) => void;
  destroyAll: () => void;
}
