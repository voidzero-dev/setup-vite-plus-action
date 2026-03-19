import { saveState, getState, setFailed, info, setOutput, warning } from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import { getInputs } from "./inputs.js";
import { installVitePlus } from "./install-viteplus.js";
import { runViteInstall } from "./run-install.js";
import { restoreCache } from "./cache-restore.js";
import { saveCache } from "./cache-save.js";
import { saveVpCache } from "./cache-vp.js";
import { State, Outputs } from "./types.js";
import type { Inputs } from "./types.js";
import { resolveNodeVersionFile } from "./node-version-file.js";

async function runMain(inputs: Inputs): Promise<void> {
  // Mark that post action should run
  saveState(State.IsPost, "true");

  // Step 1: Resolve Node.js version (needed for cache key)
  let nodeVersion = inputs.nodeVersion;
  if (!nodeVersion && inputs.nodeVersionFile) {
    nodeVersion = resolveNodeVersionFile(inputs.nodeVersionFile);
  }

  // Step 2: Install Vite+ (with cache keyed by vp version + node version)
  await installVitePlus(inputs, nodeVersion || "");

  // Step 3: Set up Node.js version if specified
  if (nodeVersion) {
    info(`Setting up Node.js ${nodeVersion} via vp env use...`);
    await exec("vp", ["env", "use", nodeVersion]);
  }

  // Step 4: Restore cache if enabled
  if (inputs.cache) {
    await restoreCache(inputs);
  }

  // Step 5: Run vp install if requested
  if (inputs.runInstall.length > 0) {
    await runViteInstall(inputs);
  }

  // Print version info at the end
  await printViteVersion();
}

async function printViteVersion(): Promise<void> {
  try {
    const result = await getExecOutput("vp", ["--version"], { silent: true });
    const versionOutput = result.stdout.trim();
    info(versionOutput);

    // Extract global version for output (e.g., "- Global: v0.0.0" -> "0.0.0")
    const globalMatch = versionOutput.match(/Global:\s*v?([\d.]+[^\s]*)/i);
    const version = globalMatch?.[1] || "unknown";
    saveState(State.InstalledVersion, version);
    setOutput(Outputs.Version, version);
  } catch (error) {
    warning(`Could not get vp version: ${String(error)}`);
    setOutput(Outputs.Version, "unknown");
  }
}

async function runPost(inputs: Inputs): Promise<void> {
  const saves: Promise<void>[] = [saveVpCache()];
  if (inputs.cache) {
    saves.push(saveCache());
  }
  await Promise.all(saves);
}

async function main(): Promise<void> {
  const inputs = getInputs();

  if (getState(State.IsPost) === "true") {
    await runPost(inputs);
  } else {
    await runMain(inputs);
  }
}

main().catch((error) => {
  console.error(error);
  setFailed(error instanceof Error ? error.message : String(error));
});
