import { test, expect } from "./fixtures.js";

test("navigate to actions via nav bar", async ({ page }) => {
  await page.goto("/");

  // Launcher should be visible on initial load
  await expect(page.locator(".pane-launcher")).toBeVisible({ timeout: 10_000 });

  // Click Actions in the nav bar
  await page.locator(".v-app-bar").getByText("Actions").click();

  // Actions view should load
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible({ timeout: 5_000 });

  // Launcher should no longer be visible
  await expect(page.locator(".pane-launcher")).not.toBeVisible();
});

test("actions page shows empty state when no actions exist", async ({ page }) => {
  await page.goto("/actions");

  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("No actions found.")).toBeVisible({ timeout: 5_000 });
});

test("create an action with steps and verify it appears in the list", async ({ page }) => {
  await page.goto("/actions");

  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible({ timeout: 10_000 });

  // Click New Action
  await page.getByText("New Action").click();
  await expect(page.getByRole("heading", { name: "New Action" })).toBeVisible();

  // Fill in name
  await page.getByLabel("Action Name").fill("Deploy Pipeline");

  // Helper to add a step via the menu, waiting for stability
  async function addStep(menuItemText: string, chipText: string) {
    // Ensure no overlay is active before opening the menu
    await expect(page.locator(".v-overlay--active")).toHaveCount(0);
    await page.getByRole("button", { name: "Add Step" }).click();
    // Wait for menu content to be visible
    await expect(page.locator(".v-overlay--active")).toHaveCount(1);
    await page.locator(".v-overlay--active").getByText(menuItemText).click();
    // Wait for the step chip to confirm the step was added
    await expect(page.getByText(chipText).first()).toBeVisible();
  }

  await addStep("Change Issue Status", "Change Status");
  await addStep("Run Bash Command", "Bash Command");

  // Fill in the bash command
  await page.getByLabel("Command").fill("echo hello");

  await addStep("Sleep", "Sleep");

  // Save the action
  await page.getByRole("button", { name: "Save" }).click();

  // Should return to list mode and show the action
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Deploy Pipeline")).toBeVisible();
  await expect(page.getByText("3 step(s)")).toBeVisible();
});

test("edit an existing action", async ({ page }) => {
  await page.goto("/actions");

  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible({ timeout: 10_000 });

  // Create an action first
  await page.getByText("New Action").click();
  await page.getByLabel("Action Name").fill("Original Name");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Original Name")).toBeVisible({ timeout: 5_000 });

  // Click to edit
  await page.getByText("Original Name").click();
  await expect(page.getByRole("heading", { name: "Edit Action" })).toBeVisible();

  // Change name
  const nameField = page.getByLabel("Action Name");
  await nameField.clear();
  await nameField.fill("Updated Name");

  // Save
  await page.getByRole("button", { name: "Save" }).click();

  // Verify updated name appears
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Updated Name")).toBeVisible();
  await expect(page.getByText("Original Name")).not.toBeVisible();
});

test("delete an action", async ({ page }) => {
  await page.goto("/actions");

  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible({ timeout: 10_000 });

  // Create an action first
  await page.getByText("New Action").click();
  await page.getByLabel("Action Name").fill("To Delete");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("To Delete")).toBeVisible({ timeout: 5_000 });

  // Delete it via the delete icon button in the list
  await page.locator(".v-list-item .mdi-delete").first().click();

  // Should show empty state
  await expect(page.getByText("No actions found.")).toBeVisible({ timeout: 5_000 });
});
