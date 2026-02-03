import { mkdir, readdir, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";

import type { IssuesBackend } from "./backend.js";
import type { Issue, IssueComment, IssueStatus } from "./types.js";

interface Frontmatter {
  [key: string]: string | string[] | undefined;
}

function parseFrontmatter(content: string): { meta: Frontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };

  const meta: Frontmatter = {};
  const rawYaml = match[1] ?? "";
  const lines = rawYaml.split("\n");
  let currentKey = "";

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1] ?? "";
      const value = (kvMatch[2] ?? "").trim();
      if (value === "") {
        // Might be followed by list items
        meta[currentKey] = [];
      } else {
        // Strip surrounding quotes
        meta[currentKey] = value.replace(/^["']|["']$/g, "");
      }
    } else if (/^\s+-\s+(.*)$/.test(line) && currentKey) {
      const itemMatch = line.match(/^\s+-\s+(.*)$/);
      if (itemMatch) {
        const itemValue = (itemMatch[1] ?? "").trim();
        const arr = meta[currentKey];
        if (Array.isArray(arr)) {
          arr.push(itemValue);
        } else {
          meta[currentKey] = [itemValue];
        }
      }
    }
  }

  return { meta, body: (match[2] ?? "").trim() };
}

function serializeIssue(issue: Issue): string {
  let frontmatter = "---\n";
  frontmatter += `title: "${issue.title}"\n`;
  frontmatter += `status: ${issue.status}\n`;
  frontmatter += "labels:\n";
  for (const label of issue.labels) {
    frontmatter += `  - ${label}\n`;
  }
  frontmatter += "---\n";
  return frontmatter + issue.body + "\n";
}

function serializeComment(comment: IssueComment): string {
  let frontmatter = "---\n";
  frontmatter += `id: "${comment.id}"\n`;
  frontmatter += "---\n";
  return frontmatter + comment.body + "\n";
}

export class FileSystemIssuesBackend implements IssuesBackend {
  constructor(private baseDir: string) {}

  private async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  private async readHistoryLog(): Promise<{ lines: Array<{ number: number; status: IssueStatus }>; nextNumber: number }> {
    const historyPath = join(this.baseDir, "history.log");
    let content: string;
    try {
      content = await readFile(historyPath, "utf-8");
    } catch {
      return { lines: [], nextNumber: 1 };
    }

    const lines: Array<{ number: number; status: IssueStatus }> = [];
    let maxNumber = 0;

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(" ");
      const num = parseInt(parts[0] ?? "", 10);
      const status = parts[1] as IssueStatus | undefined;
      if (!isNaN(num) && status) {
        lines.push({ number: num, status });
        if (num > maxNumber) maxNumber = num;
      }
    }

