import { rasterizeToText, rgb } from "@learn-engine/core";
import type { InputFrame, Key } from "@learn-engine/runtime";
import { describe, expect, test } from "vitest";
import {
  createAdditionLesson,
  createAdditionProblem,
  formatAdditionPrompt,
  type renderOutcomeBanner,
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

function occupied(surface: ReturnType<typeof renderOutcomeBanner>) {
  const points: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (surface.get(x, y).char !== " ") points.push({ x, y });
    }
  }
  const ys = points.map((p) => p.y);
  return {
    cells: points.map(({ x, y }) => surface.get(x, y)),
    height: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

describe("addition example game", () => {
  test("uses the Rust example's 6+6 addition problem", () => {
    const problem = createAdditionProblem();

    expect(problem).toEqual({ a: 6, b: 6, answer: 12 });
    expect(formatAdditionPrompt(problem)).toBe("What is 6+6?");
  });

  test("submitting the correct answer wins with a bold green YOU WIN!!! banner", () => {
    const lesson = createAdditionLesson({ columns: 80, rows: 20 });
    let state = lesson.init();
    state = lesson.step(state, insert("12"), { tick: 1 }).state;

    const frame = lesson.step(state, submit, { tick: 2 });
    const banner = occupied(frame.surface);
    const glyphs = new Set(banner.cells.map((cell) => cell.char));

    expect(frame.verdict).toBe("win");
    expect(lesson.score(frame.state)).toBe(10);
    expect(lesson.attempts(frame.state)).toBe(1);
    expect(banner.height).toBe(17);
    expect([...glyphs].sort()).toEqual(["!", "I", "N", "O", "U", "W", "Y"]);
    for (const cell of banner.cells) {
      expect(cell.bold).toBe(true);
      expect(cell.fg).toEqual(rgb(80, 220, 60));
    }
  });

  test("submitting an incorrect answer loses with a bold red X filling 85 percent of the console height", () => {
    const lesson = createAdditionLesson({ columns: 80, rows: 20 });
    let state = lesson.init();
    state = lesson.step(state, insert("13"), { tick: 1 }).state;

    const frame = lesson.step(state, submit, { tick: 2 });
    const banner = occupied(frame.surface);

    expect(frame.verdict).toBe("lose");
    expect(lesson.score(frame.state)).toBe(0);
    expect(lesson.attempts(frame.state)).toBe(1);
    expect(banner.height).toBe(17);
    for (const cell of banner.cells) {
      expect(cell.char).toBe("X");
      expect(cell.bold).toBe(true);
      expect(cell.fg).toEqual(rgb(230, 40, 40));
    }
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
