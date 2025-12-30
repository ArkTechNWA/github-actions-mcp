# github-actions-mcp

A Model Context Protocol (MCP) server for GitHub Actions integration. Give your AI assistant eyes on your CI/CD pipelines.

**Status:** Alpha (v0.1.0)
**Author:** Claude (claude@arktechnwa.com) + Meldrey
**License:** MIT
**Organization:** [ArktechNWA](https://github.com/ArktechNWA)

---

## Why?

Your AI assistant can write code, but it's blind to whether it passes CI. It can suggest fixes, but can't see the actual error logs from your failed workflow. It can't trigger a deployment or re-run a flaky test.

github-actions-mcp connects Claude to your GitHub Actions workflows — safely.

---

## Philosophy

1. **Safety by default** — Read-only access to workflows and runs
2. **User controls exposure** — Whitelist repos, permission levels
3. **Never hang** — GitHub API timeouts, circuit breakers
4. **Structured output** — JSON for machines, summaries for AI
5. **Fallback AI** — Haiku for log analysis and failure diagnosis

---

## Features

### Perception (Read)
- List workflows in a repository
- Get workflow run history and status
- Stream/fetch run logs
- Check job and step status
- View workflow file definitions

### Action (Write)
- Trigger workflow_dispatch events
- Re-run failed jobs
- Cancel running workflows
- Enable/disable workflows

### Analysis (Optional AI Fallback)
- "Why did this build fail?" synthesis
- Log pattern analysis
- Flaky test detection

---

## Permission Model

### Permission Levels

| Level | Description | Default |
|-------|-------------|---------|
| `read` | List workflows, runs, logs | **ON** |
| `trigger` | Dispatch workflows, re-run jobs | OFF |
| `cancel` | Cancel running workflows | OFF |
| `admin` | Enable/disable workflows | OFF |

### Repository Filtering

```json
{
  "permissions": {
    "read": true,
    "trigger": false,
    "cancel": false,
    "admin": false,

    "whitelist_repos": [
      "ArktechNWA/*",
      "myorg/myapp"
    ],

    "blacklist_repos": [
      "*/infrastructure",
      "*/secrets-*"
    ]
  }
}
```

**Rules:**
- Blacklist always wins
- Empty whitelist = all accessible repos allowed
- Patterns support `org/*` and `*/repo` wildcards

### Bypass Mode

```bash
github-actions-mcp --bypass-permissions
```

Full access to all repos you can see. You own the consequences.

---

## Authentication

GitHub Personal Access Token (classic or fine-grained):

```bash
# Environment variable
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Or in config
{
  "auth": {
    "token_env": "GITHUB_TOKEN"
  }
}
```

**Required scopes:**
- `repo` (for private repos)
- `actions:read` (minimum for read-only)
- `actions:write` (for trigger/cancel)

---

## Tools

### Workflows

#### `gha_list_workflows`
List workflows in a repository.

```typescript
gha_list_workflows({
  repo: string,           // "owner/repo"
  state?: "active" | "disabled" | "all"
})
```

#### `gha_get_workflow`
Get workflow definition and metadata.

```typescript
gha_get_workflow({
  repo: string,
  workflow: string | number  // workflow file name or ID
})
```

### Runs

#### `gha_list_runs`
List workflow runs with filtering.

```typescript
gha_list_runs({
  repo: string,
  workflow?: string,        // filter by workflow
  branch?: string,          // filter by branch
  status?: "queued" | "in_progress" | "completed",
  conclusion?: "success" | "failure" | "cancelled" | "skipped",
  limit?: number            // default: 10
})
```

Returns:
```json
{
  "runs": [
    {
      "id": 12345,
      "workflow": "CI",
      "status": "completed",
      "conclusion": "failure",
      "branch": "main",
      "commit": "abc1234",
      "commit_message": "Fix login bug",
      "triggered_by": "push",
      "started_at": "2025-12-29T10:00:00Z",
      "duration": "3m 42s",
      "status_icon": "✗"
    }
  ],
  "summary": "Last 10 runs: 7 passed, 2 failed, 1 cancelled"
}
```

#### `gha_get_run`
Get detailed run information including jobs.

```typescript
gha_get_run({
  repo: string,
  run_id: number,
  include_jobs?: boolean    // default: true
})
```

#### `gha_get_run_logs`
Fetch logs for a workflow run.

```typescript
gha_get_run_logs({
  repo: string,
  run_id: number,
  job?: string,             // specific job name
  step?: string,            // specific step name
  grep?: string,            // filter log lines
  tail?: number             // last N lines
})
```

### Actions

#### `gha_trigger_workflow`
Trigger a workflow_dispatch event. Requires `trigger` permission.

```typescript
gha_trigger_workflow({
  repo: string,
  workflow: string,         // workflow file name
  ref: string,              // branch or tag
  inputs?: Record<string, string>  // workflow inputs
})
```

#### `gha_rerun_workflow`
Re-run a workflow. Requires `trigger` permission.

```typescript
gha_rerun_workflow({
  repo: string,
  run_id: number,
  failed_only?: boolean     // only re-run failed jobs
})
```

#### `gha_cancel_run`
Cancel a running workflow. Requires `cancel` permission.

```typescript
gha_cancel_run({
  repo: string,
  run_id: number
})
```

#### `gha_set_workflow_state`
Enable or disable a workflow. Requires `admin` permission.

```typescript
gha_set_workflow_state({
  repo: string,
  workflow: string,
  enabled: boolean
})
```

### Analysis

#### `gha_diagnose_failure`
AI-powered failure diagnosis. Gathers logs and context.

```typescript
gha_diagnose_failure({
  repo: string,
  run_id: number,
  use_ai?: boolean          // use Haiku for synthesis
})
```

Returns:
```json
{
  "run_id": 12345,
  "workflow": "CI",
  "conclusion": "failure",
  "failed_jobs": ["test"],
  "failed_steps": ["Run pytest"],
  "error_context": "[... relevant log lines ...]",
  "synthesis": {
    "analysis": "Test failed due to missing fixture. The 'db' fixture was removed in commit abc123 but test_user.py still depends on it.",
    "suggested_fix": "Either restore the db fixture or update test_user.py to use the new database setup",
    "confidence": "high"
  }
}
```

---

## NEVERHANG Architecture

GitHub API can be slow. Log downloads can hang. We guarantee responsiveness.

### Timeouts
- API calls: 30s default
- Log downloads: 60s default
- Configurable per-operation

### Streaming
- Large logs streamed in chunks
- Progress updates for long downloads
- Client can cancel anytime

### Circuit Breaker
- 3 failures in 60s → 5 minute cooldown
- Respects GitHub rate limits (5000/hour)
- Backs off on 403/429 responses

### Rate Limit Awareness
```json
{
  "rate_limit": {
    "remaining": 4892,
    "reset_at": "2025-12-29T11:00:00Z"
  }
}
```

---

## Fallback AI

Optional Haiku integration for log analysis.

```json
{
  "fallback": {
    "enabled": true,
    "model": "claude-haiku-4-5",
    "api_key_env": "GHA_MCP_FALLBACK_KEY",
    "max_log_lines": 500,
    "max_tokens": 500
  }
}
```

**When used:**
- `gha_diagnose_failure` with `use_ai: true`
- Complex multi-job failures
- Pattern detection in flaky tests

---

## Configuration

### Config File

`~/.config/github-actions-mcp/config.json`:

```json
{
  "auth": {
    "token_env": "GITHUB_TOKEN"
  },
  "permissions": {
    "read": true,
    "trigger": false,
    "cancel": false,
    "admin": false,
    "whitelist_repos": [],
    "blacklist_repos": []
  },
  "neverhang": {
    "api_timeout": 30000,
    "log_timeout": 60000
  },
  "fallback": {
    "enabled": false
  }
}
```

### Claude Code Integration

```json
{
  "mcpServers": {
    "github-actions": {
      "command": "github-actions-mcp",
      "env": {
        "GITHUB_TOKEN": "your-token-here"
      }
    }
  }
}
```

---

## Installation

```bash
npm install -g @arktechnwa/github-actions-mcp
```

---

## Requirements

- Node.js 18+
- GitHub Personal Access Token
- Optional: Anthropic API key for fallback AI

---

## Security Considerations

1. **Token scoping** — Use fine-grained PATs with minimal permissions
2. **Repo filtering** — Whitelist only repos you want AI to access
3. **No secrets exposure** — Workflow secrets never exposed in logs
4. **Audit trail** — All actions logged

---

## Credits

Created by Claude (claude@arktechnwa.com) in collaboration with Meldrey.
Part of the [ArktechNWA MCP Toolshed](https://github.com/ArktechNWA).
