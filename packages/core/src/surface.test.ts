import { describe, expect, it } from "vitest";
import { BLANK, BORDERS, Surface, rgb } from "./index.js";
import { rasterizeToText } from "./index.js";

describe("Surface construction", () => {
  it("creates a width by height grid filled with blank cells", () => {
    const surface = Surface.create(3, 2);

    expect([surface.width, surface.height]).toEqual([3, 2]);
    expect(rasterizeToText(surface)).toEqual(["   ", "   "]);
  });

  it("rejects non-positive and non-integer dimensions", () => {
    expect(() => Surface.create(0, 5)).toThrow(RangeError);
    expect(() => Surface.create(2.5, 5)).toThrow(RangeError);
  });
});

describe("Surface cell access", () => {
  it("round-trips in-bounds cells", () => {
    const surface = Surface.create(2, 2);

    surface.set(1, 1, { char: "x" });

    expect(surface.get(1, 1).char).toBe("x");
  });

  it("throws for out-of-bounds reads and clips out-of-bounds writes", () => {
    const surface = Surface.create(2, 2);

    expect(() => surface.get(2, 0)).toThrow(RangeError);
    surface.set(9, 9, { char: "z" });

    expect(rasterizeToText(surface)).toEqual(["  ", "  "]);
    expect(surface.tryGet(1, 1)).toEqual(BLANK);
    expect(surface.tryGet(9, 9)).toBeUndefined();
  });

  it("rejects out-of-bounds row snapshots", () => {
    const surface = Surface.create(2, 2);

    expect(() => surface.row(2)).toThrow(RangeError);
  });
});

describe("Surface drawing", () => {
  it("draws text left-to-right and clips at the right edge", () => {
    const surface = Surface.create(3, 1);

    surface.drawText(1, 0, "abc");

    expect(rasterizeToText(surface)).toEqual([" ab"]);
  });

  it("draws every configured border style", () => {
    for (const border of Object.values(BORDERS)) {
      const surface = Surface.create(3, 3);

      surface.drawBox({ x: 0, y: 0, width: 3, height: 3 }, border);

      const [top, middle, bottom] = rasterizeToText(surface);
      expect(top).toBe(`${border.tl}${border.top}${border.tr}`);
      expect(middle).toBe(`${border.left} ${border.right}`);
      expect(bottom).toBe(`${border.bl}${border.bottom}${border.br}`);
    }
  });

  it("clips degenerate and off-screen rectangles without throwing", () => {
    const surface = Surface.create(2, 2);

    surface.drawBox({ x: 0, y: 0, width: 0, height: 2 }, BORDERS.single);
    surface.fillRect({ x: -1, y: -1, width: 2, height: 2 }, { char: "#" });

    expect(rasterizeToText(surface)).toEqual(["# ", "  "]);
  });

  it("fills and clears the whole buffer", () => {
    const surface = Surface.create(2, 1);

    surface.fill({ char: "x" });
    expect(rasterizeToText(surface)).toEqual(["xx"]);

    surface.clear();
    expect(rasterizeToText(surface)).toEqual(["  "]);
  });
});

describe("Surface compositing", () => {
  it("applies opaque overwrite, transparent skip, and per-channel inherit", () => {
    const destination = Surface.create(3, 1, {
      char: ".",
      fg: "default",
      bg: rgb(0, 0, 255),
      bold: false,
    });
    const source = Surface.transparent(3, 1);
    source.set(1, 0, { char: "@", fg: rgb(255, 0, 0) });

    destination.blit(source, 0, 0);

    expect(destination.get(0, 0).char).toBe(".");
    const middle = destination.get(1, 0);
    expect(middle.char).toBe("@");
    expect(middle.fg).toEqual(rgb(255, 0, 0));
    expect(middle.bg).toEqual(rgb(0, 0, 255));
    expect(middle.bold).toBe(false);
  });

  it("clips negative and overflowing blits without throwing", () => {
    const destination = Surface.create(2, 2, BLANK);
    const source = Surface.create(2, 2, {
      char: "#",
      fg: "default",
      bg: "default",
      bold: false,
    });

    destination.blit(source, -1, -1);

    expect(destination.get(0, 0).char).toBe("#");
    expect(destination.get(1, 1).char).toBe(" ");
    expect(() => destination.blit(source, 100, 100)).not.toThrow();
  });

  it("clones independently and compares structurally", () => {
    const original = Surface.create(2, 2);
    const clone = original.clone();

    expect(original.equals(clone)).toBe(true);
    clone.set(0, 0, { char: "!" });

    expect(original.equals(clone)).toBe(false);
    expect(original.get(0, 0).char).toBe(" ");
  });

  it("compares dimensions and optional bold state structurally", () => {
    const left = Surface.create(1, 1, { char: "x" });
    const right = Surface.create(2, 1, { char: "x" });
    const bold = Surface.create(1, 1, { char: "x", bold: true });
    const explicitPlain = Surface.create(1, 1, { char: "x", bold: false });

    expect(left.equals(right)).toBe(false);
    expect(left.equals(bold)).toBe(false);
    expect(bold.equals(left)).toBe(false);
    expect(left.equals(explicitPlain)).toBe(true);
    expect(explicitPlain.equals(left)).toBe(true);
  });
});
