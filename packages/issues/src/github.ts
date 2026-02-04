import { graphql } from "@octokit/graphql";

import type { IssuesBackend } from "./backend.js";
import type { Issue, IssueComment, IssueStatus } from "./types.js";

interface GitHubIssuesBackendOptions {
  owner: string;
  repo: string;
  token: string;
  repositories?: string[];
}

const STATUS_LABELS = ["status:in_progress", "status:in_review"] as const;

function deriveStatus(state: string, stateReason: string | null, labels: string[]): IssueStatus {
  if (state === "CLOSED") {
    return stateReason === "NOT_PLANNED" ? "wont_do" : "done";
  }

  if (labels.includes("status:in_review")) return "in_review";
  if (labels.includes("status:in_progress")) return "in_progress";
  return "todo";
}

interface GraphQLIssueNode {
  id: string;
  number: number;
  title: string;
  body: string;
  state: string;
  stateReason: string | null;
  labels: { nodes: Array<{ name: string }> };
  repository?: { owner: { login: string }; name: string };
}

function parseRef(ref: string): { owner: string; repo: string; number: number } {
  const match = ref.match(/^(.+)\/(.+)#(\d+)$/);
  if (!match) throw new Error(`Invalid issue ref: ${ref}`);
  return { owner: match[1]!, repo: match[2]!, number: parseInt(match[3]!, 10) };
}

function toIssue(node: GraphQLIssueNode, fallbackOwner: string, fallbackRepo: string): Issue {
  const labels = node.labels.nodes.map((l) => l.name);
  const owner = node.repository?.owner.login ?? fallbackOwner;
  const repo = node.repository?.name ?? fallbackRepo;
  return {
    id: node.id,
    ref: `${owner}/${repo}#${node.number}`,
    title: node.title,
    body: node.body,
    status: deriveStatus(node.state, node.stateReason, labels),
    labels,
  };
}

const ISSUE_FIELDS = `
  id
  number
  title
  body
  state
  stateReason
  labels(first: 10) { nodes { name } }
`;

export class GitHubIssuesBackend implements IssuesBackend {
  private gql: typeof graphql;
  private owner: string;
  private repo: string;
  private repositories: string[];
  private repoId: string | null = null;

  constructor({ owner, repo, token, repositories }: GitHubIssuesBackendOptions) {
    this.owner = owner;
    this.repo = repo;
    this.repositories = repositories ?? [];
    this.gql = graphql.defaults({
      headers: { authorization: `token ${token}` },
    });
  }

  private async getRepoId(): Promise<string> {
    if (this.repoId) return this.repoId;

    const result = await this.gql<{ repository: { id: string } }>(`
      query ($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) { id }
      }
    `, { owner: this.owner, repo: this.repo });

    this.repoId = result.repository.id;
    return this.repoId!;
  }

  private async getIssueId(ref: string): Promise<string> {
    const { owner, repo, number } = parseRef(ref);
    const result = await this.gql<{ repository: { issue: { id: string } } }>(`
      query ($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) { id }
        }
      }
    `, { owner, repo, number });

    return result.repository.issue.id;
  }

  async listIssues(): Promise<Issue[]> {
    if (this.repositories.length === 0) return [];

    const issues: Issue[] = [];

    for (const fullName of this.repositories) {
      const [owner, repo] = fullName.split("/");
      if (!owner || !repo) continue;

      let hasNextPage = true;
      let cursor: string | null = null;

      while (hasNextPage) {
        const result = await this.gql<ListRepoIssuesResponse>(`
          query ($owner: String!, $repo: String!, $cursor: String) {
            repository(owner: $owner, name: $repo) {
              issues(first: 50, states: OPEN, after: $cursor) {
                nodes { ${ISSUE_FIELDS} }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        `, { owner, repo, cursor });

        for (const node of result.repository.issues.nodes) {
          const issue = toIssue(node, owner, repo);
          if (issue.status !== "done" && issue.status !== "wont_do") {
            issues.push(issue);
          }
        }

        hasNextPage = result.repository.issues.pageInfo.hasNextPage;
        cursor = result.repository.issues.pageInfo.endCursor;
      }
    }

    return issues;
  }

  async createIssue(title: string, body: string): Promise<Issue> {
    const repoId = await this.getRepoId();

    const result = await this.gql<{ createIssue: { issue: GraphQLIssueNode } }>(`
      mutation ($repositoryId: ID!, $title: String!, $body: String!) {
        createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body }) {
          issue { ${ISSUE_FIELDS} }
        }
      }
    `, { repositoryId: repoId, title, body });

    return toIssue(result.createIssue.issue, this.owner, this.repo);
  }

  async updateIssue(ref: string, updates: { title?: string; body?: string }): Promise<Issue> {
    const issueId = await this.getIssueId(ref);

    const result = await this.gql<{ updateIssue: { issue: GraphQLIssueNode } }>(`
      mutation ($id: ID!, $title: String, $body: String) {
        updateIssue(input: { id: $id, title: $title, body: $body }) {
          issue { ${ISSUE_FIELDS} }
        }
      }
    `, { id: issueId, ...updates });

    return toIssue(result.updateIssue.issue, this.owner, this.repo);
  }

  async deleteIssue(ref: string): Promise<void> {
    const issueId = await this.getIssueId(ref);

    await this.gql(`
      mutation ($issueId: ID!) {
        deleteIssue(input: { issueId: $issueId }) {
          clientMutationId
        }
      }
    `, { issueId });
  }

  async commentOnIssue(ref: string, body: string): Promise<IssueComment> {
    const issueId = await this.getIssueId(ref);

    const result = await this.gql<{
      addComment: { commentEdge: { node: { id: string; body: string } } };
    }>(`
      mutation ($subjectId: ID!, $body: String!) {
        addComment(input: { subjectId: $subjectId, body: $body }) {
          commentEdge { node { id body } }
        }
      }
    `, { subjectId: issueId, body });

    const node = result.addComment.commentEdge.node;
    return { id: node.id, body: node.body };
  }

  async readComments(ref: string): Promise<IssueComment[]> {
    const { owner, repo, number } = parseRef(ref);
    const result = await this.gql<{
      repository: {
        issue: { comments: { nodes: Array<{ id: string; body: string }> } };
      };
    }>(`
      query ($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            comments(first: 100) { nodes { id body } }
          }
        }
      }
    `, { owner, repo, number });

    return result.repository.issue.comments.nodes.map((n) => ({
      id: n.id,
      body: n.body,
    }));
  }

  async changeStatus(ref: string, status: IssueStatus): Promise<Issue> {
    const issueId = await this.getIssueId(ref);

    if (status === "done" || status === "wont_do") {
      return this.closeIssue(issueId, status);
    }

    return this.openIssueWithStatus(issueId, status);
  }

  private async closeIssue(issueId: string, status: "done" | "wont_do"): Promise<Issue> {
    const stateReason = status === "wont_do" ? "NOT_PLANNED" : "COMPLETED";

    await this.removeStatusLabels(issueId);

    const result = await this.gql<{ closeIssue: { issue: GraphQLIssueNode } }>(`
      mutation ($issueId: ID!, $stateReason: IssueClosedStateReason!) {
        closeIssue(input: { issueId: $issueId, stateReason: $stateReason }) {
          issue { ${ISSUE_FIELDS} }
        }
      }
    `, { issueId, stateReason });

    return toIssue(result.closeIssue.issue, this.owner, this.repo);
  }

  private async openIssueWithStatus(issueId: string, status: "todo" | "in_progress" | "in_review"): Promise<Issue> {
    await this.gql(`
      mutation ($issueId: ID!) {
        reopenIssue(input: { issueId: $issueId }) {
          issue { id }
        }
      }
    `, { issueId }).catch(() => {
      // Issue may already be open
    });

    await this.removeStatusLabels(issueId);

    if (status === "todo") {
      return this.fetchIssue(issueId);
    }

    const labelName = `status:${status}`;
    const labelId = await this.ensureLabel(labelName);

    const result = await this.gql<{ addLabelsToLabelable: { labelable: GraphQLIssueNode } }>(`
      mutation ($labelableId: ID!, $labelIds: [ID!]!) {
        addLabelsToLabelable(input: { labelableId: $labelableId, labelIds: $labelIds }) {
          labelable { ... on Issue { ${ISSUE_FIELDS} } }
        }
      }
    `, { labelableId: issueId, labelIds: [labelId] });

    return toIssue(result.addLabelsToLabelable.labelable, this.owner, this.repo);
  }

  private async removeStatusLabels(issueId: string): Promise<void> {
    const issue = await this.fetchIssue(issueId);
    const statusLabels = issue.labels.filter((l) => STATUS_LABELS.includes(l as typeof STATUS_LABELS[number]));

    if (statusLabels.length === 0) return;

    const labelIds = await Promise.all(statusLabels.map((l) => this.getLabelId(l)));

    await this.gql(`
      mutation ($labelableId: ID!, $labelIds: [ID!]!) {
        removeLabelsFromLabelable(input: { labelableId: $labelableId, labelIds: $labelIds }) {
          clientMutationId
        }
      }
    `, { labelableId: issueId, labelIds });
  }

  private async fetchIssue(issueId: string): Promise<Issue> {
    const result = await this.gql<{ node: GraphQLIssueNode }>(`
      query ($id: ID!) {
        node(id: $id) { ... on Issue { ${ISSUE_FIELDS} } }
      }
    `, { id: issueId });

    return toIssue(result.node, this.owner, this.repo);
  }

  private async ensureLabel(name: string): Promise<string> {
    try {
      return await this.getLabelId(name);
    } catch {
      const repoId = await this.getRepoId();
      const result = await this.gql<{ createLabel: { label: { id: string } } }>(`
        mutation ($repositoryId: ID!, $name: String!, $color: String!) {
          createLabel(input: { repositoryId: $repositoryId, name: $name, color: $color }) {
            label { id }
          }
        }
      `, { repositoryId: repoId, name, color: "ededed" });

      return result.createLabel.label.id;
    }
  }

  private async getLabelId(name: string): Promise<string> {
    const result = await this.gql<{
      repository: { label: { id: string } | null };
    }>(`
      query ($owner: String!, $repo: String!, $name: String!) {
        repository(owner: $owner, name: $repo) {
          label(name: $name) { id }
        }
      }
    `, { owner: this.owner, repo: this.repo, name });

    const label = result.repository.label;
    if (!label) throw new Error(`Label not found: ${name}`);
    return label.id;
  }

  async createSubissue(parentRef: string, title: string, body: string): Promise<Issue> {
    const child = await this.createIssue(title, body);
    const parentId = await this.getIssueId(parentRef);

    await this.gql(`
      mutation ($issueId: ID!, $subIssueId: ID!) {
        addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) {
          issue { id }
        }
      }
    `, { issueId: parentId, subIssueId: child.id });

    return child;
  }

  async labelIssue(ref: string, labels: string[]): Promise<Issue> {
    const issueId = await this.getIssueId(ref);
    const labelIds = await Promise.all(labels.map((l) => this.ensureLabel(l)));

    const result = await this.gql<{ addLabelsToLabelable: { labelable: GraphQLIssueNode } }>(`
      mutation ($labelableId: ID!, $labelIds: [ID!]!) {
        addLabelsToLabelable(input: { labelableId: $labelableId, labelIds: $labelIds }) {
          labelable { ... on Issue { ${ISSUE_FIELDS} } }
        }
      }
    `, { labelableId: issueId, labelIds });

    return toIssue(result.addLabelsToLabelable.labelable, this.owner, this.repo);
  }
}

interface ListRepoIssuesResponse {
  repository: {
    issues: {
      nodes: GraphQLIssueNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

interface ListReposResponse {
  viewer: {
    repositories: {
      nodes: Array<{ nameWithOwner: string }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

export async function listGitHubRepositories(token: string): Promise<string[]> {
  const gql = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  const repos: string[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const result: ListReposResponse = await gql<ListReposResponse>(`
      query ($cursor: String) {
        viewer {
          repositories(first: 100, after: $cursor, ownerAffiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR]) {
            nodes { nameWithOwner }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `, { cursor });

    for (const node of result.viewer.repositories.nodes) {
      repos.push(node.nameWithOwner);
    }

    hasNextPage = result.viewer.repositories.pageInfo.hasNextPage;
    cursor = result.viewer.repositories.pageInfo.endCursor;
  }

  return repos;
}
