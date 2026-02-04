import { describe, expect, test } from "vitest";

import { interpolate } from "./interpolate.js";
import type { IssueContext } from "./interpolate.js";

const ctx: IssueContext = {
  ref: "42",
  title: "Fix login bug",
  body: "Users cannot log in",
  status: "todo",
  labels: ["bug", "critical"],
};

describe("interpolate", () => {
  test("replaces ${issue.ref}", () => {
    expect(interpolate("issue-${issue.ref}", ctx)).toBe("issue-42");
  });

  test("replaces ${issue.title}", () => {
    expect(interpolate("Title: ${issue.title}", ctx)).toBe("Title: Fix login bug");
  });

  test("replaces ${issue.body}", () => {
    expect(interpolate("${issue.body}", ctx)).toBe("Users cannot log in");
  });

  test("replaces ${issue.status}", () => {
    expect(interpolate("status=${issue.status}", ctx)).toBe("status=todo");
  });

  test("replaces ${issue.labels}", () => {
    expect(interpolate("labels: ${issue.labels}", ctx)).toBe("labels: bug,critical");
  });

  test("replaces multiple variables in one string", () => {
    const result = interpolate("${issue.ref}: ${issue.title} [${issue.status}]", ctx);
    expect(result).toBe("42: Fix login bug [todo]");
  });

  test("leaves variables as-is when no issue context", () => {
    const text = "echo ${issue.ref} ${issue.title}";
    expect(interpolate(text)).toBe(text);
  });

  test("returns text unchanged when no template variables present", () => {
    expect(interpolate("plain text", ctx)).toBe("plain text");
  });
});
