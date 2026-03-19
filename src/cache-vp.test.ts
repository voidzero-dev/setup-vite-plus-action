import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { arch } from "node:os";
import { resolveVersion, restoreVpCache, saveVpCache } from "./cache-vp.js";
import { State } from "./types.js";
import { restoreCache, saveCache } from "@actions/cache";
import { saveState, getState, warning } from "@actions/core";

// Mock @actions/cache
vi.mock("@actions/cache", () => ({
  restoreCache: vi.fn(),
  saveCache: vi.fn(),
}));

// Mock @actions/core
vi.mock("@actions/core", () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  saveState: vi.fn(),
  getState: vi.fn(),
}));

describe("resolveVersion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return explicit version as-is", async () => {
    const result = await resolveVersion("0.1.8");
    expect(result).toBe("0.1.8");
  });

  it("should return explicit semver-like versions as-is", async () => {
    const result = await resolveVersion("1.0.0-beta.1");
    expect(result).toBe("1.0.0-beta.1");
  });

  it("should resolve 'latest' from npm registry", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ version: "0.2.0" }), { status: 200 }));

    const result = await resolveVersion("latest");
    expect(result).toBe("0.2.0");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://registry.npmjs.org/vite-plus/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("should resolve dist-tag 'alpha' from npm registry", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ version: "0.3.0-alpha.1" }), { status: 200 }),
      );

    const result = await resolveVersion("alpha");
    expect(result).toBe("0.3.0-alpha.1");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://registry.npmjs.org/vite-plus/alpha",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("should return undefined when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const result = await resolveVersion("latest");
    expect(result).toBeUndefined();
  });

  it("should return undefined when fetch returns non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));

    const result = await resolveVersion("alpha");
    expect(result).toBeUndefined();
  });

  it("should return undefined for empty string input", async () => {
    const result = await resolveVersion("");
    expect(result).toBeUndefined();
  });
});

describe("restoreVpCache", () => {
  beforeEach(() => {
    vi.stubEnv("RUNNER_OS", "Linux");
    vi.stubEnv("HOME", "/home/runner");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("should return true on cache hit", async () => {
    const expectedKey = `setup-vp-Linux-${arch()}-0.1.8-node20`;
    vi.mocked(restoreCache).mockResolvedValue(expectedKey);

    const result = await restoreVpCache("0.1.8", "20");

    expect(result).toBe(true);
    expect(saveState).toHaveBeenCalledWith(State.VpCachePrimaryKey, expectedKey);
    expect(saveState).toHaveBeenCalledWith(State.VpCacheMatchedKey, expectedKey);
  });

  it("should include node version in cache key", async () => {
    vi.mocked(restoreCache).mockResolvedValue(undefined);

    await restoreVpCache("0.1.8", "22");

    expect(restoreCache).toHaveBeenCalledWith(
      ["/home/runner/.vite-plus"],
      `setup-vp-Linux-${arch()}-0.1.8-node22`,
    );
  });

  it("should handle empty node version", async () => {
    vi.mocked(restoreCache).mockResolvedValue(undefined);

    await restoreVpCache("0.1.8", "");

    expect(restoreCache).toHaveBeenCalledWith(
      ["/home/runner/.vite-plus"],
      `setup-vp-Linux-${arch()}-0.1.8-node`,
    );
  });

  it("should return false on cache miss", async () => {
    vi.mocked(restoreCache).mockResolvedValue(undefined);

    const result = await restoreVpCache("0.1.8", "20");

    expect(result).toBe(false);
  });

  it("should return false and warn on cache restore error", async () => {
    vi.mocked(restoreCache).mockRejectedValue(new Error("cache error"));

    const result = await restoreVpCache("0.1.8", "20");

    expect(result).toBe(false);
    expect(warning).toHaveBeenCalled();
  });
});

describe("saveVpCache", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/runner");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("should skip when no primary key", async () => {
    vi.mocked(getState).mockReturnValue("");

    await saveVpCache();

    expect(saveCache).not.toHaveBeenCalled();
  });

  it("should skip when primary key matches matched key", async () => {
    const key = `setup-vp-Linux-${arch()}-0.1.8-node20`;
    vi.mocked(getState).mockImplementation((k: string) => {
      if (k === State.VpCachePrimaryKey) return key;
      if (k === State.VpCacheMatchedKey) return key;
      return "";
    });

    await saveVpCache();

    expect(saveCache).not.toHaveBeenCalled();
  });

  it("should save cache on cache miss", async () => {
    const key = `setup-vp-Linux-${arch()}-0.1.8-node20`;
    vi.mocked(getState).mockImplementation((k: string) => {
      if (k === State.VpCachePrimaryKey) return key;
      return "";
    });
    vi.mocked(saveCache).mockResolvedValue(12345);

    await saveVpCache();

    expect(saveCache).toHaveBeenCalledWith(["/home/runner/.vite-plus"], key);
  });

  it("should handle save errors gracefully", async () => {
    vi.mocked(getState).mockImplementation((k: string) => {
      if (k === State.VpCachePrimaryKey) return `setup-vp-Linux-${arch()}-0.1.8-node20`;
      return "";
    });
    vi.mocked(saveCache).mockRejectedValue(new Error("ReserveCacheError"));

    await saveVpCache();

    expect(warning).toHaveBeenCalled();
  });
});
