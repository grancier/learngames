import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@learn-engine/core": new URL(
        "./packages/core/src/index.ts",
        import.meta.url,
      ).pathname,
      "@learn-engine/ink": new URL(
        "./packages/ink/src/index.ts",
        import.meta.url,
      ).pathname,
      "@learn-engine/lessons": new URL(
        "./packages/lessons/src/index.ts",
        import.meta.url,
      ).pathname,
      "@learn-engine/runtime": new URL(
        "./packages/runtime/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ["packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      include: [
        "packages/*/src/**/*.{ts,tsx}",
        "apps/examples/addition-drill/src/{game,source}.ts",
      ],
      exclude: ["packages/*/src/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
