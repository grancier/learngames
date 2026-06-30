import { describe, expect, it } from "vitest";
import { bgSgr, fgSgr, rgb, toHex } from "./color.js";

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
});
