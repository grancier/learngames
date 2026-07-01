import {
  BORDERS,
  Surface,
  colorEq,
  rasterizeToText,
  rgb,
} from "@learn-engine/core";
import { describe, expect, it } from "vitest";
import { drawBox } from "./box.js";

const BORDER = rgb(80, 200, 210);
const BG = rgb(20, 22, 30);

const fresh = (w: number, h: number): Surface =>
  Surface.create(w, h, { char: " ", fg: BG, bg: BG, bold: false });

describe("drawBox", () => {
  it("draws a filled bold frame by default", () => {
    const s = fresh(10, 5);
    drawBox(
      s,
      { x: 0, y: 0, width: 10, height: 5 },
      {
        border: BORDER,
        background: BG,
      },
    );

    expect(s.get(0, 0).char).toBe("┏");
    expect(s.get(9, 0).char).toBe("┓");
    expect(s.get(0, 4).char).toBe("┗");
    expect(s.get(9, 4).char).toBe("┛");
    const mid = s.get(5, 2);
    expect(mid.char).toBe(" ");
    expect(colorEq(mid.bg, BG)).toBe(true);
  });

  it("draws a nested border and a title, honoring glyphs/bold/titleColor", () => {
    const s = fresh(14, 6);
    const title = rgb(250, 220, 90);
    drawBox(
      s,
      { x: 0, y: 0, width: 14, height: 6 },
      {
        border: BORDER,
        background: BG,
        glyphs: BORDERS.double,
        nested: true,
        title: "HP",
        titleColor: title,
        bold: true,
      },
    );

    expect(s.get(0, 0).char).toBe("╔"); // outer (double)
    expect(s.get(1, 1).char).toBe("╔"); // inner (nested)
    expect(rasterizeToText(s).join("\n")).toContain(" HP ");
    const h = s.get(3, 0); // 'H' of " HP "
    expect(h.char).toBe("H");
    expect(colorEq(h.fg, title)).toBe(true);
  });

  it("skips the inner border when the box is too small to inset", () => {
    const s = fresh(2, 2);
    drawBox(
      s,
      { x: 0, y: 0, width: 2, height: 2 },
      {
        border: BORDER,
        background: BG,
        nested: true,
      },
    );
    expect(s.get(0, 0).char).toBe("┏"); // outer drawn; no inner
  });

  it("skips an empty title", () => {
    const s = fresh(10, 5);
    drawBox(
      s,
      { x: 0, y: 0, width: 10, height: 5 },
      {
        border: BORDER,
        background: BG,
        title: "",
      },
    );
    expect(s.get(2, 0).char).toBe("━"); // plain top edge, no title text
  });

  it("defaults the title color to the border color", () => {
    const s = fresh(12, 5);
    drawBox(
      s,
      { x: 0, y: 0, width: 12, height: 5 },
      {
        border: BORDER,
        background: BG,
        title: "OK",
      },
    );
    const o = s.get(3, 0); // 'O' of " OK "
    expect(o.char).toBe("O");
    expect(colorEq(o.fg, BORDER)).toBe(true);
  });
});
