import { test, expect } from "@playwright/test";

const DEFAULT_SETTINGS = {
  issue_provider: "github",
  issue_provider__github__github_token: "",
  default_agent_framework: "claude",
};

// Settings tests share a single file on disk, so they must run serially
test.describe.configure({ mode: "serial" });

// Reset settings to defaults before each test to avoid cross-test pollution
test.beforeEach(async ({ page }) => {
  await page.goto("/settings");
  await page.evaluate(
    (defaults) =>
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaults),
      }),
    DEFAULT_SETTINGS,
  );
});

test("settings page loads with default values", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10_000 });

  // Wait for the form to be populated from the API
  await expect(page.locator(".v-select__selection-text").first()).toBeVisible({ timeout: 5_000 });

  // Issue Provider defaults to "github"
  const selects = page.locator(".v-select__selection-text");
  await expect(selects.nth(0)).toHaveText("github");

  // Default Agent Framework defaults to "claude"
  await expect(selects.nth(1)).toHaveText("claude");

  // GitHub Token should be empty
  const tokenInput = page.locator('input[type="password"]');
  await expect(tokenInput).toHaveValue("");
});

test("save settings and verify persistence after reload", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".v-select__selection-text").first()).toBeVisible({ timeout: 5_000 });

  // Change the agent framework to "mock-code" — it's the second v-select
  const agentSelect = page.locator(".v-select").nth(1);
  await agentSelect.click();
  await page.getByRole("option", { name: "mock-code" }).click();

  // Type a token
  const tokenInput = page.locator('input[type="password"]');
  await tokenInput.fill("ghp_test123");

  // Save
  await page.getByText("Save", { exact: true }).click();

  // Success alert should appear
  await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

  // Reload the page and verify persistence
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".v-select__selection-text").first()).toBeVisible({ timeout: 5_000 });

  // Agent framework should still be mock-code
  const selects = page.locator(".v-select__selection-text");
  await expect(selects.nth(1)).toHaveText("mock-code");

  // Token should still be set
  const reloadedToken = page.locator('input[type="password"]');
  await expect(reloadedToken).toHaveValue("ghp_test123");
});

test("navigate between terminal and settings via nav bar", async ({ page }) => {
  await page.goto("/");

  // Terminal should be visible
  const terminal = page.locator(".xterm");
  await expect(terminal).toBeVisible({ timeout: 10_000 });

  // Click Settings in the nav bar
  await page.locator(".v-app-bar").getByText("Settings").click();

  // Settings view should load
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 5_000 });

  // Terminal should no longer be visible
  await expect(terminal).not.toBeVisible();

  // Click Terminal to go back
  await page.locator(".v-app-bar").getByText("Terminal").click();

  // Terminal should reappear
  await expect(page.locator(".xterm")).toBeVisible({ timeout: 10_000 });
});

test("settings API returns updated values", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10_000 });

  // Use the API directly to PUT settings
  const putResponse = await page.evaluate(() =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_agent_framework: "mock-code" }),
    }).then((r) => r.json()),
  );
  expect(putResponse).toHaveProperty("default_agent_framework", "mock-code");
  expect(putResponse).toHaveProperty("issue_provider", "github");

  // GET should return the same
  const getResponse = await page.evaluate(() =>
    fetch("/api/settings").then((r) => r.json()),
  );
  expect(getResponse).toHaveProperty("default_agent_framework", "mock-code");
});
