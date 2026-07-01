import {
  type ColorValue,
  type Surface,
  colorEq,
  rgb,
} from "@learn-engine/core";
import { describe, expect, it } from "vitest";
import { renderBanner } from "./banner.js";

const GREEN = rgb(90, 205, 85);
const RED = rgb(230, 60, 55);
const BG = rgb(43, 47, 58);
const BLACK = rgb(0, 0, 0);
const YELLOW = rgb(250, 204, 60);

interface Scan {
  readonly chars: Set<string>;
  readonly colors: ColorValue[];
  readonly fillRows: number[];
}

function scan(surface: Surface, fillColor: ColorValue): Scan {
  const chars = new Set<string>();
  const colors: ColorValue[] = [];
  const fillRows: number[] = [];
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const cell = surface.get(x, y);
      if (cell.char !== null) chars.add(cell.char);
      const isFill =
        (cell.fg !== undefined && colorEq(cell.fg, fillColor)) ||
        (cell.bg !== undefined && colorEq(cell.bg, fillColor));
      if (cell.fg !== undefined) colors.push(cell.fg);
      if (cell.bg !== undefined) colors.push(cell.bg);
      if (isFill) fillRows.push(y);
    }
  }
  return { chars, colors, fillRows };
}

const hasColor = (colors: readonly ColorValue[], c: ColorValue): boolean =>
  colors.some((v) => colorEq(v, c));

describe("renderBanner", () => {
  it("renders the win banner as solid half-block cells, not text", () => {
    const banner = renderBanner(80, 20, "YOU\nWIN!!!", {
      fill: GREEN,
      background: BG,
      outline: BLACK,
      shadow: YELLOW,
    });
    const s = scan(banner, GREEN);

    expect(s.chars.has("▀")).toBe(true);
    for (const ch of ["Y", "O", "U", "W", "I", "N", "!"]) {
      expect(s.chars.has(ch)).toBe(false);
    }
    expect(hasColor(s.colors, GREEN)).toBe(true); // fill
    expect(hasColor(s.colors, BLACK)).toBe(true); // outline
    expect(hasColor(s.colors, YELLOW)).toBe(true); // shadow
  });

  it("fills most of the surface height with the fill color", () => {
    const banner = renderBanner(80, 20, "YOU\nWIN!!!", {
      fill: GREEN,
      background: BG,
      outline: BLACK,
      shadow: YELLOW,
    });
    const { fillRows } = scan(banner, GREEN);
    const height = Math.max(...fillRows) - Math.min(...fillRows) + 1;

    expect(height).toBeGreaterThanOrEqual(15); // ~85% of 20 rows
    expect(height).toBeLessThanOrEqual(20);
  });

  it("omits outline and shadow layers when not provided", () => {
    const banner = renderBanner(40, 10, "A", { fill: GREEN, background: BG });
    const { chars, colors } = scan(banner, GREEN);

    expect(chars.has("▀")).toBe(true);
    for (const color of colors) {
      expect(colorEq(color, GREEN) || colorEq(color, BG)).toBe(true);
    }
  });

  it("honors an explicit shadow offset", () => {
    const banner = renderBanner(40, 12, "A", {
      fill: GREEN,
      background: BG,
      shadow: YELLOW,
      shadowOffset: 3,
    });
    expect(hasColor(scan(banner, GREEN).colors, YELLOW)).toBe(true);
  });

  it("draws only background for empty text", () => {
    const banner = renderBanner(20, 6, "", {
      fill: GREEN,
      background: BG,
      outline: BLACK,
      shadow: YELLOW,
    });
    expect([...scan(banner, GREEN).chars]).toEqual([" "]);
  });

  it("renders unknown characters as blank", () => {
    const banner = renderBanner(30, 8, "@", { fill: GREEN, background: BG });
    expect(scan(banner, GREEN).chars.has("▀")).toBe(false);
  });

  it("clips outline and shadow at the surface edges (full-bleed)", () => {
    const banner = renderBanner(6, 4, "X", {
      fill: RED,
      background: BG,
      outline: BLACK,
      shadow: YELLOW,
      heightFraction: 1,
    });
    const s = scan(banner, RED);

    expect(s.chars.has("▀")).toBe(true);
    expect(hasColor(s.colors, RED)).toBe(true);
  });
});
