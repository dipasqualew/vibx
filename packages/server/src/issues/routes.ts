import type { IssuesBackend } from "@vibx2/issues";

export interface IssuesRouteDeps {
  getBackend: () => Promise<IssuesBackend>;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function handleList(deps: IssuesRouteDeps): Promise<Response> {
  try {
    const backend = await deps.getBackend();
    const issues = await backend.listIssues();
    return jsonResponse(issues);
  } catch (err) {
    console.error("Failed to list issues:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
}

export async function handleIssuesRequest(
  req: Request,
  deps: IssuesRouteDeps,
): Promise<Response | null> {
  const { pathname } = new URL(req.url);
  if (pathname !== "/api/issues") return null;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method === "GET") return handleList(deps);

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
}
