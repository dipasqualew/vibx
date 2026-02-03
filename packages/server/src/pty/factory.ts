import * as crypto from "node:crypto";

import type { IDisposable, PtyFactory, PtyFactoryOptions, PtyProcess } from "./types.js";

function createDisposable<T>(list: T[], item: T): IDisposable {
  list.push(item);
  return {
    dispose: () => {
      const idx = list.indexOf(item);
      if (idx !== -1) list.splice(idx, 1);
    },
  };
}

interface SpawnInput {
  shell: string;
  args: string[];
  options: PtyFactoryOptions;
  dataCallbacks: Array<(data: string) => void>;
}

function spawnProcess(input: SpawnInput) {
  return Bun.spawn([input.shell, ...input.args], {
    cwd: input.options.cwd ?? process.cwd(),
    ...(input.options.env ? { env: input.options.env } : {}),
    terminal: {
      cols: input.options.cols ?? 80,
      rows: input.options.rows ?? 24,
      data(_terminal, data) {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        for (const cb of input.dataCallbacks) cb(text);
      },
    },
  });
}

export const bunPtyFactory: PtyFactory = (
  shell: string,
  args: string[],
  options: PtyFactoryOptions,
): PtyProcess => {
  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(e: { exitCode: number; signal?: number }) => void> = [];

  const proc = spawnProcess({ shell, args, options, dataCallbacks });

  proc.exited.then((exitCode) => {
    for (const cb of exitCallbacks) cb({ exitCode });
  });

  return {
    get pid() { return proc.pid; },
    write: (data: string) => proc.terminal!.write(data),
    resize: (cols: number, rows: number) => proc.terminal!.resize(cols, rows),
    kill: () => proc.kill(),
    onData: (cb) => createDisposable(dataCallbacks, cb),
    onExit: (cb) => createDisposable(exitCallbacks, cb),
  };
};

export function generateSessionId(): string {
  return crypto.randomUUID();
}
