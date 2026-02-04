import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test, expect } from "./fixtures.js";

const userId = execSync("whoami").toString().trim();

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

function issuesDir(dataDir: string): string {
  return join(dataDir, userId, "issues");
}

async function seedIssue(dataDir: string, number: number, opts: { title: string; status: string; labels: string[]; body: string }): Promise<void> {
  const dir = join(issuesDir(dataDir), String(number));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "issue.md"), serializeIssue(opts));
}

async function seedHistory(dataDir: string, lines: string): Promise<void> {
  const dir = issuesDir(dataDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "history.log"), lines);
}

test("issues page shows empty state when no issues exist", async ({ page }) => {
  await page.goto("/issues");

  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("No open issues found.")).toBeVisible({ timeout: 5_000 });
});

test("issues page renders list from filesystem", async ({ page, server }) => {
  // Seed issues on disk
  await seedIssue(server.dataDir, 1, { title: "Fix login bug", status: "todo", labels: [], body: "" });
  await seedIssue(server.dataDir, 42, { title: "Add dark mode", status: "in_progress", labels: ["status:in_progress"], body: "" });
  await seedIssue(server.dataDir, 7, { title: "Review auth flow", status: "in_review", labels: ["status:in_review"], body: "" });
  await seedHistory(server.dataDir, "1 todo\n42 in_progress\n7 in_review\n");

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

test("issues page filters out done issues", async ({ page, server }) => {
  await seedIssue(server.dataDir, 1, { title: "Open issue", status: "todo", labels: [], body: "" });
  await seedIssue(server.dataDir, 2, { title: "Closed issue", status: "done", labels: [], body: "" });
  await seedHistory(server.dataDir, "1 todo\n2 done\n");

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
