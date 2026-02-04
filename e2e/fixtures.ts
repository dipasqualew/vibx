import { test as base, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export { expect };

interface ServerInfo {
  serverUrl: string;
  port: number;
  dataDir: string;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        reject(new Error("Failed to get free port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/sessions`);
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

export const test = base.extend<{ server: ServerInfo }>({
  server: async ({ }, use) => {
    const port = await getFreePort();
    const dataDir = await mkdtemp(join(tmpdir(), "vibx-test-"));
    const serverUrl = `http://localhost:${port}`;

    const serverProcess: ChildProcess = spawn("bun", ["run", "src/main.ts"], {
      cwd: join(__dirname, "..", "packages", "server"),
      env: {
        ...process.env,
        PORT: String(port),
        VIBX_DATA_DIR: dataDir,
      },
      stdio: "pipe",
    });

    await waitForServer(serverUrl);

    await use({ serverUrl, port, dataDir });

    serverProcess.kill("SIGTERM");
    await rm(dataDir, { recursive: true, force: true });
  },

  page: async ({ page, server }, use) => {
    await page.addInitScript((url: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__VIBX_SERVER_URL = url;
    }, server.serverUrl);
    await use(page);
  },
});
