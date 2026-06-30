import { describe, expect, it } from "vitest";
import {
  Surface,
  bgSgr,
  fgSgr,
  rasterizeToAnsi,
  rasterizeToSegments,
  rasterizeToText,
  rgb,
} from "./index.js";

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

describe("rasterizer color boundaries", () => {
  it("emits truecolor and default SGR codes", () => {
    expect(fgSgr(rgb(10, 20, 30))).toBe("38;2;10;20;30");
    expect(fgSgr("default")).toBe("39");
    expect(bgSgr(rgb(1, 2, 3))).toBe("48;2;1;2;3");
    expect(bgSgr("default")).toBe("49");
  });
});

describe("segment rasterization", () => {
  it("coalesces maximal same-style runs in each row", () => {
    const surface = Surface.create(4, 1, {
      char: "a",
      fg: rgb(1, 2, 3),
      bg: "default",
      bold: false,
    });
    surface.set(2, 0, {
      char: "b",
      fg: rgb(9, 9, 9),
      bg: "default",
      bold: false,
    });

    const [row] = rasterizeToSegments(surface);

    expect(row?.map((segment) => segment.text)).toEqual(["aa", "b", "a"]);
  });

  it("resolves transparent or inherited stragglers defensively", () => {
    const surface = Surface.transparent(2, 1);
    surface.set(1, 0, { char: "x" });

    expect(rasterizeToText(surface)).toEqual([" x"]);
    expect(rasterizeToSegments(surface)[0]).toEqual([
      { text: " x", fg: "default", bg: "default", bold: false },
    ]);
  });
});

describe("ANSI rasterization", () => {
  it("emits reset-terminated styled rows whose stripped text matches the grid", () => {
    const surface = Surface.create(5, 1);
    surface.drawText(0, 0, "hi", { fg: rgb(0, 255, 0), bold: true });

    const [line] = rasterizeToAnsi(surface);
    const stripped = line?.replace(ansiPattern, "");

    expect(line?.startsWith("\x1b[")).toBe(true);
    expect(line?.endsWith("\x1b[0m")).toBe(true);
    expect(line).toContain("38;2;0;255;0");
    expect(line).toContain("1;");
    expect(stripped).toBe("hi   ");
  });
});
