import { join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import type { Action } from "@vibx/shared";

export interface ActionsStoreDeps {
  dataDir: string;
}

export interface ActionsStore {
  listActions: (userId: string) => Promise<Action[]>;
  getAction: (userId: string, actionId: string) => Promise<Action | null>;
  createAction: (userId: string, input: Omit<Action, "id">) => Promise<Action>;
  updateAction: (userId: string, actionId: string, patch: Partial<Omit<Action, "id">>) => Promise<Action>;
  deleteAction: (userId: string, actionId: string) => Promise<void>;
}

function actionsPath(dataDir: string, userId: string): string {
  return join(dataDir, userId, "actions.json");
}

async function readActions(dataDir: string, userId: string): Promise<Action[]> {
  const filePath = actionsPath(dataDir, userId);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Action[]) : [];
  } catch {
    console.warn(`Corrupt actions file at ${filePath}, returning empty array`);
    return [];
  }
}

async function writeActions(dataDir: string, userId: string, actions: Action[]): Promise<void> {
  const filePath = actionsPath(dataDir, userId);
  const dir = join(dataDir, userId);
  await mkdir(dir, { recursive: true });
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, JSON.stringify(actions, null, 2), "utf-8");
  await rename(tmpPath, filePath);
}

export function createActionsStore(deps: ActionsStoreDeps): ActionsStore {
  const { dataDir } = deps;

  return {
    async listActions(userId) {
      return readActions(dataDir, userId);
    },

    async getAction(userId, actionId) {
      const actions = await readActions(dataDir, userId);
      return actions.find((a) => a.id === actionId) ?? null;
    },

    async createAction(userId, input) {
      const actions = await readActions(dataDir, userId);
      const action: Action = { id: randomUUID(), ...input };
      actions.push(action);
      await writeActions(dataDir, userId, actions);
      return action;
    },

    async updateAction(userId, actionId, patch) {
      const actions = await readActions(dataDir, userId);
      const index = actions.findIndex((a) => a.id === actionId);
      if (index === -1) {
        throw new Error(`Action not found: ${actionId}`);
      }
      const updated = { ...actions[index], ...patch, id: actionId } as Action;
      actions[index] = updated;
      await writeActions(dataDir, userId, actions);
      return updated;
    },

    async deleteAction(userId, actionId) {
      const actions = await readActions(dataDir, userId);
      const filtered = actions.filter((a) => a.id !== actionId);
      await writeActions(dataDir, userId, filtered);
    },
  };
}
