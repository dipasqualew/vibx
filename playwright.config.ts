import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "bun run --filter '@vibx2/client' dev -- --port 5174",
      port: 5174,
      reuseExistingServer: !process.env["CI"],
    },
  ],
});
