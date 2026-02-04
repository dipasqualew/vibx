import { homedir } from "node:os";
import { join } from "node:path";

import { GitHubIssuesBackend, FileSystemIssuesBackend } from "@vibx2/issues";
import type { IssuesBackend } from "@vibx2/issues";

import { createPtyManager, bunPtyFactory, generateSessionId, createWsServer } from "./index.js";
import { createSettingsStore } from "./settings/store.js";

const PORT = Number(process.env["PORT"] ?? 3000);

const userId = (await Bun.$`whoami`.text()).trim();
const dataDir = process.env["VIBX_DATA_DIR"] ?? join(homedir(), ".vibx");

const ptyManager = createPtyManager({
  factory: bunPtyFactory,
  generateId: generateSessionId,
});

const settingsStore = createSettingsStore({ dataDir });

async function createIssuesBackend(): Promise<IssuesBackend> {
  const settings = await settingsStore.getSettings(userId);
  const token = settings.issue_provider__github__github_token;
  if (token) {
    return new GitHubIssuesBackend({
      owner: "",
      repo: "",
      token,
      repositories: settings.issue_provider__github__repositories,
    });
  }
  return new FileSystemIssuesBackend(join(dataDir, userId, "issues"));
}

const server = createWsServer({ port: PORT, ptyManager, userId, settingsStore, createIssuesBackend });
server.start();

console.log(`Server listening on http://localhost:${PORT} (user: ${userId})`);

process.on("SIGINT", () => {
  ptyManager.destroyAll();
  server.stop();
  process.exit(0);
});
