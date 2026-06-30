import { describe, expect, it } from "vitest";
import {
  err,
  nextLevel,
  ok,
  parseLevel,
  parseLocaleId,
  parsePlayerName,
  parseSkillId,
  saveKeyForPlayer,
} from "./ids.js";

describe("Result constructors", () => {
  it("ok and err wrap values and errors", () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
    expect(err("nope")).toEqual({ ok: false, error: "nope" });
  });
});

describe("parsePlayerName", () => {
  it("accepts 1–24 code points, trimming surrounding whitespace", () => {
    const r = parsePlayerName("  Ada  ");
    expect(r).toEqual({ ok: true, value: "Ada" });
  });

  it("counts code points, not UTF-16 units", () => {
    expect(parsePlayerName("😀").ok).toBe(true); // 1 code point, 2 UTF-16 units
  });

  it("rejects empty/whitespace-only and over-long names", () => {
    expect(parsePlayerName("   ")).toEqual({
      ok: false,
      error: { kind: "playerName", len: 0 },
    });
    expect(parsePlayerName("a".repeat(25)).ok).toBe(false);
  });
});

describe("parseLevel", () => {
  it("accepts non-negative integers", () => {
    expect(parseLevel(0).ok).toBe(true);
    expect(parseLevel(7).ok).toBe(true);
  });

  it("rejects negatives and non-integers", () => {
    expect(parseLevel(-1)).toEqual({
      ok: false,
      error: { kind: "level", value: -1 },
    });
    expect(parseLevel(2.5).ok).toBe(false);
  });
});

describe("parseSkillId", () => {
  it("accepts slug-like ids", () => {
    expect(parseSkillId("math.add").ok).toBe(true);
  });

  it("rejects ids with an illegal leading char or spaces", () => {
    expect(parseSkillId(".bad").ok).toBe(false);
    expect(parseSkillId("has space")).toEqual({
      ok: false,
      error: { kind: "skillId", value: "has space" },
    });
  });
});

describe("parseLocaleId", () => {
  it("accepts BCP-47-ish tags", () => {
    expect(parseLocaleId("en").ok).toBe(true);
    expect(parseLocaleId("es-MX").ok).toBe(true);
  });

  it("rejects malformed tags", () => {
    expect(parseLocaleId("english").ok).toBe(false);
    expect(parseLocaleId("e")).toEqual({
      ok: false,
      error: { kind: "localeId", value: "e" },
    });
  });
});

describe("derived ids", () => {
  it("nextLevel increments and saveKeyForPlayer namespaces", () => {
    const lvl = parseLevel(3);
    if (!lvl.ok) throw new Error("unreachable");
    expect(nextLevel(lvl.value)).toBe(4);

    const name = parsePlayerName("Ada");
    if (!name.ok) throw new Error("unreachable");
    expect(saveKeyForPlayer(name.value)).toBe("player:Ada");
  });
});
