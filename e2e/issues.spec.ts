import { execSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const DEFAULT_SETTINGS = {
  issue_provider: "github",
  issue_provider__github__github_token: "",
  default_agent_framework: "claude",
};

const userId = execSync("whoami").toString().trim();
const issuesDir = join(__dirname, "..", "packages", "server", ".vibx2-data", userId, "issues");

function serializeIssue(opts: { title: string; status: string; labels: string[]; body: string }): string {
  let fm = "---\n";
  fm += `title: "${opts.title}"\n`;
  fm += `status: ${opts.status}\n`;
  fm += "labels:\n";
  for (const label of opts.labels) {
    fm += `  - ${label}\n`;
  }
  fm += "---\n";
  return fm + opts.body + "\n";
}

async function seedIssue(number: number, opts: { title: string; status: string; labels: string[]; body: string }): Promise<void> {
  const dir = join(issuesDir, String(number));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "issue.md"), serializeIssue(opts));
}

async function seedHistory(lines: string): Promise<void> {
  await mkdir(issuesDir, { recursive: true });
  await writeFile(join(issuesDir, "history.log"), lines);
}

test.beforeEach(async ({ page }) => {
  // Reset settings to no GitHub token (so FS backend is used)
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

  // Clear the issues directory
  await rm(issuesDir, { recursive: true, force: true });
});

test("issues page shows empty state when no issues exist", async ({ page }) => {
  await page.goto("/issues");

  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("No open issues found.")).toBeVisible({ timeout: 5_000 });
});

test("issues page renders list from filesystem", async ({ page }) => {
  // Seed issues on disk
  await seedIssue(1, { title: "Fix login bug", status: "todo", labels: [], body: "" });
  await seedIssue(42, { title: "Add dark mode", status: "in_progress", labels: ["status:in_progress"], body: "" });
  await seedIssue(7, { title: "Review auth flow", status: "in_review", labels: ["status:in_review"], body: "" });
  await seedHistory("1 todo\n42 in_progress\n7 in_review\n");

  await page.goto("/issues");

  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible({ timeout: 10_000 });

  // All three issues should be rendered
  await expect(page.getByText("Fix login bug")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Add dark mode")).toBeVisible();
  await expect(page.getByText("Review auth flow")).toBeVisible();

  // Status chips should be visible
  await expect(page.getByText("To Do")).toBeVisible();
  await expect(page.getByText("In Progress")).toBeVisible();
  await expect(page.getByText("In Review")).toBeVisible();
});

test("issues page filters out done issues", async ({ page }) => {
  await seedIssue(1, { title: "Open issue", status: "todo", labels: [], body: "" });
  await seedIssue(2, { title: "Closed issue", status: "done", labels: [], body: "" });
  await seedHistory("1 todo\n2 done\n");

  await page.goto("/issues");

  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Open issue")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Closed issue")).not.toBeVisible();
});

test("navigate to issues via nav bar", async ({ page }) => {
  await page.goto("/");

  // Terminal should be visible
  await expect(page.locator(".xterm")).toBeVisible({ timeout: 10_000 });

  // Click Issues in the nav bar
  await page.locator(".v-app-bar").getByText("Issues").click();

  // Issues view should load
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible({ timeout: 5_000 });

  // Terminal should no longer be visible
  await expect(page.locator(".xterm")).not.toBeVisible();
});
