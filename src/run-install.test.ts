import { describe, it, expect, afterEach, vi } from "vite-plus/test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { runViteInstall } from "./run-install.js";
import type { Inputs } from "./types.js";

const baseInputs: Inputs = {
  version: "latest",
  nodeVersion: undefined,
  nodeVersionFile: undefined,
  workingDirectory: undefined,
  runInstall: [],
  cache: false,
  cacheDependencyPath: undefined,
  registryUrl: undefined,
  scope: undefined,
};

describe("runViteInstall", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("stops after the first failed install", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "setup-vp-"));
    const binDir = join(tempDir, "bin");
    const appDir = join(tempDir, "packages", "app");
    const libDir = join(tempDir, "packages", "lib");
    const callsLog = join(tempDir, "calls.log");

    mkdirSync(binDir);
    mkdirSync(appDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(appDir, ".fail-vp-install"), "");

    writeFileSync(
      join(binDir, "vp"),
      [
        "#!/bin/sh",
        'printf "%s %s\\n" "$PWD" "$*" >> "$VP_CALLS_LOG"',
        'if [ -f ".fail-vp-install" ]; then',
        '  echo "install failed" >&2',
        "  exit 1",
        "fi",
        "exit 0",
        "",
      ].join("\n"),
    );
    chmodSync(join(binDir, "vp"), 0o755);

    writeFileSync(
      join(binDir, "vp.cmd"),
      [
        "@echo off",
        'echo %CD% %*>>"%VP_CALLS_LOG%"',
        'if exist ".fail-vp-install" (',
        "  echo install failed 1>&2",
        "  exit /b 1",
        ")",
        "exit /b 0",
        "",
      ].join("\r\n"),
    );

    vi.stubEnv("GITHUB_WORKSPACE", tempDir);
    vi.stubEnv("PATH", `${binDir}${delimiter}${process.env.PATH ?? ""}`);
    vi.stubEnv("VP_CALLS_LOG", callsLog);

    await expect(
      runViteInstall({
        ...baseInputs,
        runInstall: [{ cwd: "packages/app" }, { cwd: "packages/lib" }],
      }),
    ).rejects.toThrow(`Command "vp install" (cwd: ${appDir}) exited with code 1`);

    const calls = readFileSync(callsLog, "utf8").trim().split(/\r?\n/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(`${join("packages", "app")} install`);
  });
});
