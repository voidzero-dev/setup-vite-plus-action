import { startGroup, endGroup, setFailed, info, debug } from "@actions/core";
import { exec } from "@actions/exec";
import type { Inputs } from "./types.js";

export async function runViteInstall(inputs: Inputs): Promise<void> {
  const { registry, githubToken } = inputs;

  // Set up environment for vite install
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Pass GitHub token via VP_TOKEN for GitHub Package Registry
  if (registry === "github" && githubToken) {
    debug("Setting VP_TOKEN environment variable for vite install");
    env.VP_TOKEN = githubToken;
  }

  for (const options of inputs.runInstall) {
    const args = ["install"];
    if (options.args) {
      args.push(...options.args);
    }

    const cwd = options.cwd || process.env.GITHUB_WORKSPACE || process.cwd();
    const cmdStr = `vite ${args.join(" ")}`;

    startGroup(`Running ${cmdStr} in ${cwd}...`);

    try {
      const exitCode = await exec("vite", args, {
        cwd,
        env,
        ignoreReturnCode: true,
      });

      if (exitCode !== 0) {
        setFailed(`Command "${cmdStr}" (cwd: ${cwd}) exited with code ${exitCode}`);
      } else {
        info(`Successfully ran ${cmdStr}`);
      }
    } catch (error) {
      setFailed(`Failed to run ${cmdStr}: ${error}`);
    } finally {
      endGroup();
    }
  }
}
