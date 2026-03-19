import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import { resolve } from "node:path";
import { debug, exportVariable } from "@actions/core";

/**
 * Configure npm registry authentication by writing a .npmrc file.
 * Ported from actions/setup-node's authutil.ts.
 */
export function configAuthentication(registryUrl: string, scope?: string): void {
  const npmrc = resolve(process.env.RUNNER_TEMP || process.cwd(), ".npmrc");

  if (!registryUrl.endsWith("/")) {
    registryUrl += "/";
  }

  writeRegistryToFile(registryUrl, npmrc, scope);
}

function writeRegistryToFile(registryUrl: string, fileLocation: string, scope?: string): void {
  // Auto-detect scope for GitHub Packages registry using exact host match
  if (!scope) {
    try {
      const url = new URL(registryUrl);
      if (url.hostname === "npm.pkg.github.com") {
        scope = process.env.GITHUB_REPOSITORY_OWNER;
      }
    } catch {
      // Invalid URL — skip auto-detection
    }
  }

  if (scope && !scope.startsWith("@")) {
    scope = "@" + scope;
  }

  if (scope) {
    scope = scope.toLowerCase() + ":";
  } else {
    scope = "";
  }

  debug(`Setting auth in ${fileLocation}`);

  // Compute the auth line prefix for filtering existing entries
  const authPrefix = registryUrl.replace(/^\w+:/, "").toLowerCase();

  const lines: string[] = [];
  if (existsSync(fileLocation)) {
    const curContents = readFileSync(fileLocation, "utf8");
    for (const line of curContents.split(/\r?\n/)) {
      const lower = line.toLowerCase();
      // Remove existing registry and auth token lines for this scope/registry
      if (lower.startsWith(`${scope}registry`)) continue;
      if (lower.startsWith(authPrefix) && lower.includes("_authtoken")) continue;
      lines.push(line);
    }
  }

  // Auth token line: remove protocol prefix from registry URL
  const authString = registryUrl.replace(/^\w+:/, "") + ":_authToken=${NODE_AUTH_TOKEN}";
  const registryString = `${scope}registry=${registryUrl}`;
  lines.push(authString, registryString);

  writeFileSync(fileLocation, lines.join(EOL));

  exportVariable("NPM_CONFIG_USERCONFIG", fileLocation);
  // Export placeholder if NODE_AUTH_TOKEN is not set so npm doesn't error
  exportVariable("NODE_AUTH_TOKEN", process.env.NODE_AUTH_TOKEN || "XXXXX-XXXXX-XXXXX-XXXXX");
}
