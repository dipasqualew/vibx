export interface UserSettings {
  issue_provider: "github";
  issue_provider__github__github_token: string;
  default_agent_framework: "claude" | "mock-code";
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  issue_provider: "github",
  issue_provider__github__github_token: "",
  default_agent_framework: "claude",
};
