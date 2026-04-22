import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import { join, resolve } from "node:path";
import { debug, exportVariable, info } from "@actions/core";

/**
 * Configure npm registry authentication by writing a .npmrc file.
 * Ported from actions/setup-node's authutil.ts.
 */
export function configAuthentication(registryUrl: string, scope?: string): void {
  // Validate and normalize the registry URL
  let url: URL;
  try {
    url = new URL(registryUrl);
  } catch {
    throw new Error(`Invalid registry-url: "${registryUrl}". Must be a valid URL.`);
  }

  // Ensure trailing slash
  const normalizedUrl = url.href.endsWith("/") ? url.href : url.href + "/";
  const npmrc = resolve(process.env.RUNNER_TEMP || process.cwd(), ".npmrc");

  writeRegistryToFile(normalizedUrl, npmrc, scope);
}

function writeRegistryToFile(registryUrl: string, fileLocation: string, scope?: string): void {
  // Auto-detect scope for GitHub Packages registry using exact host match
  if (!scope) {
    const url = new URL(registryUrl);
    if (url.hostname === "npm.pkg.github.com") {
      scope = process.env.GITHUB_REPOSITORY_OWNER;
    }
  }

  let scopePrefix = "";
  if (scope) {
    scopePrefix = (scope.startsWith("@") ? scope : "@" + scope).toLowerCase() + ":";
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
      if (lower.startsWith(`${scopePrefix}registry`)) continue;
      if (lower.startsWith(authPrefix) && lower.includes("_authtoken")) continue;
      lines.push(line);
    }
  }

  // Auth token line: remove protocol prefix from registry URL
  const authString = registryUrl.replace(/^\w+:/, "") + ":_authToken=${NODE_AUTH_TOKEN}";
  const registryString = `${scopePrefix}registry=${registryUrl}`;
  lines.push(authString, registryString);

  writeFileSync(fileLocation, lines.join(EOL));

  exportVariable("NPM_CONFIG_USERCONFIG", fileLocation);
  // Export placeholder if NODE_AUTH_TOKEN is not set so npm doesn't error
  exportVariable("NODE_AUTH_TOKEN", process.env.NODE_AUTH_TOKEN || "XXXXX-XXXXX-XXXXX-XXXXX");
}

// Env vars the runner/system manages — never re-export via GITHUB_ENV
const RESERVED_ENV_VARS = new Set([
  "PATH",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "RUNNER_TEMP",
  "RUNNER_OS",
  "RUNNER_ARCH",
  "GITHUB_ACTIONS",
  "GITHUB_WORKSPACE",
  "GITHUB_REPOSITORY",
  "GITHUB_REPOSITORY_OWNER",
  "CI",
]);

interface ParsedNpmrc {
  registries: Set<string>;
  authKeys: Set<string>;
  envVarRefs: Set<string>;
}

function parseNpmrc(content: string): ParsedNpmrc {
  const result: ParsedNpmrc = {
    registries: new Set(),
    authKeys: new Set(),
    envVarRefs: new Set(),
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const lowerKey = key.toLowerCase();
    const value = line.slice(eq + 1).trim();

    if (lowerKey === "registry" || lowerKey.endsWith(":registry")) {
      result.registries.add(value.endsWith("/") ? value : value + "/");
    }
    if (lowerKey.startsWith("//") && lowerKey.endsWith(":_authtoken")) {
      result.authKeys.add(lowerKey);
    }
    for (const m of value.matchAll(/\$\{(\w+)\}/g)) {
      result.envVarRefs.add(m[1]!);
    }
  }

  return result;
}

function authKeyFor(registryUrl: string): string {
  return `${registryUrl.replace(/^\w+:/, "")}:_authtoken`.toLowerCase();
}

function writeSupplementalAuth(registries: string[]): void {
  const supplementalPath = resolve(process.env.RUNNER_TEMP || process.cwd(), ".npmrc");
  const authKeysToWrite = new Set(registries.map(authKeyFor));

  const keepLines: string[] = [];
  if (existsSync(supplementalPath)) {
    for (const line of readFileSync(supplementalPath, "utf8").split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        const lineKey = line.slice(0, eq).trim().toLowerCase();
        if (authKeysToWrite.has(lineKey)) continue;
      }
      keepLines.push(line);
    }
  }

  for (const registry of registries) {
    keepLines.push(`${registry.replace(/^\w+:/, "")}:_authToken=\${NODE_AUTH_TOKEN}`);
  }

  writeFileSync(supplementalPath, keepLines.join(EOL));
  exportVariable("NPM_CONFIG_USERCONFIG", supplementalPath);
  info(`Wrote _authToken entries to ${supplementalPath} for registries: ${registries.join(", ")}`);
}

/**
 * Handle auth for the project's existing `.npmrc` without requiring
 * `registry-url` in the workflow.
 *
 * - If `.npmrc` declares a custom registry but no matching `_authToken` entry
 *   and `NODE_AUTH_TOKEN` is set, write a supplemental `_authToken=${NODE_AUTH_TOKEN}`
 *   line to `$RUNNER_TEMP/.npmrc` and point `NPM_CONFIG_USERCONFIG` at it, so the
 *   repo `.npmrc` can stay to just `@scope:registry=<url>`.
 * - For any `${VAR}` references already in the project `.npmrc`, re-export those
 *   env vars via `GITHUB_ENV` so they remain visible to package-manager
 *   subprocesses and subsequent steps.
 */
export function propagateProjectNpmrcAuth(projectDir: string): void {
  const npmrcPath = join(projectDir, ".npmrc");
  let content: string;
  try {
    content = readFileSync(npmrcPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  const parsed = parseNpmrc(content);

  const needsAuth = [...parsed.registries].filter((url) => !parsed.authKeys.has(authKeyFor(url)));

  if (process.env.NODE_AUTH_TOKEN && needsAuth.length > 0) {
    writeSupplementalAuth(needsAuth);
    parsed.envVarRefs.add("NODE_AUTH_TOKEN");
  }

  const propagatable = [...parsed.envVarRefs].filter(
    (name) => !RESERVED_ENV_VARS.has(name) && !!process.env[name],
  );

  if (propagatable.length === 0) {
    debug(`Project .npmrc at ${npmrcPath}: no auth env vars to propagate`);
    return;
  }

  info(
    `Detected project .npmrc at ${npmrcPath}. Propagating auth env vars: ${propagatable.join(", ")}`,
  );
  for (const name of propagatable) {
    exportVariable(name, process.env[name]!);
  }
}
