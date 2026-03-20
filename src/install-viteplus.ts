import { info, addPath } from "@actions/core";
import { exec } from "@actions/exec";
import { join } from "node:path";
import type { Inputs } from "./types.js";
import { DISPLAY_NAME } from "./types.js";
import { resolveVersion, restoreVpCache } from "./cache-vp.js";
import { getVitePlusHome } from "./utils.js";

const INSTALL_URL_SH = "https://viteplus.dev/install.sh";
const INSTALL_URL_PS1 = "https://viteplus.dev/install.ps1";

export async function installVitePlus(inputs: Inputs, nodeVersion: string): Promise<void> {
  const { version } = inputs;

  // Try to resolve version and restore from cache
  const resolvedVersion = await resolveVersion(version);
  if (resolvedVersion) {
    const cacheHit = await restoreVpCache(resolvedVersion, nodeVersion);
    if (cacheHit) {
      ensureVitePlusBinInPath();
      info(`${DISPLAY_NAME} restored from cache`);
      return;
    }
  }

  // Cache miss or resolution failed — install fresh
  const installVersion = resolvedVersion || version;
  info(`Installing ${DISPLAY_NAME}@${installVersion}...`);

  const env = { ...process.env, VITE_PLUS_VERSION: installVersion };
  let exitCode: number;

  if (process.platform === "win32") {
    exitCode = await exec(
      "pwsh",
      ["-Command", `& ([scriptblock]::Create((irm ${INSTALL_URL_PS1})))`],
      { env },
    );
  } else {
    exitCode = await exec("bash", ["-c", `curl -fsSL ${INSTALL_URL_SH} | bash`], { env });
  }

  if (exitCode !== 0) {
    throw new Error(`Failed to install ${DISPLAY_NAME}. Exit code: ${exitCode}`);
  }

  ensureVitePlusBinInPath();
}

function ensureVitePlusBinInPath(): void {
  const binDir = join(getVitePlusHome(), "bin");
  if (!process.env.PATH?.includes(binDir)) {
    addPath(binDir);
  }
}
