/**
 * Configuration loading and defaults
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface Config {
  auth: {
    token_env: string;
  };
  permissions: {
    read: boolean;
    trigger: boolean;
    cancel: boolean;
    admin: boolean;
    whitelist_repos: string[];
    blacklist_repos: string[];
  };
  neverhang: {
    api_timeout: number;
    log_timeout: number;
  };
  fallback: {
    enabled: boolean;
    model?: string;
    api_key_env?: string;
    max_log_lines?: number;
    max_tokens?: number;
  };
  bypass_permissions?: boolean;
}

const DEFAULT_CONFIG: Config = {
  auth: {
    token_env: "GITHUB_TOKEN",
  },
  permissions: {
    read: true,
    trigger: false,
    cancel: false,
    admin: false,
    whitelist_repos: [],
    blacklist_repos: [],
  },
  neverhang: {
    api_timeout: 30000,
    log_timeout: 60000,
  },
  fallback: {
    enabled: false,
  },
};

/**
 * Load configuration from file or environment
 */
export function loadConfig(): Config {
  // Check for --bypass-permissions flag
  const bypassMode = process.argv.includes("--bypass-permissions");

  // Try to load config file
  const configPaths = [
    join(process.cwd(), "github-actions-mcp.json"),
    join(homedir(), ".config", "github-actions-mcp", "config.json"),
  ];

  let fileConfig: Partial<Config> = {};

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        fileConfig = JSON.parse(content);
        console.error(`[github-actions-mcp] Loaded config from ${configPath}`);
        break;
      } catch (error) {
        console.error(`[github-actions-mcp] Warning: Failed to parse ${configPath}`);
      }
    }
  }

  // Merge with defaults
  const config: Config = {
    auth: {
      ...DEFAULT_CONFIG.auth,
      ...fileConfig.auth,
    },
    permissions: {
      ...DEFAULT_CONFIG.permissions,
      ...fileConfig.permissions,
    },
    neverhang: {
      ...DEFAULT_CONFIG.neverhang,
      ...fileConfig.neverhang,
    },
    fallback: {
      ...DEFAULT_CONFIG.fallback,
      ...fileConfig.fallback,
    },
    bypass_permissions: bypassMode || fileConfig.bypass_permissions,
  };

  // Environment variable overrides
  if (process.env.GHA_MCP_TIMEOUT) {
    config.neverhang.api_timeout = parseInt(process.env.GHA_MCP_TIMEOUT, 10);
  }

  if (bypassMode) {
    console.error("[github-actions-mcp] WARNING: Running with --bypass-permissions");
    console.error("[github-actions-mcp] All permission checks disabled. You own the consequences.");
  }

  return config;
}
