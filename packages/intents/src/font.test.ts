import { describe, expect, it } from "vitest";
import { FONT, GLYPH_HEIGHT, GLYPH_WIDTH, glyphFor } from "./font.js";

describe("font", () => {
  it("every glyph is exactly GLYPH_WIDTH x GLYPH_HEIGHT", () => {
    for (const [char, rows] of Object.entries(FONT)) {
      expect(rows, char).toHaveLength(GLYPH_HEIGHT);
      for (const row of rows) expect(row.length, char).toBe(GLYPH_WIDTH);
    }
  });

  it("looks up glyphs case-insensitively", () => {
    expect(glyphFor("a")).toBe(glyphFor("A"));
    expect(glyphFor("A")[0]).toBe(" ### ");
  });

  it("falls back to a blank glyph for unknown characters", () => {
    const blank = glyphFor("☃"); // snowman — not in the font
    expect(blank).toHaveLength(GLYPH_HEIGHT);
    expect(blank.every((row) => row.trim() === "")).toBe(true);
  });
});
