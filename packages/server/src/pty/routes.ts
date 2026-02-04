import type { PaneStatePatch, PtyManager } from "@vibx2/shared";

export interface PaneRouteDeps {
  ptyManager: PtyManager;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function handleGetAll(deps: PaneRouteDeps): Response {
  return jsonResponse(deps.ptyManager.getPaneStates());
}

function handleGetOne(id: string, deps: PaneRouteDeps): Response {
  const state = deps.ptyManager.getPaneState(id);
  if (!state) {
    return jsonResponse({ error: "Pane not found" }, 404);
  }
  return jsonResponse(state);
}

async function handlePatch(id: string, req: Request, deps: PaneRouteDeps): Promise<Response> {
  const state = deps.ptyManager.getPaneState(id);
  if (!state) {
    return jsonResponse({ error: "Pane not found" }, 404);
  }

  const patch = (await req.json()) as PaneStatePatch;
  const updated = deps.ptyManager.updatePaneState(id, patch);
  return jsonResponse(updated);
}

function parsePaneId(pathname: string): string | undefined {
  const match = /^\/api\/panes\/([^/]+)$/.exec(pathname);
  return match?.[1];
}

export async function handlePanesRequest(
  req: Request,
  deps: PaneRouteDeps,
): Promise<Response | null> {
  const { pathname } = new URL(req.url);

  if (pathname === "/api/panes") {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method === "GET") return handleGetAll(deps);
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const id = parsePaneId(pathname);
  if (!id) return null;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method === "GET") return handleGetOne(id, deps);
  if (req.method === "PATCH") return handlePatch(id, req, deps);
  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
}
