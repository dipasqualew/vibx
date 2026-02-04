import { createHash } from "node:crypto";
import { defineConfig } from "@playwright/test";

function getClientPort(): number {
  const hash = createHash("md5").update(process.cwd()).digest();
  return 10000 + (hash.readUInt16BE(0) % 50000);
}

const clientPort = getClientPort();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  use: {
    baseURL: `http://localhost:${clientPort}`,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `bun run --filter '@vibx2/client' dev -- --port ${clientPort}`,
      port: clientPort,
      reuseExistingServer: !process.env["CI"],
    },
  ],
});
