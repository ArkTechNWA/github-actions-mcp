/**
 * Permission checking and repository access control
 */

import type { Config } from "./config.js";

export type PermissionLevel = "read" | "trigger" | "cancel" | "admin";

/**
 * Check if a permission level is enabled
 */
export function checkPermission(config: Config, level: PermissionLevel): void {
  // Bypass mode skips all permission checks
  if (config.bypass_permissions) {
    return;
  }

  if (!config.permissions[level]) {
    throw new Error(
      `Permission denied: "${level}" access is not enabled. ` +
      `Enable it in config or use --bypass-permissions.`
    );
  }
}

/**
 * Check if a repository is accessible based on whitelist/blacklist
 */
export function checkRepoAccess(config: Config, repo: string): void {
  // Bypass mode skips all access checks
  if (config.bypass_permissions) {
    return;
  }

  const { whitelist_repos, blacklist_repos } = config.permissions;

  // Blacklist always wins
  if (blacklist_repos.length > 0 && matchesAny(repo, blacklist_repos)) {
    throw new Error(
      `Access denied: repository "${repo}" is blacklisted.`
    );
  }

  // Empty whitelist = all repos allowed
  if (whitelist_repos.length === 0) {
    return;
  }

  // Non-empty whitelist = must match
  if (!matchesAny(repo, whitelist_repos)) {
    throw new Error(
      `Access denied: repository "${repo}" is not in the whitelist.`
    );
  }
}

/**
 * Check if a repo matches any pattern in the list
 * Patterns support:
 * - Exact match: "owner/repo"
 * - Org wildcard: "org/*"
 * - Repo wildcard: "* /repo" (without space)
 */
function matchesAny(repo: string, patterns: string[]): boolean {
  const [owner, repoName] = repo.split("/");

  for (const pattern of patterns) {
    if (pattern === repo) {
      return true; // Exact match
    }

    const [patternOwner, patternRepo] = pattern.split("/");

    // Org wildcard: "org/*"
    if (patternRepo === "*" && patternOwner === owner) {
      return true;
    }

    // Repo wildcard: "*/repo"
    if (patternOwner === "*" && patternRepo === repoName) {
      return true;
    }
  }

  return false;
}
