import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportVariable, info, debug } from "@actions/core";

export interface ProjectNpmrc {
  path: string;
  envVars: string[];
}

// Env vars that should never be re-exported via GITHUB_ENV (system/runner-managed)
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
 * Detect a project-level `.npmrc` at the given directory and collect any
 * `${VAR}` env var references inside it.
 */
export function detectProjectNpmrc(projectDir: string): ProjectNpmrc | undefined {
  const npmrcPath = join(projectDir, ".npmrc");
  if (!existsSync(npmrcPath)) return undefined;

  const content = readFileSync(npmrcPath, "utf8");
  const seen = new Set<string>();
  const envVars: string[] = [];
  for (const match of content.matchAll(/\$\{(\w+)\}/g)) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      envVars.push(name);
    }
  }

  return { path: npmrcPath, envVars };
}

/**
 * When the project has an `.npmrc` referencing env vars (commonly
 * `${NODE_AUTH_TOKEN}` for private registries), re-export the ones that are
 * already set so they persist via `GITHUB_ENV` and remain reliably visible to
 * package-manager subprocesses spawned by `vp install` and to subsequent
 * workflow steps.
 *
 * This lets users rely on their existing `.npmrc` without having to also pass
 * `registry-url` to `setup-vp` just to get auth forwarding.
 */
export function propagateProjectNpmrcAuth(projectDir: string): void {
  const npmrc = detectProjectNpmrc(projectDir);
  if (!npmrc) return;

  const propagatable = npmrc.envVars.filter(
    (name) => !RESERVED_ENV_VARS.has(name) && !!process.env[name],
  );

  if (propagatable.length === 0) {
    debug(`Project .npmrc at ${npmrc.path}: no auth env vars to propagate`);
    return;
  }

  info(
    `Detected project .npmrc at ${npmrc.path}. Propagating auth env vars: ${propagatable.join(", ")}`,
  );
  for (const name of propagatable) {
    exportVariable(name, process.env[name]!);
  }
}
