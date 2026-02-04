import type {
  PaneState,
  PtyManager,
  PtySession,
  PtySessionEvents,
  PtySpawnOptions,
} from "@vibx/shared";

import type { InternalPtySession, PtyFactory } from "./types.js";

export interface PtyManagerDeps {
  factory: PtyFactory;
  generateId: () => string;
}

interface SessionContext {
  deps: PtyManagerDeps;
  sessions: Map<string, InternalPtySession>;
}

function toPublicSession(s: InternalPtySession): PtySession {
  return { id: s.id, shell: s.shell, pid: s.process.pid };
}

function getSessionOrThrow(ctx: SessionContext, id: string): InternalPtySession {
  const session = ctx.sessions.get(id);
  if (!session) {
    throw new Error(`PTY session not found: ${id}`);
  }
  return session;
}

function attachEvents(
  ctx: SessionContext,
  session: InternalPtySession,
  events: PtySessionEvents,
): void {
  const dataDisposable = session.process.onData((data) => {
    events.onData(session.id, data);
  });

  const exitDisposable = session.process.onExit((e) => {
    events.onExit(session.id, e.exitCode, e.signal);
    ctx.sessions.delete(session.id);
  });

  session.disposables.push(dataDisposable, exitDisposable);
}

function spawnProcess(
  ctx: SessionContext,
  options: PtySpawnOptions,
): InternalPtySession {
  const id = ctx.deps.generateId();
  const cwd = options.cwd ?? globalThis.process.cwd();
  const ptyProcess = ctx.deps.factory(options.shell, options.args ?? [], {
    env: options.env,
    cols: options.size?.cols,
    rows: options.size?.rows,
    cwd: options.cwd,
  });

  const paneState: PaneState = {
    id,
    title: options.shell,
    cwd,
    bell: false,
    pendingStdin: false,
    notes: [],
  };

  return { id, shell: options.shell, process: ptyProcess, disposables: [], paneState };
}

function createSession(
  ctx: SessionContext,
  options: PtySpawnOptions,
  events: PtySessionEvents,
): PtySession {
  const session = spawnProcess(ctx, options);
  ctx.sessions.set(session.id, session);
  attachEvents(ctx, session, events);
  return toPublicSession(session);
}

function destroySession(ctx: SessionContext, id: string): void {
  const session = getSessionOrThrow(ctx, id);
  session.disposables.forEach((d) => d.dispose());
  session.process.kill();
  ctx.sessions.delete(id);
}

function destroyAllSessions(ctx: SessionContext): void {
  const ids = [...ctx.sessions.keys()];
  ids.forEach((id) => destroySession(ctx, id));
}

export function createPtyManager(deps: PtyManagerDeps): PtyManager {
  const ctx: SessionContext = { deps, sessions: new Map() };

  return {
    create: (options, events) => createSession(ctx, options, events),
    write: (id, data) => getSessionOrThrow(ctx, id).process.write(data),
    resize: (id, size) => getSessionOrThrow(ctx, id).process.resize(size.cols, size.rows),
    getSession: (id) => {
      const s = ctx.sessions.get(id);
      return s ? toPublicSession(s) : undefined;
    },
    getSessions: () => [...ctx.sessions.values()].map(toPublicSession),
    getPaneState: (id) => {
      const s = ctx.sessions.get(id);
      return s ? { ...s.paneState } : undefined;
    },
    getPaneStates: () => [...ctx.sessions.values()].map((s) => ({ ...s.paneState })),
    updatePaneState: (id, patch) => {
      const session = getSessionOrThrow(ctx, id);
      Object.assign(session.paneState, patch);
      return { ...session.paneState };
    },
    destroy: (id) => destroySession(ctx, id),
    destroyAll: () => destroyAllSessions(ctx),
  };
}
