import type {
  PtyManager,
  PtySession,
  PtySpawnOptions,
  WsServerMessage,
} from "@vibx/shared";

import { isWsClientMessage } from "@vibx/shared";

import type { ConnectionRegistry, WsConnection } from "./types.js";

export interface WsBridgeDeps {
  ptyManager: PtyManager;
  registry: ConnectionRegistry;
}

export interface CreateSessionOptions {
  shell?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
}

export interface WsBridge {
  handleOpen: (ws: WsConnection, sessionId: string) => void;
  handleMessage: (ws: WsConnection, sessionId: string, raw: string) => void;
  handleClose: (ws: WsConnection, sessionId: string) => void;
  attachSession: (sessionId: string, options: PtySpawnOptions) => PtySession;
  createSession: (options?: CreateSessionOptions) => PtySession;
  listSessions: () => PtySession[];
  destroySession: (id: string) => void;
}

function sendMessage(ws: WsConnection, msg: WsServerMessage): void {
  ws.send(JSON.stringify(msg));
}

function broadcastMessage(
  registry: ConnectionRegistry,
  sessionId: string,
  msg: WsServerMessage,
): void {
  registry.broadcast(sessionId, JSON.stringify(msg));
}

function handleOpen(deps: WsBridgeDeps, ws: WsConnection, sessionId: string): void {
  const session = deps.ptyManager.getSession(sessionId);
  if (!session) {
    sendMessage(ws, { type: "error", message: `Session not found: ${sessionId}` });
    ws.close(4004, "Session not found");
    return;
  }

  deps.registry.add(sessionId, ws);
  sendMessage(ws, {
    type: "session_info",
    sessionId: session.id,
    shell: session.shell,
    pid: session.pid,
  });
}

function handleMessage(
  deps: WsBridgeDeps,
  sessionId: string,
  raw: string,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return;
  }

  if (!isWsClientMessage(parsed)) return;

  if (parsed.type === "input") {
    deps.ptyManager.write(sessionId, parsed.data);
  } else {
    deps.ptyManager.resize(sessionId, { cols: parsed.cols, rows: parsed.rows });
  }
}

function handleClose(deps: WsBridgeDeps, ws: WsConnection, sessionId: string): void {
  deps.registry.remove(sessionId, ws);
}

function detectBell(deps: WsBridgeDeps, id: string, data: string): void {
  if (data.includes("\x07")) {
    deps.ptyManager.updatePaneState(id, { bell: true });
  }
}

function buildExitMessage(code: number, signal?: number): WsServerMessage {
  if (signal !== undefined) {
    return { type: "exit", code, signal };
  }
  return { type: "exit", code };
}

function attachSession(
  deps: WsBridgeDeps,
  sessionId: string,
  options: PtySpawnOptions,
): PtySession {
  return deps.ptyManager.create(options, {
    onData: (_id, data) => {
      detectBell(deps, sessionId, data);
      broadcastMessage(deps.registry, sessionId, { type: "output", data });
    },
    onExit: (_id, code, signal) => {
      broadcastMessage(deps.registry, sessionId, buildExitMessage(code, signal));
    },
  });
}

const SESSION_DEFAULTS: Required<Pick<CreateSessionOptions, "shell" | "cols" | "rows">> = {
  shell: process.env["SHELL"] || "bash",
  cols: 80,
  rows: 24,
};

function resolveSpawnOptions(options?: CreateSessionOptions): PtySpawnOptions {
  const resolved = { ...SESSION_DEFAULTS, ...options };
  const spawn: PtySpawnOptions = { shell: resolved.shell, size: { cols: resolved.cols, rows: resolved.rows } };
  if (resolved.cwd) spawn.cwd = resolved.cwd;
  return spawn;
}

function createSessionWithDefaults(
  deps: WsBridgeDeps,
  options?: CreateSessionOptions,
): PtySession {
  return deps.ptyManager.create(resolveSpawnOptions(options), {
    onData: (id, data) => {
      detectBell(deps, id, data);
      broadcastMessage(deps.registry, id, { type: "output", data });
    },
    onExit: (id, code, signal) => {
      broadcastMessage(deps.registry, id, buildExitMessage(code, signal));
    },
  });
}

export function createWsBridge(deps: WsBridgeDeps): WsBridge {
  return {
    handleOpen: (ws, sessionId) => handleOpen(deps, ws, sessionId),
    handleMessage: (_ws, sessionId, raw) => handleMessage(deps, sessionId, raw),
    handleClose: (ws, sessionId) => handleClose(deps, ws, sessionId),
    attachSession: (sessionId, options) => attachSession(deps, sessionId, options),
    createSession: (options) => createSessionWithDefaults(deps, options),
    listSessions: () => deps.ptyManager.getSessions(),
    destroySession: (id) => deps.ptyManager.destroy(id),
  };
}
