import { restoreCache, saveCache } from "@actions/cache";
import { info, debug, saveState, getState, warning } from "@actions/core";
import { arch, platform } from "node:os";
import { State } from "./types.js";
import { getVitePlusHome } from "./utils.js";

const SEMVER_RE = /^\d+\.\d+\.\d+/;

/**
 * Resolve version input to a precise semver version.
 * If the input is already a precise version (e.g. "0.1.8", "1.0.0-beta.1"), return as-is.
 * Otherwise treat it as a dist-tag (e.g. "latest", "alpha") and resolve via npm registry.
 * Returns undefined on failure so the caller can fall back to installing without cache.
 */
export async function resolveVersion(versionInput: string): Promise<string | undefined> {
  if (!versionInput) return undefined;
  if (SEMVER_RE.test(versionInput)) return versionInput;

  try {
    const response = await fetch(
      `https://registry.npmjs.org/vite-plus/${encodeURIComponent(versionInput)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { version: string };
    info(`Resolved vp@${versionInput} to ${data.version}`);
    return data.version;
  } catch (error) {
    warning(`Failed to resolve vp@${versionInput}: ${error}. Skipping vp cache.`);
    return undefined;
  }
}

export async function restoreVpCache(version: string, nodeVersion: string): Promise<boolean> {
  const vpHome = getVitePlusHome();
  const runnerOS = process.env.RUNNER_OS || platform();
  const runnerArch = arch();
  const primaryKey = `setup-vp-${runnerOS}-${runnerArch}-${version}-node${nodeVersion}`;

  debug(`Vp cache key: ${primaryKey}`);
  debug(`Vp cache path: ${vpHome}`);
  saveState(State.VpCachePrimaryKey, primaryKey);

  try {
    const matchedKey = await restoreCache([vpHome], primaryKey);
    if (matchedKey) {
      info(`Vite+ restored from cache (key: ${matchedKey})`);
      saveState(State.VpCacheMatchedKey, matchedKey);
      return true;
    }
  } catch (error) {
    warning(`Failed to restore vp cache: ${error}`);
  }

  return false;
}

export async function saveVpCache(): Promise<void> {
  const primaryKey = getState(State.VpCachePrimaryKey);
  const matchedKey = getState(State.VpCacheMatchedKey);

  if (!primaryKey) {
    debug("No vp cache key found. Skipping save.");
    return;
  }

  if (primaryKey === matchedKey) {
    info(`Vp cache hit on primary key "${primaryKey}". Skipping save.`);
    return;
  }

  try {
    const vpHome = getVitePlusHome();
    const cacheId = await saveCache([vpHome], primaryKey);
    if (cacheId === -1) {
      warning("Vp cache save failed or was skipped.");
      return;
    }
    info(`Vp cache saved with key: ${primaryKey}`);
  } catch (error) {
    warning(`Failed to save vp cache: ${String(error)}`);
  }
}
