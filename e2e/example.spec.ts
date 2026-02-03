import { test, expect } from "@playwright/test";

test("terminal session runs echo Hello World", async ({ page }) => {
  await page.goto("/");

  // Wait for xterm.js terminal to render
  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });

  // Wait for the shell prompt to appear by reading the terminal buffer directly
  // xterm.js uses WebGL/canvas rendering, so DOM text selectors won't work
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const el = document.querySelector(".terminal-container");
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
        }),
      { timeout: 10_000, message: "waiting for shell prompt" },
    )
    .toContain("$");

  // Type the echo command into the xterm textarea
  const xtermInput = page.locator(".xterm textarea");
  await xtermInput.pressSequentially('echo "Hello World"');
  await xtermInput.press("Enter");

  // Assert the terminal buffer contains "Hello World"
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const el = document.querySelector(".terminal-container");
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
        }),
      { timeout: 10_000, message: "waiting for Hello World in output" },
    )
    .toContain("Hello World");
});