    return { lines, nextNumber: maxNumber + 1 };
  }

  private async appendHistory(number: number, status: IssueStatus): Promise<void> {
    await this.ensureDir(this.baseDir);
    const historyPath = join(this.baseDir, "history.log");
    await appendFile(historyPath, `${number} ${status}\n`);
  }

  private async findIssuePath(number: number, dir?: string): Promise<string | null> {
    const searchDir = dir ?? this.baseDir;
    let entries: string[];
    try {
      entries = await readdir(searchDir);
    } catch {
      return null;
    }

    if (entries.includes(String(number))) {
      const candidate = join(searchDir, String(number));
      // Verify it has an issue.md
      try {
        await readFile(join(candidate, "issue.md"), "utf-8");
        return candidate;
      } catch {
        // Not a valid issue directory
      }
    }

    // Search in subissues directories
    for (const entry of entries) {
      if (entry === "subissues") {
        const result = await this.findIssuePath(number, join(searchDir, "subissues"));
        if (result) return result;
      } else {
        const subissuesDir = join(searchDir, entry, "subissues");
        try {
          const subEntries = await readdir(subissuesDir);
          if (subEntries.length >= 0) {
            const result = await this.findIssuePath(number, subissuesDir);
            if (result) return result;
          }
        } catch {
          // No subissues dir
        }
      }
    }

    return null;
  }

  private async readIssue(issuePath: string): Promise<Issue> {
    const content = await readFile(join(issuePath, "issue.md"), "utf-8");
    const { meta, body } = parseFrontmatter(content);
    const number = parseInt(issuePath.split("/").pop()!, 10);

    return {
      id: String(number),
      ref: String(number),
      title: (meta["title"] as string) ?? "",
      body,
      status: (meta["status"] as IssueStatus) ?? "todo",
      labels: Array.isArray(meta["labels"]) ? meta["labels"] : [],
    };
  }

  private async writeIssue(issuePath: string, issue: Issue): Promise<void> {
    await this.ensureDir(issuePath);
    await writeFile(join(issuePath, "issue.md"), serializeIssue(issue));
  }

  private async collectAllIssues(dir?: string): Promise<Issue[]> {
    const searchDir = dir ?? this.baseDir;
    const issues: Issue[] = [];
    let entries: string[];
    try {
      entries = await readdir(searchDir);
    } catch {
      return issues;
    }

    for (const entry of entries) {
      if (entry === "history.log" || entry === "comments" || entry === "subissues") continue;
      const entryPath = join(searchDir, entry);
      try {
        await readFile(join(entryPath, "issue.md"), "utf-8");
        const issue = await this.readIssue(entryPath);
        issues.push(issue);
        // Also collect subissues
        const subissuesDir = join(entryPath, "subissues");
        const subIssues = await this.collectAllIssues(subissuesDir);
        issues.push(...subIssues);
      } catch {
        // Not an issue directory
      }
    }

    return issues;
  }

  async listIssues(): Promise<Issue[]> {
    const allIssues = await this.collectAllIssues();
    return allIssues.filter((i) => i.status !== "done" && i.status !== "wont_do");
  }

  async createIssue(title: string, body: string): Promise<Issue> {
    const { nextNumber } = await this.readHistoryLog();
    const issue: Issue = {
      id: String(nextNumber),
      ref: String(nextNumber),
      title,
      body,
      status: "todo",
      labels: [],
    };

    const issuePath = join(this.baseDir, String(nextNumber));
    await this.writeIssue(issuePath, issue);
    await this.appendHistory(nextNumber, "todo");
    return issue;
  }

  async updateIssue(ref: string, updates: { title?: string; body?: string }): Promise<Issue> {
    const number = parseInt(ref, 10);
    const issuePath = await this.findIssuePath(number);
    if (!issuePath) throw new Error(`Issue ${ref} not found`);

    const issue = await this.readIssue(issuePath);
    if (updates.title !== undefined) issue.title = updates.title;
    if (updates.body !== undefined) issue.body = updates.body;

    await this.writeIssue(issuePath, issue);
    return issue;
  }

  async deleteIssue(ref: string): Promise<void> {
    const number = parseInt(ref, 10);
    const issuePath = await this.findIssuePath(number);
    if (!issuePath) throw new Error(`Issue ${ref} not found`);
    await rm(issuePath, { recursive: true, force: true });
  }

  async commentOnIssue(ref: string, body: string): Promise<IssueComment> {
    const number = parseInt(ref, 10);
    const issuePath = await this.findIssuePath(number);
    if (!issuePath) throw new Error(`Issue ${ref} not found`);

    const { nextNumber } = await this.readHistoryLog();
    const comment: IssueComment = {
      id: String(nextNumber),
      body,
    };

    const commentsDir = join(issuePath, "comments");
    await this.ensureDir(commentsDir);
    await writeFile(join(commentsDir, `${nextNumber}.md`), serializeComment(comment));
    await this.appendHistory(nextNumber, "todo");
    return comment;
  }

  async readComments(ref: string): Promise<IssueComment[]> {
    const number = parseInt(ref, 10);
    const issuePath = await this.findIssuePath(number);
    if (!issuePath) throw new Error(`Issue ${ref} not found`);

    const commentsDir = join(issuePath, "comments");
    let entries: string[];
    try {
      entries = await readdir(commentsDir);
    } catch {
      return [];
    }

    const comments: IssueComment[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".md")) continue;
      const content = await readFile(join(commentsDir, entry), "utf-8");
      const { meta, body } = parseFrontmatter(content);
      comments.push({
        id: (meta["id"] as string) ?? entry.replace(".md", ""),
        body,
      });
    }

    return comments;
  }

  async changeStatus(ref: string, status: IssueStatus): Promise<Issue> {
    const number = parseInt(ref, 10);
    const issuePath = await this.findIssuePath(number);
    if (!issuePath) throw new Error(`Issue ${ref} not found`);

    const issue = await this.readIssue(issuePath);
    issue.status = status;
    await this.writeIssue(issuePath, issue);
    await this.appendHistory(number, status);
    return issue;
  }

  async createSubissue(parentRef: string, title: string, body: string): Promise<Issue> {
    const parentNumber = parseInt(parentRef, 10);
    const parentPath = await this.findIssuePath(parentNumber);
    if (!parentPath) throw new Error(`Issue ${parentRef} not found`);

    const { nextNumber } = await this.readHistoryLog();
    const issue: Issue = {
      id: String(nextNumber),
      ref: String(nextNumber),
      title,
      body,
      status: "todo",
      labels: [],
    };

    const subissuePath = join(parentPath, "subissues", String(nextNumber));
    await this.writeIssue(subissuePath, issue);
    await this.appendHistory(nextNumber, "todo");
    return issue;
  }

  async labelIssue(ref: string, labels: string[]): Promise<Issue> {
    const number = parseInt(ref, 10);
    const issuePath = await this.findIssuePath(number);
    if (!issuePath) throw new Error(`Issue ${ref} not found`);

    const issue = await this.readIssue(issuePath);
    const uniqueLabels = new Set([...issue.labels, ...labels]);
    issue.labels = [...uniqueLabels];
    await this.writeIssue(issuePath, issue);
    return issue;
  }
}
