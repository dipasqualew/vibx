import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test, expect } from "./fixtures.js";
import type { Page } from "@playwright/test";

const userId = execSync("whoami").toString().trim();

async function seedIssue(dataDir: string, number: number, opts: { title: string; status: string; labels: string[]; body: string }): Promise<void> {
  const dir = join(dataDir, userId, "issues", String(number));
  await mkdir(dir, { recursive: true });
  let fm = "---\n";
  fm += `title: "${opts.title}"\n`;
  fm += `status: ${opts.status}\n`;
  fm += "labels:\n";
  for (const label of opts.labels) {
    fm += `  - ${label}\n`;
  }
  fm += "---\n";
  await writeFile(join(dir, "issue.md"), fm + opts.body + "\n");
}

async function seedHistory(dataDir: string, lines: string): Promise<void> {
  const dir = join(dataDir, userId, "issues");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "history.log"), lines);
}

function getTerminalBufferContent(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const elements = document.querySelectorAll(sel);
    let el: Element | null = null;
    for (const candidate of elements) {
      if ((candidate as HTMLElement).offsetParent !== null) {
        el = candidate;
        break;
      }
    }
    if (!el) el = document.querySelector(sel);
    // @ts-expect-error — xterm stores the Terminal instance on the element
    const term = (el as Record<string, unknown>)?.__terminal;
    if (!term) return "";
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i)?.translateToString(true) ?? "";
      if (line) lines.push(line);
    }
    return lines.join("\n");
  }, selector);
}

async function waitForPrompt(page: Page, selector: string) {
  await expect(page.locator(`${selector}[data-ws-ready]`).first()).toBeAttached({
    timeout: 10_000,
  });
  await expect
    .poll(() => getTerminalBufferContent(page, selector), {
      timeout: 10_000,
      message: `waiting for shell prompt in ${selector}`,
    })
    .toContain("$");
}

async function clickLauncherButton(page: Page, label: string) {
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 10_000 });
  await page.locator(".pane-launcher-button", { hasText: label }).click();
}

test("blank terminal button spawns a default shell session", async ({ page }) => {
  await page.goto("/");

  await clickLauncherButton(page, "Blank terminal");

  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  const xtermInput = page.locator(".xterm textarea");
  await xtermInput.pressSequentially('echo "launcher-test"');
  await xtermInput.press("Enter");

  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 10_000,
      message: "waiting for launcher-test in output",
    })
    .toContain("launcher-test");
});

test("start claude code spawns session with configured agent framework", async ({ page, server }) => {
  // Pre-configure the agent framework via the settings API
  await page.evaluate((serverUrl) =>
    fetch(`${serverUrl}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_agent_framework: "mock-code" }),
    }),
    server.serverUrl,
  );

  await page.goto("/");

  await clickLauncherButton(page, "Start Claude Code");

  // Wait for a terminal to appear
  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });

  // Verify the session was created with shell: "mock-code"
  // by checking the sessions API
  await expect
    .poll(async () => {
      const sessions = await page.evaluate((serverUrl) =>
        fetch(`${serverUrl}/api/sessions`).then((r) => r.json()),
        server.serverUrl,
      );
      return sessions;
    }, { timeout: 10_000, message: "waiting for session with mock-code shell" })
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shell: "mock-code" }),
      ]),
    );
});

test("trigger action button opens issue picker and then action picker", async ({ page, server }) => {
  // Seed an issue on disk
  await seedIssue(server.dataDir, 1, { title: "Test issue", status: "todo", labels: [], body: "Issue body" });
  await seedHistory(server.dataDir, "1 todo\n");

  // Create an action via API
  await page.evaluate((serverUrl) =>
    fetch(`${serverUrl}/api/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Action",
        scope: "global",
        steps: [{ type: "run-bash-command", command: "echo action-executed" }],
      }),
    }),
    server.serverUrl,
  );

  await page.goto("/");

  // Click trigger action button
  await clickLauncherButton(page, "Trigger action");

  // Should show issue picker
  await expect(page.locator(".pane-picker-title")).toHaveText("Select issue", { timeout: 10_000 });
  await expect(page.locator(".pane-picker-list")).toBeVisible({ timeout: 10_000 });

  // Select the first issue
  const issueItem = page.locator(".pane-picker-item").first();
  await expect(issueItem).toBeVisible({ timeout: 10_000 });
  await issueItem.click();

  // Should show action picker
  await expect(page.locator(".pane-picker-title")).toHaveText("Select action", { timeout: 10_000 });
  const actionItem = page.locator(".pane-picker-item", { hasText: "Test Action" });
  await expect(actionItem).toBeVisible({ timeout: 10_000 });
  await actionItem.click();

  // Should activate a terminal session
  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
});

test("trigger action picker back button restores launcher", async ({ page }) => {
  await page.goto("/");

  // Click trigger action button
  await clickLauncherButton(page, "Trigger action");

  // Should show issue picker
  await expect(page.locator(".pane-picker-title")).toHaveText("Select issue", { timeout: 10_000 });

  // Click back
  await page.locator(".pane-picker-back").click();

  // Should restore the launcher
  await expect(page.locator(".pane-launcher-button", { hasText: "Trigger action" })).toBeVisible({ timeout: 10_000 });
});

test("new tab via Cmd+T shows launcher", async ({ page }) => {
  await page.goto("/");

  // First tab should show launcher
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 10_000 });

  // Click blank terminal to activate
  await clickLauncherButton(page, "Blank terminal");
  await expect(page.locator(".xterm")).toBeVisible({ timeout: 10_000 });

  // Open second tab
  await page.keyboard.press("Meta+t");
  await expect(page.locator(".tab")).toHaveCount(2, { timeout: 5_000 });

  // Second tab should show launcher
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 5_000 });
});

test("split pane shows launcher in the new pane", async ({ page }) => {
  await page.goto("/");

  // Activate the first pane
  await clickLauncherButton(page, "Blank terminal");
  await expect(page.locator(".xterm")).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Split vertically
  await page.keyboard.press("Meta+d");

  // Should have 2 pane leaves
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

  // The new pane should show the launcher
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 5_000 });
});
