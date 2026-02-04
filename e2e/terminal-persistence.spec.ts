import { test, expect } from "./fixtures.js";
import type { Page } from "@playwright/test";

function getTerminalBufferContent(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
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
  await expect
    .poll(() => getTerminalBufferContent(page, selector), {
      timeout: 10_000,
      message: `waiting for shell prompt in ${selector}`,
    })
    .toContain("$");
}

test("terminal sessions persist across tab navigation", async ({ page }) => {
  await page.goto("/");

  // Wait for the terminal to be ready
  const terminal = page.locator(".xterm").first();
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Set an env var as a marker in the shell session
  const xtermInput = page.locator(".xterm textarea").first();
  await xtermInput.pressSequentially("export VIBX_MARKER=persist_test");
  await xtermInput.press("Enter");

  // Wait for the command to execute
  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 5_000,
    })
    .toContain("VIBX_MARKER=persist_test");

  // Navigate away to settings
  await page.locator(".v-app-bar").getByText("Settings").click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
    timeout: 5_000,
  });

  // Navigate back to terminal
  await page.locator(".v-app-bar").getByText("Terminal").click();

  // Terminal should reappear with a restored session
  await expect(page.locator(".xterm").first()).toBeVisible({ timeout: 10_000 });

  // The terminal may have been recreated with an empty buffer, so press Enter
  // to trigger a fresh prompt before waiting.
  const restoredInput = page.locator(".xterm textarea").first();
  await restoredInput.press("Enter");
  await waitForPrompt(page, ".terminal-container");
  await restoredInput.pressSequentially("echo $VIBX_MARKER");
  await restoredInput.press("Enter");

  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 5_000,
      message: "waiting for marker in restored session",
    })
    .toContain("persist_test");
});

test("multiple tabs persist across tab navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".xterm").first()).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Open a second tab with Cmd+T
  await page.keyboard.press("Meta+t");
  await expect(page.locator(".tab")).toHaveCount(2, { timeout: 5_000 });

  // Navigate away
  await page.locator(".v-app-bar").getByText("Settings").click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
    timeout: 5_000,
  });

  // Navigate back
  await page.locator(".v-app-bar").getByText("Terminal").click();

  // Both tabs should be restored
  await expect(page.locator(".tab")).toHaveCount(2, { timeout: 10_000 });

  // The active tab's terminal should be visible
  await expect(page.locator(".tab.active")).toHaveCount(1, { timeout: 5_000 });

  // The terminal may have been recreated with an empty buffer, so press Enter
  // to trigger a fresh prompt before waiting.
  const restoredInput = page.locator(".xterm textarea").first();
  await restoredInput.press("Enter");
  await waitForPrompt(page, ".terminal-container");
});

test("terminal sessions persist across page refresh", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".xterm").first()).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Set a marker
  const xtermInput = page.locator(".xterm textarea").first();
  await xtermInput.pressSequentially("export VIBX_REFRESH=refresh_test");
  await xtermInput.press("Enter");

  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 5_000,
    })
    .toContain("VIBX_REFRESH=refresh_test");

  // Refresh the page
  await page.reload();

  // Terminal should reappear with restored session
  await expect(page.locator(".xterm").first()).toBeVisible({ timeout: 10_000 });

  // After reload the xterm buffer is empty because the terminal is recreated.
  // The shell already printed its prompt before reconnection, so we press Enter
  // to trigger a fresh prompt.
  const refreshedInput = page.locator(".xterm textarea").first();
  await refreshedInput.press("Enter");
  await waitForPrompt(page, ".terminal-container");
  await refreshedInput.pressSequentially("echo $VIBX_REFRESH");
  await refreshedInput.press("Enter");

  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 5_000,
      message: "waiting for marker after refresh",
    })
    .toContain("refresh_test");
});
