import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProjectNpmrc, propagateProjectNpmrcAuth } from "./npmrc-detect.js";
import { exportVariable, info } from "@actions/core";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  debug: vi.fn(),
  exportVariable: vi.fn(),
}));

describe("detectProjectNpmrc", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "setup-vp-npmrc-"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("returns undefined when no .npmrc exists", () => {
    expect(detectProjectNpmrc(workDir)).toBeUndefined();
  });

  it("returns path and env vars when .npmrc references ${NODE_AUTH_TOKEN}", () => {
    const npmrcPath = join(workDir, ".npmrc");
    writeFileSync(
      npmrcPath,
      [
        "@myorg:registry=https://npm.pkg.github.com",
        "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
      ].join("\n"),
    );

    const result = detectProjectNpmrc(workDir);
    expect(result).toEqual({
      path: npmrcPath,
      envVars: ["NODE_AUTH_TOKEN"],
    });
  });

  it("collects multiple distinct env var references", () => {
    writeFileSync(
      join(workDir, ".npmrc"),
      [
        "@orgA:registry=https://npm.pkg.github.com",
        "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}",
        "@orgB:registry=https://registry.example.com",
        "//registry.example.com/:_authToken=${NPM_TOKEN}",
      ].join("\n"),
    );

    const result = detectProjectNpmrc(workDir);
    expect(result?.envVars.sort()).toEqual(["GITHUB_TOKEN", "NPM_TOKEN"]);
  });

  it("returns empty envVars when .npmrc has no ${...} references", () => {
    writeFileSync(join(workDir, ".npmrc"), "registry=https://registry.npmjs.org/");

    const result = detectProjectNpmrc(workDir);
    expect(result?.envVars).toEqual([]);
  });
});

describe("propagateProjectNpmrcAuth", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "setup-vp-npmrc-"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("does nothing when there is no project .npmrc", () => {
    propagateProjectNpmrcAuth(workDir);
    expect(exportVariable).not.toHaveBeenCalled();
  });

  it("exports referenced env vars that are set in the environment", () => {
    writeFileSync(join(workDir, ".npmrc"), "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}");
    vi.stubEnv("NODE_AUTH_TOKEN", "my-real-token");

    propagateProjectNpmrcAuth(workDir);

    expect(exportVariable).toHaveBeenCalledWith("NODE_AUTH_TOKEN", "my-real-token");
    expect(info).toHaveBeenCalledWith(expect.stringContaining(".npmrc"));
  });

  it("skips env vars that are not set", () => {
    writeFileSync(join(workDir, ".npmrc"), "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}");
    vi.stubEnv("NODE_AUTH_TOKEN", "");

    propagateProjectNpmrcAuth(workDir);

    expect(exportVariable).not.toHaveBeenCalled();
  });

  it("does not re-export PATH or HOME even if referenced", () => {
    // Reserved/system vars should not be exported to GITHUB_ENV via exportVariable
    writeFileSync(join(workDir, ".npmrc"), "cache=${HOME}/.npm-cache");
    vi.stubEnv("HOME", "/home/runner");

    propagateProjectNpmrcAuth(workDir);

    expect(exportVariable).not.toHaveBeenCalledWith("HOME", expect.anything());
  });

  it("exports all referenced auth-like env vars", () => {
    writeFileSync(
      join(workDir, ".npmrc"),
      [
        "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}",
        "//registry.example.com/:_authToken=${NPM_TOKEN}",
      ].join("\n"),
    );
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("NPM_TOKEN", "npm-token");

    propagateProjectNpmrcAuth(workDir);

    expect(exportVariable).toHaveBeenCalledWith("GITHUB_TOKEN", "gh-token");
    expect(exportVariable).toHaveBeenCalledWith("NPM_TOKEN", "npm-token");
  });

  it("works when .npmrc is in a nested working directory", () => {
    const nested = join(workDir, "packages", "app");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, ".npmrc"), "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}");
    vi.stubEnv("NODE_AUTH_TOKEN", "abc");

    propagateProjectNpmrcAuth(nested);

    expect(exportVariable).toHaveBeenCalledWith("NODE_AUTH_TOKEN", "abc");
  });
});
