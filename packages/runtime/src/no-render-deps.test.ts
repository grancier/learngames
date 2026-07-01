import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("@learn-engine/runtime purity", () => {
  it("declares no react/ink/node:fs dependency and only its workspace deps", () => {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const runtime = Object.keys({
      ...pkg.dependencies,
      ...pkg.peerDependencies,
    });
    for (const forbidden of ["react", "ink", "node:fs", "fs"]) {
      expect(runtime).not.toContain(forbidden);
    }
    // The pure runtime dependency set is exactly its two workspace siblings.
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      "@learn-engine/core",
      "@learn-engine/lessons",
    ]);
  });
});
