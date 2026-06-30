import type { Level, Rng } from "@learn-engine/lessons";
import { describe, expect, test } from "vitest";
import { ADD, AdditionSource } from "./source.js";

describe("addition challenge source", () => {
  test("generates level-scaled integer addition challenges", () => {
    const calls: Array<readonly [number, number]> = [];
    const values = [4, 9];
    const rng: Rng = {
      float: () => 0,
      int: (min, max) => {
        calls.push([min, max]);
        return values.shift() ?? 0;
      },
      pick: (items) => items[0] as never,
    };
    const source = new AdditionSource();

    const challenge = source.generate(2 as Level, rng);

    expect(source.skill).toBe(ADD);
    expect(challenge).toEqual({
      skill: ADD,
      level: 2,
      prompt: { key: "math.add.prompt", params: { a: 4, b: 9 }, big: true },
      answer: { kind: "integer", value: 13 },
    });
    expect(calls).toEqual([
      [0, 15],
      [0, 15],
    ]);
  });
});
