import { describe, expect, it } from "vitest";
import { EMPTY_INPUT, type Key, hasActivity } from "./input.js";

describe("hasActivity", () => {
  it("is false for an inert frame", () => {
    expect(hasActivity(EMPTY_INPUT)).toBe(false);
  });

  it("is true when an edge is present", () => {
    expect(
      hasActivity({
        edges: [{ kind: "dir", dir: "up" }],
        held: new Set<Key>(),
        text: [],
      }),
    ).toBe(true);
  });

  it("is true when text entry is present", () => {
    expect(
      hasActivity({
        edges: [],
        held: new Set<Key>(),
        text: [{ kind: "submit" }],
      }),
    ).toBe(true);
  });

  it("is true when a key is held", () => {
    expect(
      hasActivity({ edges: [], held: new Set<Key>(["left"]), text: [] }),
    ).toBe(true);
  });
});
