import { Surface, rasterizeToText, rgb } from "@learn-engine/core";
import { describe, expect, it } from "vitest";
import { type InputFieldStyle, drawInputField } from "./input-field.js";

const BG = rgb(20, 22, 30);
const style: InputFieldStyle = {
  border: rgb(80, 200, 210),
  background: BG,
  label: rgb(230, 240, 255),
  value: rgb(90, 205, 85),
  cursor: rgb(255, 255, 255),
};

const fresh = (w: number, h: number): Surface =>
  Surface.create(w, h, { char: " ", fg: BG, bg: BG, bold: false });

describe("drawInputField", () => {
  it("frames a nested field with label, value, and a lit cursor", () => {
    const s = fresh(30, 5);
    drawInputField(
      s,
      { x: 0, y: 0, width: 30, height: 5 },
      { label: "Add:", value: "12", tick: 0 },
      { ...style, nested: true, bold: true },
    );

    expect(s.get(0, 0).char).toBe("┏"); // box frame
    const text = rasterizeToText(s).join("\n");
    expect(text).toContain("Add:");
    expect(text).toContain("12");
    // nested pad 2: cx=3, valueX=3+4+2=9, cursor at 9+2=11, cy=2
    expect(s.get(11, 2).char).toBe("█");
  });

  it("hides the cursor when the blink is off (non-nested, custom blink)", () => {
    const s = fresh(30, 5);
    drawInputField(
      s,
      { x: 0, y: 0, width: 30, height: 5 },
      { label: "Q", value: "5", tick: 10 },
      { ...style, blinkTicks: 10 },
    );

    // no nesting → pad 1: cx=2, valueX=2+1+2=5, cursor cell 6, cy=2; blink off
    expect(s.get(6, 2).char).toBe(" ");
    expect(rasterizeToText(s).join("\n")).toContain("Q");
  });
});
