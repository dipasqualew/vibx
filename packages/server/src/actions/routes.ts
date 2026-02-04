import type { Action } from "@vibx/shared";
import type { PtyManager } from "@vibx/shared";
import type { IssuesBackend } from "@vibx/issues";

import type { ActionsStore } from "./store.js";
import { runAction } from "./engine.js";
import type { IssueContext } from "./interpolate.js";

export interface ActionsRouteDeps {
  actionsStore: ActionsStore;
  userId: string;
  getBackend: () => Promise<IssuesBackend>;
  ptyManager: PtyManager;
  sleep: (ms: number) => Promise<void>;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function parseActionRunId(pathname: string): string | undefined {
  const match = /^\/api\/actions\/([^/]+)\/run$/.exec(pathname);
  return match?.[1];
}

function parseActionId(pathname: string): string | undefined {
  const match = /^\/api\/actions\/([^/]+)$/.exec(pathname);
  return match?.[1];
}

async function handleList(deps: ActionsRouteDeps): Promise<Response> {
  const actions = await deps.actionsStore.listActions(deps.userId);
  return jsonResponse(actions);
}

async function handleCreate(req: Request, deps: ActionsRouteDeps): Promise<Response> {
  const body = (await req.json()) as Omit<Action, "id">;
  const action = await deps.actionsStore.createAction(deps.userId, body);
  return jsonResponse(action, 201);
}

async function handleUpdate(req: Request, actionId: string, deps: ActionsRouteDeps): Promise<Response> {
  const patch = (await req.json()) as Partial<Omit<Action, "id">>;
  try {
    const updated = await deps.actionsStore.updateAction(deps.userId, actionId, patch);
    return jsonResponse(updated);
  } catch {
    return jsonResponse({ error: "Action not found" }, 404);
  }
}

async function handleDelete(actionId: string, deps: ActionsRouteDeps): Promise<Response> {
  await deps.actionsStore.deleteAction(deps.userId, actionId);
  return jsonResponse({ ok: true });
}

async function handleRun(req: Request, actionId: string, deps: ActionsRouteDeps): Promise<Response> {
  const action = await deps.actionsStore.getAction(deps.userId, actionId);
  if (!action) return jsonResponse({ error: "Action not found" }, 404);

  let issue: IssueContext | undefined;
  try {
    const body = (await req.json()) as { issue?: IssueContext };
    issue = body.issue;
  } catch {
    // no body is fine
  }

  await runAction(action, issue, {
    getBackend: deps.getBackend,
    ptyManager: deps.ptyManager,
    sleep: deps.sleep,
  });

  return jsonResponse({ ok: true });
}

export async function handleActionsRequest(
  req: Request,
  deps: ActionsRouteDeps,
): Promise<Response | null> {
  const { pathname } = new URL(req.url);

  if (pathname === "/api/actions") {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method === "GET") return handleList(deps);
    if (req.method === "POST") return handleCreate(req, deps);
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const runActionId = parseActionRunId(pathname);
  if (runActionId) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method === "POST") return handleRun(req, runActionId, deps);
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const actionId = parseActionId(pathname);
  if (!actionId) return null;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method === "GET") {
    const action = await deps.actionsStore.getAction(deps.userId, actionId);
    if (!action) return jsonResponse({ error: "Action not found" }, 404);
    return jsonResponse(action);
  }
  if (req.method === "PUT") return handleUpdate(req, actionId, deps);
  if (req.method === "DELETE") return handleDelete(actionId, deps);

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
}
