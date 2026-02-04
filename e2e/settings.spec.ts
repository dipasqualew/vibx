import { test, expect } from "./fixtures.js";

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

  // Launcher should be visible on initial load
  const launcher = page.locator(".pane-launcher");
  await expect(launcher).toBeVisible({ timeout: 10_000 });

  // Click Settings in the nav bar
  await page.locator(".v-app-bar").getByText("Settings").click();

  // Settings view should load
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 5_000 });

  // Launcher should no longer be visible
  await expect(launcher).not.toBeVisible();

  // Click Terminal to go back
  await page.locator(".v-app-bar").getByText("Terminal").click();

  // Launcher should reappear
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 10_000 });
});

test("settings API returns updated values", async ({ page, server }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10_000 });

  // Use the API directly to PUT settings
  const putResponse = await page.evaluate((serverUrl) =>
    fetch(`${serverUrl}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_agent_framework: "mock-code" }),
    }).then((r) => r.json()),
    server.serverUrl,
  );
  expect(putResponse).toHaveProperty("default_agent_framework", "mock-code");
  expect(putResponse).toHaveProperty("issue_provider", "github");

  // GET should return the same
  const getResponse = await page.evaluate((serverUrl) =>
    fetch(`${serverUrl}/api/settings`).then((r) => r.json()),
    server.serverUrl,
  );
  expect(getResponse).toHaveProperty("default_agent_framework", "mock-code");
});
