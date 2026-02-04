import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, beforeAll, afterAll } from "vitest";

import { FileSystemIssuesBackend } from "./filesystem.js";
import type { Issue, IssueComment } from "./types.js";

const bail = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(`BAIL: ${message}`);
  }
};

describe("FileSystemIssuesBackend", () => {
  let baseDir: string;
  let backend: FileSystemIssuesBackend;

  beforeAll(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "vibx-fs-test-"));
    backend = new FileSystemIssuesBackend(baseDir);
  });

  afterAll(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  let parentIssue: Issue;
  let subIssue: Issue;
  let comment: IssueComment;

  test("creates an issue", async () => {
    parentIssue = await backend.createIssue(
      "Integration Test Issue",
      "This issue was created by a test.",
    );

    expect(parentIssue.ref).toBe("1");
    expect(parentIssue.title).toBe("Integration Test Issue");
    expect(parentIssue.body).toBe("This issue was created by a test.");
    expect(parentIssue.status).toBe("todo");
    expect(parentIssue.labels).toEqual([]);
  });

  test("lists issues", async () => {
    bail(parentIssue, "parentIssue must exist");

    const issues = await backend.listIssues();
    expect(issues.length).toBe(1);
    expect(issues[0]!.ref).toBe(parentIssue.ref);
  });

  test("updates the issue", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.updateIssue(parentIssue.ref, {
      title: "Updated Test Issue",
      body: "Updated body.",
    });

    expect(parentIssue.title).toBe("Updated Test Issue");
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

    expect(comments.length).toBe(1);
    expect(comments[0]!.id).toBe(comment.id);
    expect(comments[0]!.body).toBe("Test comment.");
  });

  test("creates a subissue", async () => {
    bail(parentIssue, "parentIssue must exist");

    subIssue = await backend.createSubissue(
      parentIssue.ref,
      "Sub Issue",
      "A child issue.",
    );

    expect(parseInt(subIssue.ref, 10)).toBeGreaterThan(0);
    expect(subIssue.title).toBe("Sub Issue");
  });

  test("number sequence is shared between issues and subissues", () => {
    bail(parentIssue, "parentIssue must exist");
    bail(comment, "comment must exist");
    bail(subIssue, "subIssue must exist");

    const refs = [parentIssue.ref, comment.id, subIssue.ref];
    const unique = new Set(refs);
    expect(unique.size).toBe(refs.length);
  });

  test("listIssues includes subissues", async () => {
    const issues = await backend.listIssues();
    const refs = issues.map((i) => i.ref);
    expect(refs).toContain(subIssue.ref);
  });

  test("changes subissue status to wont_do", async () => {
    bail(subIssue, "subIssue must exist");

    subIssue = await backend.changeStatus(subIssue.ref, "wont_do");

    expect(subIssue.status).toBe("wont_do");
  });

  test("listIssues filters out done/wont_do", async () => {
    const issues = await backend.listIssues();
    const refs = issues.map((i) => i.ref);
    expect(refs).not.toContain(subIssue.ref);
    expect(refs).toContain(parentIssue.ref);
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
  });

  test("changes parent status to done", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.changeStatus(parentIssue.ref, "done");

    expect(parentIssue.status).toBe("done");
  });

  test("labels the issue", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.labelIssue(parentIssue.ref, ["bug", "urgent"]);

    expect(parentIssue.labels).toContain("bug");
    expect(parentIssue.labels).toContain("urgent");
  });

  test("labelIssue merges labels without duplicates", async () => {
    bail(parentIssue, "parentIssue must exist");

    parentIssue = await backend.labelIssue(parentIssue.ref, ["bug", "feature"]);

    const bugCount = parentIssue.labels.filter((l) => l === "bug").length;
    expect(bugCount).toBe(1);
    expect(parentIssue.labels).toContain("feature");
  });

  test("deletes the subissue", async () => {
    bail(subIssue, "subIssue must exist");

    await backend.deleteIssue(subIssue.ref);

    await expect(backend.updateIssue(subIssue.ref, { title: "x" })).rejects.toThrow();
  });

  test("deletes the parent issue", async () => {
    bail(parentIssue, "parentIssue must exist");

    await backend.deleteIssue(parentIssue.ref);

    await expect(backend.updateIssue(parentIssue.ref, { title: "x" })).rejects.toThrow();
  });

  test("listIssues returns empty after deletion", async () => {
    const issues = await backend.listIssues();
    expect(issues.length).toBe(0);
  });
});
