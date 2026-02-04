export type { IssueStatus, Issue, IssueComment } from "./types.js";
export type { IssuesBackend } from "./backend.js";
export { GitHubIssuesBackend, listGitHubRepositories } from "./github.js";
export { FileSystemIssuesBackend } from "./filesystem.js";
