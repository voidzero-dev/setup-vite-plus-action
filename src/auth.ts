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

/**
 * When the project has an `.npmrc` referencing env vars (commonly
 * `${NODE_AUTH_TOKEN}` for private registries), re-export the ones that are
 * already set so they persist via `GITHUB_ENV` and remain visible to the
 * package-manager subprocess spawned by `vp install` and to subsequent steps.
 * Lets users rely on their existing `.npmrc` without also passing `registry-url`.
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

  const referenced = new Set<string>();
  for (const match of content.matchAll(/\$\{(\w+)\}/g)) {
    referenced.add(match[1]!);
  }

  const propagatable = [...referenced].filter(
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
