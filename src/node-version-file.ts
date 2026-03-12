import { info } from "@actions/core";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { resolveWorkspacePath } from "./utils.js";

/**
 * Resolve a Node.js version from a version file.
 *
 * Supports: .nvmrc, .node-version, .tool-versions, package.json
 */
export function resolveNodeVersionFile(filePath: string): string {
  const fullPath = resolveWorkspacePath(filePath);

  let content: string;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch {
    throw new Error(`node-version-file not found: ${fullPath}`);
  }

  const filename = basename(fullPath);

  let version: string | undefined;

  if (filename === ".tool-versions") {
    version = parseToolVersions(content);
  } else if (filename === "package.json") {
    version = parsePackageJson(content);
  } else {
    // .nvmrc, .node-version, or any other plain text file
    version = parsePlainVersionFile(content);
  }

  if (!version) {
    throw new Error(`No Node.js version found in ${filePath}`);
  }

  // Strip leading 'v' prefix (e.g., "v20.11.0" -> "20.11.0")
  version = version.replace(/^v/i, "");

  info(`Resolved Node.js version '${version}' from ${filePath}`);
  return version;
}

/**
 * Parse a plain text version file (.nvmrc, .node-version, etc).
 * Returns the first non-empty, non-comment line.
 */
function parsePlainVersionFile(content: string): string | undefined {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Parse .tool-versions (asdf format).
 * Looks for 'nodejs' or 'node' entries.
 */
function parseToolVersions(content: string): string | undefined {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [tool, version] = trimmed.split(/\s+/);
    if (version && (tool === "nodejs" || tool === "node")) {
      return version;
    }
  }
  return undefined;
}

/**
 * Parse package.json for Node.js version.
 * Priority (matching actions/setup-node):
 *   1. devEngines.runtime (name: "node")
 *   2. engines.node
 */
function parsePackageJson(content: string): string | undefined {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse package.json: invalid JSON");
  }

  // Check devEngines.runtime first
  const devEngines = pkg.devEngines as Record<string, unknown> | undefined;
  if (devEngines?.runtime) {
    const version = findNodeRuntime(devEngines.runtime);
    if (version) return version;
  }

  // Fall back to engines.node
  const engines = pkg.engines as Record<string, unknown> | undefined;
  if (engines?.node && typeof engines.node === "string") {
    return engines.node;
  }

  return undefined;
}

interface RuntimeEntry {
  name?: string;
  version?: string;
}

function findNodeRuntime(runtime: unknown): string | undefined {
  const entries = Array.isArray(runtime) ? runtime : [runtime];
  for (const entry of entries as RuntimeEntry[]) {
    if (entry?.name === "node" && typeof entry.version === "string") {
      return entry.version;
    }
  }
  return undefined;
}
