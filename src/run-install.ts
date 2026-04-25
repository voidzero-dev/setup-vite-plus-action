import { startGroup, endGroup, info, error as logError } from "@actions/core";
import { getExecOutput } from "@actions/exec";
import type { Inputs } from "./types.js";
import { getConfiguredProjectDir, getInstallCwd } from "./utils.js";

const MAX_ERROR_TAIL = 4000;

function tailOutput(buffer: string, max: number): string {
  const trimmed = buffer.trim();
  if (trimmed.length <= max) return trimmed;
  return `…(truncated, showing last ${max} chars)…\n${trimmed.slice(-max)}`;
}

export async function runViteInstall(inputs: Inputs): Promise<void> {
  const projectDir = getConfiguredProjectDir(inputs);

  for (const options of inputs.runInstall) {
    const args = ["install"];
    if (options.args) {
      args.push(...options.args);
    }

    const cwd = getInstallCwd(projectDir, options.cwd);
    const cmdStr = `vp ${args.join(" ")}`;

    startGroup(`Running ${cmdStr} in ${cwd}...`);

    let result: Awaited<ReturnType<typeof getExecOutput>>;
    try {
      result = await getExecOutput("vp", args, {
        cwd,
        ignoreReturnCode: true,
      });
    } catch (error) {
      endGroup();
      throw new Error(`Failed to run ${cmdStr}: ${String(error)}`);
    }

    endGroup();

    if (result.exitCode === 0) {
      info(`Successfully ran ${cmdStr}`);
      continue;
    }

    const detail = result.stderr.trim() || result.stdout.trim();
    if (detail) {
      logError(tailOutput(detail, MAX_ERROR_TAIL), {
        title: `${cmdStr} failed`,
      });
    }
    throw new Error(`Command "${cmdStr}" (cwd: ${cwd}) exited with code ${result.exitCode}`);
  }
}
