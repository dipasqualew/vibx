import { config } from "dotenv";
import { describe, expect, test } from "vitest";

import { GitHubIssuesBackend } from "./github.js";
import type { Issue, IssueComment } from "./types.js";

config({ path: "../../.env" });

const GITHUB_TOKEN = process.env["GITHUB_TOKEN"];
const OWNER = "dipasqualew";
const REPO = "vibx-tests-repo";

const bail = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(`BAIL: ${message}`);
  }
};

describe.skipIf(!GITHUB_TOKEN)("GitHubIssuesBackend integration", () => {
  const backend = new GitHubIssuesBackend({
    owner: OWNER,
    repo: REPO,
    token: GITHUB_TOKEN!,
  });

  let parentIssue: Issue;
  let subIssue: Issue;
  let comment: IssueComment;

  test("creates an issue", async () => {
    parentIssue = await backend.createIssue(
      "Integration Test Issue",
      "This issue was created by an integration test.",
    );

    bail(parentIssue.ref, "issue ref should be set");
    expect(parentIssue.title).toBe("Integration Test Issue");
    expect(parentIssue.body).toBe("This issue was created by an integration test.");
    expect(parentIssue.status).toBe("todo");
  });

  test("updates the issue", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.updateIssue(parentIssue.ref, {
      title: "Updated Integration Test Issue",
      body: "Updated body.",
    });

    expect(parentIssue.title).toBe("Updated Integration Test Issue");
    expect(parentIssue.body).toBe("Updated body.");
  });

  test("adds a comment", async () => {
    bail(parentIssue, "parentIssue must exist");

    comment = await backend.commentOnIssue(parentIssue.ref, "Test comment.");

    expect(comment.body).toBe("Test comment.");
    expect(comment.id).toBeTruthy();
  });

  test("reads comments", async () => {
    bail(parentIssue, "parentIssue must exist");
    bail(comment, "comment must exist");

    const comments = await backend.readComments(parentIssue.ref);

    expect(comments.length).toBeGreaterThanOrEqual(1);
    expect(comments.some((c) => c.id === comment.id)).toBe(true);
  });

  test("creates a subissue", async () => {
    bail(parentIssue, "parentIssue must exist");

    subIssue = await backend.createSubissue(
      parentIssue.ref,
      "Sub Issue",
      "A child issue.",
    );

    expect(subIssue.ref).toBeTruthy();
    expect(subIssue.title).toBe("Sub Issue");
  });

  test("changes subissue status to wont_do", async () => {
    bail(subIssue, "subIssue must exist");

    subIssue = await backend.changeStatus(subIssue.ref, "wont_do");

    expect(subIssue.status).toBe("wont_do");
  });

  test("changes parent status to in_progress", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.changeStatus(parentIssue.ref, "in_progress");

    expect(parentIssue.status).toBe("in_progress");
  });

  test("changes parent status to in_review", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.changeStatus(parentIssue.ref, "in_review");

    expect(parentIssue.status).toBe("in_review");
    expect(parentIssue.labels).not.toContain("status:in_progress");
  });

  test("changes parent status to done", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.changeStatus(parentIssue.ref, "done");

    expect(parentIssue.status).toBe("done");
  });

  test("labels the issue", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.labelIssue(parentIssue.ref, ["e2e-test"]);

    expect(parentIssue.labels).toContain("e2e-test");
  });

  test("deletes the subissue", async () => {
    bail(subIssue, "subIssue must exist");

    await backend.deleteIssue(subIssue.ref);
  });

  test("deletes the parent issue", async () => {
    bail(parentIssue, "parentIssue must exist");

    await backend.deleteIssue(parentIssue.ref);
  });
});
