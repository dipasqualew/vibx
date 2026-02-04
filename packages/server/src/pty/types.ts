export interface PtyProcess {
  readonly pid: number;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
  onData: (callback: (data: string) => void) => IDisposable;
  onExit: (callback: (exit: { exitCode: number; signal?: number }) => void) => IDisposable;
}

export interface IDisposable {
  dispose: () => void;
}

export interface PtyFactoryOptions {
  env?: Record<string, string> | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
  cwd?: string | undefined;
}

export type PtyFactory = (
  shell: string,
  args: string[],
  options: PtyFactoryOptions,
) => PtyProcess;

export interface InternalPtySession {
  readonly id: string;
  readonly shell: string;
  readonly process: PtyProcess;
  readonly disposables: IDisposable[];
  readonly paneState: import("@vibx/shared").PaneState;
}
