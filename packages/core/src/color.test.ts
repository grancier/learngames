import { describe, expect, it } from "vitest";
import { bgSgr, colorEq, fgSgr, rgb, toHex } from "./color.js";

describe("color model", () => {
  it("clamps and rounds RGB channels into byte range", () => {
    expect(rgb(300, -5, 1.6)).toEqual({ r: 255, g: 0, b: 2 });
    expect(rgb(Number.NaN, Number.POSITIVE_INFINITY, 12.2)).toEqual({
      r: 0,
      g: 0,
      b: 12,
    });
  });

  it("formats RGB and default colors for Ink and ANSI boundaries", () => {
    const purple = rgb(128, 64, 255);

    expect(toHex(purple)).toBe("#8040ff");
    expect(toHex("default")).toBeUndefined();
    expect(toHex(undefined)).toBeUndefined();
    expect(fgSgr(purple)).toBe("38;2;128;64;255");
    expect(bgSgr(purple)).toBe("48;2;128;64;255");
    expect(fgSgr("default")).toBe("39");
    expect(bgSgr("default")).toBe("49");
  });

  it("compares default, inherited, and RGB colors structurally", () => {
    expect(colorEq("default", "default")).toBe(true);
    expect(colorEq(undefined, rgb(1, 2, 3))).toBe(false);
    expect(colorEq("default", rgb(1, 2, 3))).toBe(false);
    expect(colorEq(rgb(1, 2, 3), rgb(1, 2, 3))).toBe(true);
    expect(colorEq(rgb(1, 2, 3), rgb(1, 2, 4))).toBe(false);
  });
});
