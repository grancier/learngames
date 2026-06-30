import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("@learn-engine/core dependency boundary", () => {
  it("declares no React or Ink dependencies", () => {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const dependencies = { ...pkg.dependencies, ...pkg.peerDependencies };

    expect(Object.keys(dependencies)).not.toContain("react");
    expect(Object.keys(dependencies)).not.toContain("ink");
  });
});
