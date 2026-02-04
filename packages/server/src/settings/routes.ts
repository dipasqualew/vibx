import type { UserSettings } from "@vibx/shared";

import type { SettingsStore } from "./store.js";

export interface SettingsRouteDeps {
  settingsStore: SettingsStore;
  userId: string;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function handleGet(deps: SettingsRouteDeps): Promise<Response> {
  const settings = await deps.settingsStore.getSettings(deps.userId);
  return jsonResponse(settings);
}

async function handlePut(req: Request, deps: SettingsRouteDeps): Promise<Response> {
  const patch = (await req.json()) as Partial<UserSettings>;
  const updated = await deps.settingsStore.updateSettings(deps.userId, patch);
  return jsonResponse(updated);
}

export async function handleSettingsRequest(
  req: Request,
  deps: SettingsRouteDeps,
): Promise<Response | null> {
  const { pathname } = new URL(req.url);
  if (pathname !== "/api/settings") return null;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method === "GET") return handleGet(deps);
  if (req.method === "PUT") return handlePut(req, deps);

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
}
