#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: worktree.sh [<issue-ref> | <github-issue-url> | <name>]"
  echo "Examples:"
  echo "  worktree.sh https://github.com/owner/repo/issues/42  # issue worktree (full URL)"
  echo "  worktree.sh '#3'                                      # issue worktree (local ref)"
  echo "  worktree.sh owner/repo#3                              # issue worktree (qualified ref)"
  echo "  worktree.sh my-experiment                             # named worktree"
  echo "  worktree.sh                                           # timestamped worktree"
  exit 1
}

[[ $# -gt 1 ]] && usage

origin_dir="$(pwd)"
toplevel="$(git rev-parse --show-toplevel)"
url=""
claude_cmd=""

if [[ $# -eq 1 ]] && [[ "$1" =~ github\.com/([^/]+)/([^/]+)/issues/([0-9]+) ]]; then
  # GitHub issue URL mode
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]}"
  issue="${BASH_REMATCH[3]}"
  url="$1"
  branch="issue-${issue}"
  worktree_dir="${toplevel}/../vibx-${issue}"
  claude_cmd="/issue-solve $url"
  echo "Owner:    $owner"
  echo "Repo:     $repo"
  echo "Issue:    #$issue"
elif [[ $# -eq 1 ]] && [[ "$1" =~ ^#([0-9]+)$ ]]; then
  # Local issue ref: #3 — infer owner/repo from git remote
  issue="${BASH_REMATCH[1]}"
  remote_url="$(git remote get-url origin)"
  if [[ "$remote_url" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]}"
  else
    echo "Error: could not parse owner/repo from remote 'origin': $remote_url"
    exit 1
  fi
  url="https://github.com/${owner}/${repo}/issues/${issue}"
  branch="issue-${issue}"
  worktree_dir="${toplevel}/../vibx-${issue}"
  claude_cmd="/issue-solve $url"
  echo "Owner:    $owner"
  echo "Repo:     $repo"
  echo "Issue:    #$issue"
elif [[ $# -eq 1 ]] && [[ "$1" =~ ^([^/]+)/([^#]+)#([0-9]+)$ ]]; then
  # Qualified issue ref: owner/repo#3
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]}"
  issue="${BASH_REMATCH[3]}"
  url="https://github.com/${owner}/${repo}/issues/${issue}"
  branch="issue-${issue}"
  worktree_dir="${toplevel}/../vibx-${issue}"
  claude_cmd="/issue-solve $url"
  echo "Owner:    $owner"
  echo "Repo:     $repo"
  echo "Issue:    #$issue"
elif [[ $# -eq 1 ]]; then
  # Named worktree
  branch="$1"
  worktree_dir="${toplevel}/../vibx-${branch}"
  echo "Mode:     named worktree"
else
  # No args — timestamped worktree
  branch="worktree-$(date +%Y%m%d-%H%M%S)"
  worktree_dir="${toplevel}/../vibx-${branch}"
  echo "Mode:     timestamped worktree"
fi

echo "Worktree: $worktree_dir"
echo "Branch:   $branch"
echo ""

# Create worktree
if [[ -d "$worktree_dir" ]]; then
  echo "Worktree already exists at $worktree_dir"
else
  git worktree add "$worktree_dir" -b "$branch"
  echo "Created worktree at $worktree_dir"
fi

# Install dependencies
echo "Installing dependencies..."
(cd "$worktree_dir" && bun install)

# Run Claude Code
echo ""
echo "Starting Claude Code..."
if [[ -n "$claude_cmd" ]]; then
  (cd "$worktree_dir" && claude "$claude_cmd") || true
else
  (cd "$worktree_dir" && claude) || true
fi

# Merge commits into main
echo ""
echo "Claude Code exited. Merging commits into main..."
git worktree remove "$worktree_dir"
echo "Removed worktree at $worktree_dir"

# Check if the branch has any commits beyond main
if git log "main..${branch}" --oneline | grep -q .; then
  # Rebase branch onto current main (which may have moved), then fast-forward
  if ! git rebase main "$branch"; then
    echo "Rebase conflicts detected — asking Claude to resolve..."
    while [[ -d "$(git rev-parse --git-dir)/rebase-merge" ]] || [[ -d "$(git rev-parse --git-dir)/rebase-apply" ]]; do
      # Let Claude resolve all conflicted files
      claude "There are git rebase conflicts. Resolve all merge conflicts in the working tree, then stage the resolved files with git add. Do NOT run git rebase --continue yourself."
      git rebase --continue || true
    done
    echo "Rebase completed after conflict resolution"
  fi
  git checkout main
  git merge --ff-only "$branch"
  git branch -d "$branch"
  echo "Rebased $branch onto main and fast-forward merged"
else
  git branch -d "$branch" 2>/dev/null || git branch -D "$branch"
  echo "No new commits on $branch — deleted branch"
fi

cd "$origin_dir"
echo "Done."
