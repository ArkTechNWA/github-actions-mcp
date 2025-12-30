#!/usr/bin/env node
/**
 * github-actions-mcp
 * MCP server for GitHub Actions integration
 *
 * @author Claude + Meldrey
 * @license MIT
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { loadConfig, type Config } from "./config.js";
import { checkPermission, checkRepoAccess } from "./permissions.js";
import { withTimeout } from "./utils.js";
import { isHaikuEnabled, diagnoseWithHaiku } from "./haiku.js";

// ============================================================================
// INITIALIZATION
// ============================================================================

const config = loadConfig();

const octokit = new Octokit({
  auth: process.env[config.auth.token_env],
  request: {
    timeout: config.neverhang.api_timeout,
  },
});

const server = new McpServer({
  name: "github-actions-mcp",
  version: "0.1.0",
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseRepo(repo: string): { owner: string; repo: string } {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo"`);
  }
  return { owner, repo: repoName };
}

function formatDuration(startedAt: string, completedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function statusIcon(conclusion: string | null): string {
  switch (conclusion) {
    case "success": return "✓";
    case "failure": return "✗";
    case "cancelled": return "⊘";
    case "skipped": return "⊖";
    case null: return "●"; // in progress
    default: return "?";
  }
}

// ============================================================================
// TOOLS: WORKFLOWS (Read)
// ============================================================================

server.tool(
  "gha_list_workflows",
  "List workflows in a repository",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    state: z.enum(["active", "disabled", "all"]).optional().describe("Filter by state"),
  },
  async ({ repo, state = "all" }) => {
    checkPermission(config, "read");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    const response = await withTimeout(
      octokit.rest.actions.listRepoWorkflows({ owner, repo: repoName }),
      config.neverhang.api_timeout
    );

    let workflows = response.data.workflows;
    if (state !== "all") {
      workflows = workflows.filter((w) => w.state === state);
    }

    const result = {
      total: workflows.length,
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        path: w.path,
        state: w.state,
        badge_url: w.badge_url,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "gha_get_workflow",
  "Get workflow definition and metadata",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    workflow: z.union([z.string(), z.number()]).describe("Workflow file name or ID"),
  },
  async ({ repo, workflow }) => {
    checkPermission(config, "read");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    const response = await withTimeout(
      octokit.rest.actions.getWorkflow({
        owner,
        repo: repoName,
        workflow_id: workflow,
      }),
      config.neverhang.api_timeout
    );

    const w = response.data;
    const result = {
      id: w.id,
      name: w.name,
      path: w.path,
      state: w.state,
      created_at: w.created_at,
      updated_at: w.updated_at,
      url: w.html_url,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================================================
// TOOLS: RUNS (Read)
// ============================================================================

server.tool(
  "gha_list_runs",
  "List workflow runs with filtering",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    workflow: z.string().optional().describe("Filter by workflow file name"),
    branch: z.string().optional().describe("Filter by branch"),
    status: z.enum(["queued", "in_progress", "completed"]).optional(),
    conclusion: z.enum(["success", "failure", "cancelled", "skipped"]).optional(),
    limit: z.number().min(1).max(100).optional().describe("Max results (default: 10)"),
  },
  async ({ repo, workflow, branch, status, conclusion, limit = 10 }) => {
    checkPermission(config, "read");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    const params: Parameters<typeof octokit.rest.actions.listWorkflowRunsForRepo>[0] = {
      owner,
      repo: repoName,
      per_page: limit,
    };

    if (branch) params.branch = branch;
    if (status) params.status = status;

    let runs;
    if (workflow) {
      const response = await withTimeout(
        octokit.rest.actions.listWorkflowRuns({
          ...params,
          workflow_id: workflow,
        }),
        config.neverhang.api_timeout
      );
      runs = response.data.workflow_runs;
    } else {
      const response = await withTimeout(
        octokit.rest.actions.listWorkflowRunsForRepo(params),
        config.neverhang.api_timeout
      );
      runs = response.data.workflow_runs;
    }

    // Filter by conclusion client-side (API doesn't support it directly)
    if (conclusion) {
      runs = runs.filter((r) => r.conclusion === conclusion);
    }

    const formattedRuns = runs.slice(0, limit).map((r) => ({
      id: r.id,
      workflow: r.name,
      status: r.status,
      conclusion: r.conclusion,
      branch: r.head_branch,
      commit: r.head_sha.substring(0, 7),
      commit_message: r.head_commit?.message?.split("\n")[0] || "",
      triggered_by: r.event,
      started_at: r.run_started_at,
      duration: r.run_started_at
        ? formatDuration(r.run_started_at, r.updated_at)
        : null,
      status_icon: statusIcon(r.conclusion),
    }));

    // Summary stats
    const stats = {
      success: runs.filter((r) => r.conclusion === "success").length,
      failure: runs.filter((r) => r.conclusion === "failure").length,
      cancelled: runs.filter((r) => r.conclusion === "cancelled").length,
      in_progress: runs.filter((r) => r.status === "in_progress").length,
    };

    const result = {
      runs: formattedRuns,
      summary: `Last ${runs.length} runs: ${stats.success} passed, ${stats.failure} failed, ${stats.cancelled} cancelled, ${stats.in_progress} running`,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "gha_get_run",
  "Get detailed run information including jobs",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    run_id: z.number().describe("Workflow run ID"),
    include_jobs: z.boolean().optional().describe("Include job details (default: true)"),
  },
  async ({ repo, run_id, include_jobs = true }) => {
    checkPermission(config, "read");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    const runResponse = await withTimeout(
      octokit.rest.actions.getWorkflowRun({ owner, repo: repoName, run_id }),
      config.neverhang.api_timeout
    );

    const r = runResponse.data;
    const result: Record<string, unknown> = {
      id: r.id,
      workflow: r.name,
      status: r.status,
      conclusion: r.conclusion,
      branch: r.head_branch,
      commit: r.head_sha.substring(0, 7),
      commit_message: r.head_commit?.message || "",
      triggered_by: r.event,
      actor: r.actor?.login,
      started_at: r.run_started_at,
      duration: r.run_started_at
        ? formatDuration(r.run_started_at, r.updated_at)
        : null,
      url: r.html_url,
    };

    if (include_jobs) {
      const jobsResponse = await withTimeout(
        octokit.rest.actions.listJobsForWorkflowRun({ owner, repo: repoName, run_id }),
        config.neverhang.api_timeout
      );

      result.jobs = jobsResponse.data.jobs.map((j) => ({
        id: j.id,
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        started_at: j.started_at,
        duration: j.started_at ? formatDuration(j.started_at, j.completed_at) : null,
        steps: j.steps?.map((s) => ({
          name: s.name,
          status: s.status,
          conclusion: s.conclusion,
          number: s.number,
        })),
      }));
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "gha_get_run_logs",
  "Fetch logs for a workflow run",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    run_id: z.number().describe("Workflow run ID"),
    job: z.string().optional().describe("Filter to specific job name"),
    grep: z.string().optional().describe("Filter log lines containing this string"),
    tail: z.number().optional().describe("Return only last N lines"),
  },
  async ({ repo, run_id, job, grep, tail }) => {
    checkPermission(config, "read");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    try {
      // Get the log download URL
      const response = await withTimeout(
        octokit.rest.actions.downloadWorkflowRunLogs({ owner, repo: repoName, run_id }),
        config.neverhang.log_timeout
      );

      // The response is a redirect URL - we need to fetch the actual logs
      // For now, return the URL and metadata
      // Full log fetching would require additional zip handling

      const result = {
        run_id,
        log_url: response.url,
        note: "Log download URL (expires in 1 minute). For full log content, download and extract the zip.",
        filters_requested: { job, grep, tail },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("410")) {
        return {
          content: [{
            type: "text",
            text: "Logs have expired or been deleted (GitHub retains logs for 90 days)",
            isError: true,
          }],
        };
      }
      throw error;
    }
  }
);

// ============================================================================
// TOOLS: ACTIONS (Write - Permission Gated)
// ============================================================================

server.tool(
  "gha_trigger_workflow",
  "Trigger a workflow_dispatch event",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    workflow: z.string().describe("Workflow file name (e.g., 'ci.yml')"),
    ref: z.string().describe("Branch or tag to run on"),
    inputs: z.record(z.string()).optional().describe("Workflow inputs"),
  },
  async ({ repo, workflow, ref, inputs }) => {
    checkPermission(config, "trigger");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    await withTimeout(
      octokit.rest.actions.createWorkflowDispatch({
        owner,
        repo: repoName,
        workflow_id: workflow,
        ref,
        inputs,
      }),
      config.neverhang.api_timeout
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Triggered workflow "${workflow}" on ${ref}`,
          repo,
          workflow,
          ref,
          inputs: inputs || {},
        }, null, 2),
      }],
    };
  }
);

server.tool(
  "gha_rerun_workflow",
  "Re-run a workflow",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    run_id: z.number().describe("Workflow run ID"),
    failed_only: z.boolean().optional().describe("Only re-run failed jobs"),
  },
  async ({ repo, run_id, failed_only = false }) => {
    checkPermission(config, "trigger");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    if (failed_only) {
      await withTimeout(
        octokit.rest.actions.reRunWorkflowFailedJobs({ owner, repo: repoName, run_id }),
        config.neverhang.api_timeout
      );
    } else {
      await withTimeout(
        octokit.rest.actions.reRunWorkflow({ owner, repo: repoName, run_id }),
        config.neverhang.api_timeout
      );
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Re-running workflow run #${run_id}${failed_only ? " (failed jobs only)" : ""}`,
          run_id,
          failed_only,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  "gha_cancel_run",
  "Cancel a running workflow",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    run_id: z.number().describe("Workflow run ID"),
  },
  async ({ repo, run_id }) => {
    checkPermission(config, "cancel");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    await withTimeout(
      octokit.rest.actions.cancelWorkflowRun({ owner, repo: repoName, run_id }),
      config.neverhang.api_timeout
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Cancelled workflow run #${run_id}`,
          run_id,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  "gha_set_workflow_state",
  "Enable or disable a workflow",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    workflow: z.string().describe("Workflow file name or ID"),
    enabled: z.boolean().describe("Enable (true) or disable (false)"),
  },
  async ({ repo, workflow, enabled }) => {
    checkPermission(config, "admin");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    if (enabled) {
      await withTimeout(
        octokit.rest.actions.enableWorkflow({ owner, repo: repoName, workflow_id: workflow }),
        config.neverhang.api_timeout
      );
    } else {
      await withTimeout(
        octokit.rest.actions.disableWorkflow({ owner, repo: repoName, workflow_id: workflow }),
        config.neverhang.api_timeout
      );
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Workflow "${workflow}" ${enabled ? "enabled" : "disabled"}`,
          workflow,
          enabled,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// TOOLS: ANALYSIS
// ============================================================================

server.tool(
  "gha_diagnose_failure",
  "Analyze a failed workflow run (with optional AI diagnosis)",
  {
    repo: z.string().describe("Repository in owner/repo format"),
    run_id: z.number().describe("Workflow run ID"),
  },
  async ({ repo, run_id }) => {
    checkPermission(config, "read");
    checkRepoAccess(config, repo);

    const { owner, repo: repoName } = parseRepo(repo);

    // Get run details
    const runResponse = await withTimeout(
      octokit.rest.actions.getWorkflowRun({ owner, repo: repoName, run_id }),
      config.neverhang.api_timeout
    );

    const run = runResponse.data;

    // Get jobs to find failures
    const jobsResponse = await withTimeout(
      octokit.rest.actions.listJobsForWorkflowRun({ owner, repo: repoName, run_id }),
      config.neverhang.api_timeout
    );

    const failedJobs = jobsResponse.data.jobs.filter((j) => j.conclusion === "failure");
    const failedSteps: Array<{ job: string; step: string; conclusion: string }> = [];

    for (const job of failedJobs) {
      const failed = job.steps?.filter((s) => s.conclusion === "failure") || [];
      for (const step of failed) {
        failedSteps.push({
          job: job.name,
          step: step.name,
          conclusion: step.conclusion || "failure",
        });
      }
    }

    const result: Record<string, unknown> = {
      run_id,
      workflow: run.name,
      conclusion: run.conclusion,
      branch: run.head_branch,
      commit: run.head_sha.substring(0, 7),
      commit_message: run.head_commit?.message?.split("\n")[0] || "",
      failed_jobs: failedJobs.map((j) => j.name),
      failed_steps: failedSteps,
      url: run.html_url,
    };

    // If Haiku fallback is enabled, get AI diagnosis
    if (isHaikuEnabled(config) && failedJobs.length > 0) {
      console.error("[github-actions-mcp] Running Haiku diagnosis...");

      const diagnosis = await diagnoseWithHaiku(config, {
        workflow: run.name || "unknown",
        branch: run.head_branch || "unknown",
        commit: run.head_sha.substring(0, 7),
        commit_message: run.head_commit?.message?.split("\n")[0] || "",
        failed_jobs: failedJobs.map((j) => j.name),
        failed_steps: failedSteps.map((s) => ({ job: s.job, step: s.step })),
      });

      if (diagnosis) {
        result.ai_diagnosis = diagnosis;
        result.ai_model = config.fallback.model || "claude-haiku-4-5";
      } else {
        result.ai_diagnosis = null;
        result.ai_note = "Haiku diagnosis failed or unavailable";
      }
    } else if (!isHaikuEnabled(config)) {
      result.ai_diagnosis = null;
      result.ai_note = "AI diagnosis disabled. Set fallback.enabled=true and provide ANTHROPIC_API_KEY to enable.";
    } else {
      result.suggestion = "No failed jobs to diagnose";
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const token = process.env[config.auth.token_env];
  if (!token) {
    console.error(`[github-actions-mcp] ERROR: ${config.auth.token_env} not set`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[github-actions-mcp] Running on stdio");
}

main().catch((error) => {
  console.error("[github-actions-mcp] Fatal:", error);
  process.exit(1);
});
