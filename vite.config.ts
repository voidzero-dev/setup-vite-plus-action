import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: ["./src/index.ts"],
    format: ["esm"],
    outDir: "dist",
    deps: {
      alwaysBundle: [/.*/],
      onlyBundle: false,
    },
    clean: true,
    minify: true,
  },
  lint: {
    ignorePatterns: ["dist/**/*"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["dist/**/*"],
  },
});
