import type { PtyManager } from "@vibx2/shared";

import type { IssuesRouteDeps, GitHubRouteDeps } from "../issues/routes.js";
import { handleIssuesRequest, handleGitHubRequest } from "../issues/routes.js";
import type { PaneRouteDeps } from "../pty/routes.js";
import { handlePanesRequest } from "../pty/routes.js";
import type { SettingsRouteDeps } from "../settings/routes.js";
import type { SettingsStore } from "../settings/store.js";
import { handleSettingsRequest } from "../settings/routes.js";
import { createWsBridge } from "./bridge.js";
import type { CreateSessionOptions, WsBridge } from "./bridge.js";
import { createConnectionRegistry } from "./registry.js";
import type { WsConnection, WsConnectionData } from "./types.js";

export interface WsServerConfig {
  port: number;
  ptyManager: PtyManager;
  userId: string;
  settingsStore: SettingsStore;
  createIssuesBackend: () => Promise<import("@vibx2/issues").IssuesBackend>;
}

type PtyWebSocket = Bun.ServerWebSocket<WsConnectionData>;

function parseSessionId(url: string): string | undefined {
  const match = /\/ws\/pty\/([^/]+)/.exec(url);
  return match?.[1];
}

function createWsWrapper(ws: PtyWebSocket): WsConnection {
  return {
    send: (data) => ws.send(data),
    close: (code, reason) => ws.close(code, reason),
  };
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function parseApiSessionId(pathname: string): string | undefined {
  const match = /^\/api\/sessions\/([^/]+)$/.exec(pathname);
  return match?.[1];
}

async function handleCreateSession(req: Request, bridge: WsBridge): Promise<Response> {
  let options: CreateSessionOptions | undefined;
  try {
    options = (await req.json()) as CreateSessionOptions;
  } catch {
    // no body is fine, use defaults
  }
  const session = bridge.createSession(options);
  return jsonResponse({ sessionId: session.id, shell: session.shell, pid: session.pid }, 201);
}

function handleListSessions(bridge: WsBridge): Response {
  const sessions = bridge.listSessions().map((s) => ({
    sessionId: s.id,
    shell: s.shell,
    pid: s.pid,
  }));
  return jsonResponse(sessions);
}

function handleDeleteSession(id: string, bridge: WsBridge): Response {
  bridge.destroySession(id);
  return jsonResponse({ ok: true });
}

type RouteHandler = (req: Request, bridge: WsBridge) => Promise<Response> | Response;

const sessionRoutes: Record<string, RouteHandler> = {
  POST: handleCreateSession,
  GET: (_req, bridge) => handleListSessions(bridge),
};

function matchSessionRoute(req: Request, bridge: WsBridge): Promise<Response> | Response | null {
  return sessionRoutes[req.method]?.(req, bridge) ?? null;
}

function matchResourceRoute(pathname: string, req: Request, bridge: WsBridge): Response | null {
  const id = parseApiSessionId(pathname);
  return id && req.method === "DELETE" ? handleDeleteSession(id, bridge) : null;
}

function routeByPathname(req: Request, bridge: WsBridge): Promise<Response | null> | Response | null {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/sessions") return matchSessionRoute(req, bridge);
  return matchResourceRoute(pathname, req, bridge);
}

async function handleApiRequest(req: Request, bridge: WsBridge): Promise<Response | null> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return routeByPathname(req, bridge);
}

interface ServeOptionsDeps {
  config: WsServerConfig;
  bridge: WsBridge;
  settingsRouteDeps: SettingsRouteDeps;
  issuesRouteDeps: IssuesRouteDeps;
  githubRouteDeps: GitHubRouteDeps;
  paneRouteDeps: PaneRouteDeps;
  getWrapper: (ws: PtyWebSocket) => WsConnection;
}

function buildServeOptions(deps: ServeOptionsDeps): Bun.Serve.Options<WsConnectionData> {
  const { config, bridge, settingsRouteDeps, issuesRouteDeps, githubRouteDeps, paneRouteDeps, getWrapper } = deps;
  return {
    port: config.port,
    async fetch(req, srv) {
      const settingsResponse = await handleSettingsRequest(req, settingsRouteDeps);
      if (settingsResponse) return settingsResponse;

      const issuesResponse = await handleIssuesRequest(req, issuesRouteDeps);
      if (issuesResponse) return issuesResponse;

      const githubResponse = await handleGitHubRequest(req, githubRouteDeps);
      if (githubResponse) return githubResponse;

      const panesResponse = await handlePanesRequest(req, paneRouteDeps);
      if (panesResponse) return panesResponse;

      const apiResponse = await handleApiRequest(req, bridge);
      if (apiResponse) return apiResponse;

      const sessionId = parseSessionId(req.url);
      if (!sessionId) {
        return new Response("Not Found", { status: 404 });
      }

      const data: WsConnectionData = { sessionId };
      const upgraded = srv.upgrade(req, { data });
      return upgraded ? undefined : new Response("Upgrade failed", { status: 500 });
    },
    websocket: {
      open(ws) {
        bridge.handleOpen(getWrapper(ws), ws.data.sessionId);
      },
      message(ws, message) {
        const raw = typeof message === "string" ? message : message.toString();
        bridge.handleMessage(getWrapper(ws), ws.data.sessionId, raw);
      },
      close(ws) {
        bridge.handleClose(getWrapper(ws), ws.data.sessionId);
      },
    },
  };
}

export function createWsServer(config: WsServerConfig): { start: () => void; stop: () => void } {
  const registry = createConnectionRegistry();
  const bridge = createWsBridge({ ptyManager: config.ptyManager, registry });
  const wrappers = new WeakMap<PtyWebSocket, WsConnection>();

  function getWrapper(ws: PtyWebSocket): WsConnection {
    let wrapper = wrappers.get(ws);
    if (!wrapper) {
      wrapper = createWsWrapper(ws);
      wrappers.set(ws, wrapper);
    }
    return wrapper;
  }

  const settingsRouteDeps: SettingsRouteDeps = {
    settingsStore: config.settingsStore,
    userId: config.userId,
  };
  const issuesRouteDeps: IssuesRouteDeps = {
    getBackend: config.createIssuesBackend,
  };
  const githubRouteDeps: GitHubRouteDeps = {
    getToken: async () => {
      const settings = await config.settingsStore.getSettings(config.userId);
      return settings.issue_provider__github__github_token || null;
    },
  };
  const paneRouteDeps: PaneRouteDeps = {
    ptyManager: config.ptyManager,
  };
  const options = buildServeOptions({ config, bridge, settingsRouteDeps, issuesRouteDeps, githubRouteDeps, paneRouteDeps, getWrapper });
  let server: Bun.Server<WsConnectionData> | undefined;

  return {
    start() {
      server = Bun.serve<WsConnectionData>(options);
    },
    stop() {
      server?.stop();
    },
  };
}
