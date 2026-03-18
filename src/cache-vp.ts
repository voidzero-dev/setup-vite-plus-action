import { restoreCache, saveCache } from "@actions/cache";
import { info, debug, saveState, getState, warning } from "@actions/core";
import { arch, platform } from "node:os";
import { join } from "node:path";
import { mkdirSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { State } from "./types.js";
import { getVitePlusHome } from "./utils.js";

/**
 * Resolve "latest" to a specific version number via npm registry.
 * Returns undefined on failure so the caller can fall back to installing without cache.
 */
export async function resolveVersion(versionInput: string): Promise<string | undefined> {
  if (versionInput && versionInput !== "latest") {
    return versionInput;
  }

  try {
    const response = await fetch("https://registry.npmjs.org/vite-plus/latest", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { version: string };
    info(`Resolved latest vp version: ${data.version}`);
    return data.version;
  } catch (error) {
    warning(`Failed to resolve latest vp version: ${error}. Skipping vp cache.`);
    return undefined;
  }
}

export async function restoreVpCache(version: string): Promise<boolean> {
  const vpHome = getVitePlusHome();
  const versionDir = join(vpHome, version);
  const runnerOS = process.env.RUNNER_OS || platform();
  const runnerArch = arch();
  const primaryKey = `setup-vp-${runnerOS}-${runnerArch}-${version}`;

  debug(`Vp cache key: ${primaryKey}`);
  debug(`Vp cache path: ${versionDir}`);
  saveState(State.VpCachePrimaryKey, primaryKey);
  saveState(State.VpCacheVersion, version);

  try {
    const matchedKey = await restoreCache([versionDir], primaryKey);
    if (matchedKey) {
      info(`Vite+ restored from cache (key: ${matchedKey})`);
      saveState(State.VpCacheMatchedKey, matchedKey);
      linkVpVersion(vpHome, version);
      return true;
    }
  } catch (error) {
    warning(`Failed to restore vp cache: ${error}`);
  }

  return false;
}

/**
 * Recreate the symlinks that the install script normally creates:
 *   ~/.vite-plus/current → {version}
 *   ~/.vite-plus/bin/vp  → ../current/bin/vp
 */
function linkVpVersion(vpHome: string, version: string): void {
  const currentLink = join(vpHome, "current");
  const binDir = join(vpHome, "bin");
  const binLink = join(binDir, process.platform === "win32" ? "vp.exe" : "vp");

  // current → version directory
  if (existsSync(currentLink)) rmSync(currentLink);
  symlinkSync(version, currentLink);

  // bin/vp → ../current/bin/vp
  mkdirSync(binDir, { recursive: true });
  if (existsSync(binLink)) rmSync(binLink);
  symlinkSync(
    join("..", "current", "bin", process.platform === "win32" ? "vp.exe" : "vp"),
    binLink,
  );
}

export async function saveVpCache(): Promise<void> {
  const primaryKey = getState(State.VpCachePrimaryKey);
  const matchedKey = getState(State.VpCacheMatchedKey);
  const version = getState(State.VpCacheVersion);

  if (!primaryKey || !version) {
    debug("No vp cache key found. Skipping save.");
    return;
  }

  if (primaryKey === matchedKey) {
    info(`Vp cache hit on primary key "${primaryKey}". Skipping save.`);
    return;
  }

  try {
    const versionDir = join(getVitePlusHome(), version);
    const cacheId = await saveCache([versionDir], primaryKey);
    if (cacheId === -1) {
      warning("Vp cache save failed or was skipped.");
      return;
    }
    info(`Vp cache saved with key: ${primaryKey}`);
  } catch (error) {
    warning(`Failed to save vp cache: ${String(error)}`);
  }
}
