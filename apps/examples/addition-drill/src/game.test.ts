import {
  type Cell,
  type ColorValue,
  type Surface,
  colorEq,
  rasterizeToText,
  rgb,
} from "@learn-engine/core";
import type { InputFrame, Key } from "@learn-engine/runtime";
import { describe, expect, test } from "vitest";
import {
  createAdditionLesson,
  createAdditionProblem,
  formatAdditionPrompt,
} from "./game.js";

const insert = (text: string): InputFrame => ({
  edges: [],
  held: new Set<Key>(),
  text: [{ kind: "insert" as const, text }],
});

const submit: InputFrame = {
  edges: [],
  held: new Set<Key>(),
  text: [{ kind: "submit" as const }],
};

const emptyInput = (): InputFrame => ({
  edges: [],
  held: new Set<Key>(),
  text: [],
});

/** Cells the banner actually painted (half-blocks over the blank background). */
function occupied(surface: Surface): { cells: Cell[]; height: number } {
  const cells: Cell[] = [];
  const ys: number[] = [];
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const cell = surface.get(x, y);
      if (cell.char !== " ") {
        cells.push(cell);
        ys.push(y);
      }
    }
  }
  return { cells, height: Math.max(...ys) - Math.min(...ys) + 1 };
}

const has = (cells: readonly Cell[], color: ColorValue): boolean =>
  cells.some((c) => colorEq(c.fg, color) || colorEq(c.bg, color));

describe("addition example game", () => {
  test("uses the Rust example's 6+6 addition problem", () => {
    const problem = createAdditionProblem();

    expect(problem).toEqual({ a: 6, b: 6, answer: 12 });
    expect(formatAdditionPrompt(problem)).toBe("What is 6+6?");
  });

  test("a correct answer wins with a solid green YOU WIN!!! block banner", () => {
    const lesson = createAdditionLesson({ columns: 80, rows: 20 });
    let state = lesson.init();
    state = lesson.step(state, insert("12"), { tick: 1 }).state;

    const frame = lesson.step(state, submit, { tick: 2 });
    const banner = occupied(frame.surface);

    expect(frame.verdict).toBe("win");
    expect(lesson.score(frame.state)).toBe(10);
    expect(lesson.attempts(frame.state)).toBe(1);

    // Solid half-block glyphs — NOT letter text (the bug this replaced).
    expect([...new Set(banner.cells.map((c) => c.char))]).toEqual(["▀"]);
    for (const cell of banner.cells) expect(cell.bold).toBe(true);

    // Green fill + black outline + gold drop-shadow, filling most of the height.
    expect(has(banner.cells, rgb(90, 205, 85))).toBe(true);
    expect(has(banner.cells, rgb(0, 0, 0))).toBe(true);
    expect(has(banner.cells, rgb(250, 204, 60))).toBe(true);
    expect(banner.height).toBeGreaterThanOrEqual(15);

    // A further submit after winning is a no-op that stays won.
    expect(lesson.step(frame.state, submit, { tick: 3 }).verdict).toBe("win");
  });

  test("a wrong answer loses with a solid red X block banner and no shadow", () => {
    const lesson = createAdditionLesson({ columns: 80, rows: 20 });
    let state = lesson.init();
    state = lesson.step(state, insert("13"), { tick: 1 }).state;

    const frame = lesson.step(state, submit, { tick: 2 });
    const banner = occupied(frame.surface);

    expect(frame.verdict).toBe("lose");
    expect(lesson.score(frame.state)).toBe(0);
    expect(lesson.attempts(frame.state)).toBe(1);

    expect([...new Set(banner.cells.map((c) => c.char))]).toEqual(["▀"]);
    expect(has(banner.cells, rgb(230, 60, 55))).toBe(true); // red fill
    expect(has(banner.cells, rgb(0, 0, 0))).toBe(true); // outline
    expect(has(banner.cells, rgb(250, 204, 60))).toBe(false); // no shadow
    expect(banner.height).toBeGreaterThanOrEqual(15);
  });

  test("the opening frame shows editable prompt state before submission", () => {
    const lesson = createAdditionLesson({ columns: 40, rows: 10 });
    let state = lesson.init();
    state = lesson.step(state, insert("128"), { tick: 1 }).state;
    state = lesson.step(
      state,
      { edges: [], held: new Set<Key>(), text: [{ kind: "backspace" }] },
      { tick: 2 },
    ).state;

    const frame = lesson.step(state, emptyInput(), { tick: 3 });

    expect(rasterizeToText(frame.surface).join("\n")).toContain(
      "What is 6+6?  12",
    );
  });
});
