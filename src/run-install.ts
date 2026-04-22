import { startGroup, endGroup, setFailed, info, error as logError } from "@actions/core";
import { exec } from "@actions/exec";
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

    let stderrBuffer = "";
    let stdoutBuffer = "";
    let groupOpen = true;

    startGroup(`Running ${cmdStr} in ${cwd}...`);

    try {
      const exitCode = await exec("vp", args, {
        cwd,
        ignoreReturnCode: true,
        listeners: {
          stdout: (data: Buffer) => {
            stdoutBuffer += data.toString();
          },
          stderr: (data: Buffer) => {
            stderrBuffer += data.toString();
          },
        },
      });

      if (exitCode !== 0) {
        endGroup();
        groupOpen = false;
        const detail = stderrBuffer.trim() || stdoutBuffer.trim();
        if (detail) {
          logError(tailOutput(detail, MAX_ERROR_TAIL), {
            title: `${cmdStr} failed`,
          });
        }
        setFailed(`Command "${cmdStr}" (cwd: ${cwd}) exited with code ${exitCode}`);
      } else {
        info(`Successfully ran ${cmdStr}`);
      }
    } catch (err) {
      if (groupOpen) {
        endGroup();
        groupOpen = false;
      }
      setFailed(`Failed to run ${cmdStr}: ${String(err)}`);
    } finally {
      if (groupOpen) {
        endGroup();
      }
    }
  }
}
