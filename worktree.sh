#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: worktree.sh <github-issue-url>"
  echo "Example: worktree.sh https://github.com/owner/repo/issues/42"
  exit 1
}

[[ $# -ne 1 ]] && usage

url="$1"

# Parse owner/repo/issue from URL
if [[ "$url" =~ github\.com/([^/]+)/([^/]+)/issues/([0-9]+) ]]; then
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]}"
  issue="${BASH_REMATCH[3]}"
else
  echo "Error: could not parse GitHub issue URL: $url"
  usage
fi

origin_dir="$(pwd)"
worktree_dir="$(git rev-parse --show-toplevel)/../vibx-${issue}"
branch="issue-${issue}"

echo "Owner:    $owner"
echo "Repo:     $repo"
echo "Issue:    #$issue"
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
(cd "$worktree_dir" && claude "/issue-solve $url") || true

# Cleanup
echo ""
echo "Claude Code exited. Cleaning up worktree..."
git worktree remove "$worktree_dir"
echo "Removed worktree at $worktree_dir"

# Delete branch only if it was fully merged
if git branch --merged main | grep -q "$branch"; then
  git branch -d "$branch"
  echo "Deleted merged branch $branch"
else
  echo "Branch $branch is not merged into main — keeping it"
fi

cd "$origin_dir"
echo "Done."
