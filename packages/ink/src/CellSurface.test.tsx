import { Surface } from "@learn-engine/core";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { CellSurface } from "./CellSurface.js";
import { CellSurface as PublicCellSurface } from "./index.js";

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const stripAnsi = (value: string): string => value.replace(ansiPattern, "");

describe("CellSurface", () => {
  it("renders the surface text grid as terminal rows", () => {
    const surface = Surface.create(3, 2, {
      char: ".",
      fg: "default",
      bg: "default",
      bold: false,
    });
    surface.drawText(0, 0, "abc");

    const { lastFrame } = render(<CellSurface surface={surface} />);

    expect(stripAnsi(lastFrame() ?? "").split("\n")).toEqual(["abc", "..."]);
  });

  it("exports the component from the package barrel", () => {
    expect(PublicCellSurface).toBe(CellSurface);
  });

  it("rerenders when handed a new surface", () => {
    const surface = Surface.create(1, 1);
    surface.drawText(0, 0, "x");
    const next = Surface.create(1, 1);
    next.drawText(0, 0, "y");

    const { lastFrame, rerender } = render(<CellSurface surface={surface} />);
    rerender(<CellSurface surface={next} />);

    expect(lastFrame()).toBe("y");
  });

  it("renders styled segments through Ink without leaking style text", () => {
    const surface = Surface.create(1, 1);
    surface.drawText(0, 0, "z", {
      fg: { r: 255, g: 0, b: 0 },
      bg: { r: 0, g: 0, b: 255 },
      bold: true,
    });

    const { lastFrame } = render(<CellSurface surface={surface} />);

    expect(lastFrame()).toBe("z");
  });
});
