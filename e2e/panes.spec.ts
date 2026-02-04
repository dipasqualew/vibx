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

test("split vertical creates two side-by-side panes", async ({ page }) => {
  await page.goto("/");

  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Split vertically with Cmd+D
  await page.keyboard.press("Meta+d");

  // Should now have 2 pane leaves
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

  // The split container should exist with vertical direction
  await expect(page.locator(".pane-split-vertical")).toBeVisible();
});

test("split horizontal creates two stacked panes", async ({ page }) => {
  await page.goto("/");

  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Split horizontally with Shift+Cmd+D
  await page.keyboard.press("Shift+Meta+d");

  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });
  await expect(page.locator(".pane-split-horizontal")).toBeVisible();
});

test("navigate between panes with arrow keys", async ({ page }) => {
  await page.goto("/");

  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Split vertically — focus moves to right pane
  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

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

  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Split vertically
  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

  // Split horizontally on the right pane
  await page.keyboard.press("Shift+Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(3, { timeout: 5_000 });
});

test("closing a pane via exit recomputes layout", async ({ page }) => {
  await page.goto("/");

  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Split vertically
  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

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

  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });
  await waitForPrompt(page, ".terminal-container");

  // Split twice
  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 5_000 });

  await page.keyboard.press("Meta+d");
  await expect(page.locator(".pane-leaf")).toHaveCount(3, { timeout: 5_000 });

  // Close active pane (rightmost) — wait for its shell to be ready first
  let activePaneLeaf = page.locator(".pane-leaf:not(.dimmed)");
  await waitForPrompt(page, ".pane-leaf:not(.dimmed) .terminal-container");
  let xtermInput = activePaneLeaf.locator(".xterm textarea");
  await xtermInput.pressSequentially("exit");
  await xtermInput.press("Enter");
  await expect(page.locator(".pane-leaf")).toHaveCount(2, { timeout: 10_000 });

  // Close next active pane — wait for its shell to be ready first
  activePaneLeaf = page.locator(".pane-leaf:not(.dimmed)");
  await waitForPrompt(page, ".pane-leaf:not(.dimmed) .terminal-container");
  xtermInput = activePaneLeaf.locator(".xterm textarea");
  await xtermInput.pressSequentially("exit");
  await xtermInput.press("Enter");
  await expect(page.locator(".pane-leaf")).toHaveCount(1, { timeout: 10_000 });

  // The remaining pane should not be dimmed
  await expect(page.locator(".pane-leaf")).not.toHaveClass(/dimmed/);
});
