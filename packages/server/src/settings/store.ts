import { join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

import type { UserSettings } from "@vibx2/shared";
import { DEFAULT_USER_SETTINGS } from "@vibx2/shared";

export interface SettingsStoreDeps {
  dataDir: string;
}

export interface SettingsStore {
  getSettings: (userId: string) => Promise<UserSettings>;
  updateSettings: (userId: string, patch: Partial<UserSettings>) => Promise<UserSettings>;
}

function settingsPath(dataDir: string, userId: string): string {
  return join(dataDir, userId, "settings.json");
}

export function createSettingsStore(deps: SettingsStoreDeps): SettingsStore {
  const { dataDir } = deps;

  return {
    async getSettings(userId) {
      const filePath = settingsPath(dataDir, userId);
      let raw: string;
      try {
        raw = await readFile(filePath, "utf-8");
      } catch (err: unknown) {
        if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return { ...DEFAULT_USER_SETTINGS };
        }
        throw err;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        return { ...DEFAULT_USER_SETTINGS, ...(parsed as Partial<UserSettings>) };
      } catch {
        console.warn(`Corrupt settings file at ${filePath}, returning defaults`);
        return { ...DEFAULT_USER_SETTINGS };
      }
    },

    async updateSettings(userId, patch) {
      const current = await this.getSettings(userId);
      const updated: UserSettings = { ...current, ...patch };
      const filePath = settingsPath(dataDir, userId);
      const dir = join(dataDir, userId);
      await mkdir(dir, { recursive: true });
      const tmpPath = filePath + ".tmp";
      await writeFile(tmpPath, JSON.stringify(updated, null, 2), "utf-8");
      await rename(tmpPath, filePath);
      return updated;
    },
  };
}
