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
