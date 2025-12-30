/**
 * Haiku fallback AI for intelligent failure diagnosis
 *
 * When enabled, sends failure context to Claude Haiku for synthesis.
 * Returns actionable diagnosis with suggested fixes.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.js";

interface FailureContext {
  workflow: string;
  branch: string;
  commit: string;
  commit_message: string;
  failed_jobs: string[];
  failed_steps: Array<{ job: string; step: string }>;
  logs?: string;
}

interface Diagnosis {
  analysis: string;
  suggested_fix: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Check if Haiku fallback is available
 */
export function isHaikuEnabled(config: Config): boolean {
  if (!config.fallback.enabled) return false;

  const apiKey = config.fallback.api_key_env
    ? process.env[config.fallback.api_key_env]
    : process.env.ANTHROPIC_API_KEY;

  return !!apiKey;
}

/**
 * Analyze a failure using Haiku
 */
export async function diagnoseWithHaiku(
  config: Config,
  context: FailureContext
): Promise<Diagnosis | null> {
  if (!isHaikuEnabled(config)) {
    return null;
  }

  const apiKey = config.fallback.api_key_env
    ? process.env[config.fallback.api_key_env]
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const prompt = buildDiagnosisPrompt(context, config.fallback.max_log_lines || 200);

  try {
    const response = await client.messages.create({
      model: config.fallback.model || "claude-haiku-4-5",
      max_tokens: config.fallback.max_tokens || 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return parseDiagnosis(text);
  } catch (error) {
    console.error("[haiku] Diagnosis failed:", error);
    return null;
  }
}

function buildDiagnosisPrompt(context: FailureContext, maxLogLines: number): string {
  const failedStepsList = context.failed_steps
    .map((s) => `- ${s.job} → ${s.step}`)
    .join("\n");

  const logsSection = context.logs
    ? `\n\nRelevant logs (last ${maxLogLines} lines):\n\`\`\`\n${truncateLogs(context.logs, maxLogLines)}\n\`\`\``
    : "";

  return `Analyze this CI/CD failure and provide a diagnosis.

Workflow: ${context.workflow}
Branch: ${context.branch}
Commit: ${context.commit}
Commit message: ${context.commit_message}

Failed jobs: ${context.failed_jobs.join(", ")}

Failed steps:
${failedStepsList}
${logsSection}

Respond in this exact format:
ANALYSIS: [One paragraph explaining what went wrong and why]
FIX: [Specific actionable steps to fix the issue]
CONFIDENCE: [high/medium/low based on how certain you are]`;
}

function truncateLogs(logs: string, maxLines: number): string {
  const lines = logs.split("\n");
  if (lines.length <= maxLines) return logs;
  return lines.slice(-maxLines).join("\n");
}

function parseDiagnosis(text: string): Diagnosis {
  const analysisMatch = text.match(/ANALYSIS:\s*(.+?)(?=FIX:|$)/s);
  const fixMatch = text.match(/FIX:\s*(.+?)(?=CONFIDENCE:|$)/s);
  const confidenceMatch = text.match(/CONFIDENCE:\s*(high|medium|low)/i);

  return {
    analysis: analysisMatch?.[1]?.trim() || text,
    suggested_fix: fixMatch?.[1]?.trim() || "Review the logs for more details",
    confidence: (confidenceMatch?.[1]?.toLowerCase() as "high" | "medium" | "low") || "medium",
  };
}
