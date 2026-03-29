import { info, addPath } from "@actions/core";
import { exec } from "@actions/exec";
import { join } from "node:path";
import type { Inputs } from "./types.js";
import { DISPLAY_NAME } from "./types.js";
import { getVitePlusHome } from "./utils.js";

const INSTALL_URL_SH = "https://viteplus.dev/install.sh";
const INSTALL_URL_PS1 = "https://viteplus.dev/install.ps1";

export async function installVitePlus(inputs: Inputs): Promise<void> {
  const { version } = inputs;

  info(`Installing ${DISPLAY_NAME}@${version}...`);

  // TODO: Remove VITE_PLUS_VERSION once vite-plus versions before the VP_* env var
  // rename (see https://github.com/voidzero-dev/vite-plus/pull/1166) are no longer supported.
  const env = { ...process.env, VP_VERSION: version, VITE_PLUS_VERSION: version };
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
