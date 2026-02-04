import { test, expect } from "./fixtures.js";
import type { Page } from "@playwright/test";

function getTerminalBufferContent(page: Page, selector: string) {
  return page.evaluate((sel) => {
    // Find all matching elements and pick the one that is visible
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
  // Wait for the WebSocket connection to be established before polling the buffer
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

async function launchBlankTerminal(page: Page) {
  await expect(page.locator(".pane-launcher").first()).toBeVisible({ timeout: 10_000 });
  await page.locator(".pane-launcher-button", { hasText: "Blank terminal" }).first().click();
  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");
}

test("terminal sessions persist across tab navigation", async ({ page }) => {
  await page.goto("/");
  await launchBlankTerminal(page);

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
  await launchBlankTerminal(page);

  // Set a marker in the first tab
  const tab1Input = page.locator(".xterm textarea").first();
  await tab1Input.pressSequentially("export VIBX_TAB=tab1_marker");
  await tab1Input.press("Enter");
  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 5_000,
    })
    .toContain("VIBX_TAB=tab1_marker");

  // Open a second tab with Cmd+T
  await page.keyboard.press("Meta+t");
  await expect(page.locator(".tab")).toHaveCount(2, { timeout: 5_000 });

  // Second tab shows launcher — click blank terminal
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 5_000 });
  await page.locator(".pane-launcher-button", { hasText: "Blank terminal" }).click();

  // Wait for the second tab's terminal to be ready
  await expect(page.locator(".terminal-container[data-ws-ready]")).toHaveCount(2, { timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Set a different marker in the second tab
  // Use .last() since the second tab's terminal is appended after the first
  const tab2Input = page.locator(".xterm textarea").last();
  await tab2Input.pressSequentially("export VIBX_TAB=tab2_marker");
  await tab2Input.press("Enter");
  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 5_000,
    })
    .toContain("VIBX_TAB=tab2_marker");

  // Switch back to the first tab
  await page.locator(".tab .tab-label").first().click();
  await expect(page.locator(".tab").first()).toHaveClass(/active/, {
    timeout: 5_000,
  });

  // Verify first tab's marker is still there
  const tab1RestoredInput = page.locator(".xterm textarea").first();
  await tab1RestoredInput.press("Enter");
  await waitForPrompt(page, ".terminal-container");
  await tab1RestoredInput.pressSequentially("echo $VIBX_TAB");
  await tab1RestoredInput.press("Enter");
  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 5_000,
      message: "waiting for tab1 marker after switching back",
    })
    .toContain("tab1_marker");

  // Switch to the second tab
  await page.locator(".tab .tab-label").nth(1).click();
  await expect(page.locator(".tab").nth(1)).toHaveClass(/active/, {
    timeout: 5_000,
  });

  // Verify second tab's marker is still there
  const tab2RestoredInput = page.locator(".xterm textarea").first();
  await tab2RestoredInput.press("Enter");
  await waitForPrompt(page, ".terminal-container");
  await tab2RestoredInput.pressSequentially("echo $VIBX_TAB");
  await tab2RestoredInput.press("Enter");
  await expect
    .poll(() => getTerminalBufferContent(page, ".terminal-container"), {
      timeout: 5_000,
      message: "waiting for tab2 marker after switching back",
    })
    .toContain("tab2_marker");
});

test("terminal sessions persist across page refresh", async ({ page }) => {
  await page.goto("/");
  await launchBlankTerminal(page);

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

  // Terminal should reappear with restored session (no launcher since session exists)
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
