#!/bin/bash
# Wrapper script for github-actions-mcp
# Gets GitHub token from gh CLI if not already set

if [ -z "$GITHUB_TOKEN" ]; then
  export GITHUB_TOKEN=$(gh auth token 2>/dev/null)
fi

if [ -z "$GITHUB_TOKEN" ]; then
  echo "[github-actions-mcp] ERROR: No GITHUB_TOKEN and gh auth failed" >&2
  exit 1
fi

exec node "$(dirname "$0")/build/index.js" "$@"
