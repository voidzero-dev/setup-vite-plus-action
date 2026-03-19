import { info, warning } from "@actions/core";

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

// FIXME: Re-enable vp CLI caching after the new version of vite-plus is released
// that fixes the Windows `Cannot find module 'which'` issue (#10).
export async function restoreVpCache(_version: string, _nodeVersion: string): Promise<boolean> {
  info("Vp CLI caching is temporarily disabled");
  return false;
}

// FIXME: Re-enable vp CLI caching after the new version of vite-plus is released
// that fixes the Windows `Cannot find module 'which'` issue (#10).
export async function saveVpCache(): Promise<void> {
  info("Vp CLI caching is temporarily disabled, skipping save");
}
