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

async function waitForPrompt(page: Page, selector: string, timeout = 15_000) {
  // Wait for the WebSocket connection to be established before polling the buffer
  await expect(page.locator(`${selector}[data-ws-ready]`).first()).toBeAttached({
    timeout,
  });
  await expect
    .poll(() => getTerminalBufferContent(page, selector), {
      timeout,
      message: `waiting for shell prompt in ${selector}`,
    })
    .toContain("$");
}

async function launchBlankTerminal(page: Page) {
  await expect(page.locator(".pane-launcher").first()).toBeVisible({ timeout: 10_000 });
  await page.locator(".pane-launcher-button", { hasText: "Blank terminal" }).first().click();
  const terminal = page.locator(".xterm");
  await expect(terminal.first()).toBeVisible({ timeout: 10_000 });
  // Wait for the WS handshake before polling buffer content
  await expect(page.locator(".terminal-container[data-ws-ready]").first()).toBeAttached({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");
}

test("split vertical creates two side-by-side panes", async ({ page }) => {
  await page.goto("/");
  await launchBlankTerminal(page);

  // Split vertically with Cmd+D
  await page.keyboard.press("Meta+d");

  // Should now have 2 pane leaves
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

  // The split container should exist with vertical direction
  await expect(page.locator(".pane-split-vertical")).toBeVisible();
});

test("split horizontal creates two stacked panes", async ({ page }) => {
  await page.goto("/");
  await launchBlankTerminal(page);

  // Split horizontally with Shift+Cmd+D
  await page.keyboard.press("Shift+Meta+d");

  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });
  await expect(page.locator(".pane-split-horizontal")).toBeVisible();
});

test("navigate between panes with arrow keys", async ({ page }) => {
  await page.goto("/");
  await launchBlankTerminal(page);

  // Split vertically — new pane shows launcher
  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

  // Activate the new pane with Blank terminal
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 5_000 });
  await page.locator(".pane-launcher-button", { hasText: "Blank terminal" }).click();

  // Wait for the new pane's shell prompt
  const paneLeaves = page.locator(".pane-leaf");
  const rightPane = paneLeaves.nth(1);
  await expect(rightPane).not.toHaveClass(/dimmed/, { timeout: 5_000 });

  // Navigate left — left pane should become active (not dimmed)
  await page.keyboard.press("Shift+Meta+ArrowLeft");
  const leftPane = paneLeaves.nth(0);
  await expect(leftPane).not.toHaveClass(/dimmed/, { timeout: 5_000 });
  await expect(rightPane).toHaveClass(/dimmed/);
});

test("three panes after vertical then horizontal split", async ({ page }) => {
  await page.goto("/");
  await launchBlankTerminal(page);

  // Split vertically
  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

  // Activate new pane then split horizontally
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 5_000 });
  await page.locator(".pane-launcher-button", { hasText: "Blank terminal" }).click();
  await waitForPrompt(page, ".pane-leaf:not(.dimmed) .terminal-container");

  await page.keyboard.press("Shift+Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(3, { timeout: 5_000 });
});

test("closing a pane via exit recomputes layout", async ({ page }) => {
  await page.goto("/");
  await launchBlankTerminal(page);

  // Split vertically
  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

  // Activate the new pane
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 5_000 });
  await page.locator(".pane-launcher-button", { hasText: "Blank terminal" }).click();

  // Wait for prompt in the new (active/right) pane
  const activePaneLeaf = page.locator(".pane-leaf:not(.dimmed)");
  const activeTermContainer = activePaneLeaf.locator(".terminal-container");
  await expect(activeTermContainer).toBeVisible({ timeout: 5_000 });
  await waitForPrompt(page, ".pane-leaf:not(.dimmed) .terminal-container");

  // Find the xterm textarea inside the active pane and type exit
  const xtermInput = activePaneLeaf.locator(".xterm textarea");
  await xtermInput.pressSequentially("exit");
  await xtermInput.press("Enter");

  // Should collapse back to 1 pane
  await expect(page.locator(".pane-leaf")).toHaveCount(1, { timeout: 10_000 });

  // No split containers should remain
  await expect(page.locator(".pane-split")).toHaveCount(0);
});

test("closing panes until one remains fills the space", async ({ page }) => {
  await page.goto("/");
  await launchBlankTerminal(page);

  // Split twice, activating each new pane
  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 5_000 });
  await page.locator(".pane-launcher-button", { hasText: "Blank terminal" }).click();
  await waitForPrompt(page, ".pane-leaf:not(.dimmed) .terminal-container");

  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(3, { timeout: 5_000 });
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 5_000 });
  await page.locator(".pane-launcher-button", { hasText: "Blank terminal" }).click();
  await waitForPrompt(page, ".pane-leaf:not(.dimmed) .terminal-container");

  // Close active pane (rightmost)
  let activePaneLeaf = page.locator(".pane-leaf:not(.dimmed)");
  let xtermInput = activePaneLeaf.locator(".xterm textarea");
  await xtermInput.pressSequentially("exit");
  await xtermInput.press("Enter");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 10_000 });

  // Close next active pane
  activePaneLeaf = page.locator(".pane-leaf:not(.dimmed)");
  await waitForPrompt(page, ".pane-leaf:not(.dimmed) .terminal-container");
  xtermInput = activePaneLeaf.locator(".xterm textarea");
  await xtermInput.pressSequentially("exit");
  await xtermInput.press("Enter");
  await expect(page.locator(".pane-leaf")).toHaveCount(1, { timeout: 10_000 });

  // The remaining pane should not be dimmed
  await expect(page.locator(".pane-leaf")).not.toHaveClass(/dimmed/);
});
