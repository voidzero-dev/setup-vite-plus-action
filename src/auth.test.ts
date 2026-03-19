import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { configAuthentication } from "./auth.js";
import { exportVariable } from "@actions/core";

vi.mock("@actions/core", () => ({
  debug: vi.fn(),
  exportVariable: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe("configAuthentication", () => {
  const runnerTemp = "/tmp/runner";

  beforeEach(() => {
    vi.stubEnv("RUNNER_TEMP", runnerTemp);
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("should write .npmrc with registry and auth token", () => {
    configAuthentication("https://registry.npmjs.org/");

    const expectedPath = join(runnerTemp, ".npmrc");
    expect(writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expect.stringContaining("//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}"),
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expect.stringContaining("registry=https://registry.npmjs.org/"),
    );
  });

  it("should append trailing slash if missing", () => {
    configAuthentication("https://registry.npmjs.org");

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("registry=https://registry.npmjs.org/"),
    );
  });

  it("should auto-detect scope for GitHub Packages registry", () => {
    vi.stubEnv("GITHUB_REPOSITORY_OWNER", "voidzero-dev");

    configAuthentication("https://npm.pkg.github.com");

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("@voidzero-dev:registry=https://npm.pkg.github.com/"),
    );
  });

  it("should use explicit scope", () => {
    configAuthentication("https://npm.pkg.github.com", "@myorg");

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("@myorg:registry=https://npm.pkg.github.com/"),
    );
  });

  it("should prepend @ to scope if missing", () => {
    configAuthentication("https://npm.pkg.github.com", "myorg");

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("@myorg:registry=https://npm.pkg.github.com/"),
    );
  });

  it("should lowercase scope", () => {
    configAuthentication("https://npm.pkg.github.com", "@MyOrg");

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("@myorg:registry=https://npm.pkg.github.com/"),
    );
  });

  it("should preserve existing .npmrc content except registry and auth lines", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        "always-auth=true",
        "registry=https://old.reg/",
        "//old.reg/:_authToken=${NODE_AUTH_TOKEN}",
      ].join("\n"),
    );

    configAuthentication("https://registry.npmjs.org/");

    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    expect(written).toContain("always-auth=true");
    expect(written).not.toContain("https://old.reg/");
    expect(written).toContain("registry=https://registry.npmjs.org/");
  });

  it("should remove existing auth token lines for the same registry", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        "//registry.npmjs.org/:_authToken=old-token",
        "registry=https://registry.npmjs.org/",
        "other-config=true",
      ].join("\n"),
    );

    configAuthentication("https://registry.npmjs.org/");

    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    expect(written).not.toContain("old-token");
    expect(written).toContain("other-config=true");
    expect(written).toContain("//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}");
  });

  it("should handle Windows-style line endings in existing .npmrc", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("always-auth=true\r\nregistry=https://old.reg/\r\n");

    configAuthentication("https://registry.npmjs.org/");

    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    expect(written).toContain("always-auth=true");
    expect(written).not.toContain("https://old.reg/");
  });

  it("should not auto-detect scope for lookalike GitHub Packages URLs", () => {
    vi.stubEnv("GITHUB_REPOSITORY_OWNER", "voidzero-dev");

    configAuthentication("https://npm.pkg.github.com.evil.example");

    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    // Should NOT have scoped registry — the host doesn't match exactly
    expect(written).not.toContain("@voidzero-dev:");
  });

  it("should throw on invalid URL", () => {
    expect(() => configAuthentication("not-a-url")).toThrow("Invalid registry-url");
  });

  it("should export NPM_CONFIG_USERCONFIG", () => {
    configAuthentication("https://registry.npmjs.org/");

    expect(exportVariable).toHaveBeenCalledWith(
      "NPM_CONFIG_USERCONFIG",
      join(runnerTemp, ".npmrc"),
    );
  });

  it("should export NODE_AUTH_TOKEN placeholder when not set", () => {
    configAuthentication("https://registry.npmjs.org/");

    expect(exportVariable).toHaveBeenCalledWith("NODE_AUTH_TOKEN", "XXXXX-XXXXX-XXXXX-XXXXX");
  });

  it("should preserve existing NODE_AUTH_TOKEN", () => {
    vi.stubEnv("NODE_AUTH_TOKEN", "my-real-token");

    configAuthentication("https://registry.npmjs.org/");

    expect(exportVariable).toHaveBeenCalledWith("NODE_AUTH_TOKEN", "my-real-token");
  });
});
