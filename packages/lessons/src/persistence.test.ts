import { describe, expect, it } from "vitest";
import type { Level, PlayerName, Result, SaveKey, SkillId } from "./ids.js";
import {
  InMemoryProgressStore,
  type Progress,
  type StoreError,
  decodeSave,
  encodeSave,
} from "./persistence.js";
import type { Mastery } from "./progression.js";

const SKILL = "math.add" as SkillId;
const validMastery: Mastery = {
  attempts: 4,
  correct: 3,
  streak: 2,
  bestStreak: 2,
  lastSeen: 1,
};

const progress: Progress = {
  player: "Ada" as PlayerName,
  levels: new Map([[SKILL, 2 as Level]]),
  mastery: new Map([[SKILL, validMastery]]),
  highScore: 7,
  updatedAt: 100,
};

const rawSave = (over: Record<string, unknown> = {}): unknown => ({
  version: 1,
  player: "Ada",
  highScore: 7,
  updatedAt: 100,
  levels: [["math.add", 2]],
  mastery: [["math.add", validMastery]],
  ...over,
});

const errKind = <T>(r: Result<T, StoreError>): string | null =>
  r.ok ? null : r.error.kind;

describe("save codec", () => {
  it("round-trips a Progress losslessly through JSON (AC-15)", () => {
    const decoded = decodeSave(
      JSON.parse(JSON.stringify(encodeSave(progress))),
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.player).toBe("Ada");
    expect([...decoded.value.levels]).toEqual([["math.add", 2]]);
    expect(decoded.value.mastery.get(SKILL)).toEqual(validMastery);
    expect(decoded.value.highScore).toBe(7);
    expect(decoded.value.updatedAt).toBe(100);
  });

  it("reports unsupported for a higher version, decode for malformed input (AC-16)", () => {
    const unsup = decodeSave({ version: 2 });
    expect(errKind(unsup)).toBe("unsupported");
    if (!unsup.ok && unsup.error.kind === "unsupported") {
      expect(unsup.error.found).toBe(2);
    }
    expect(errKind(decodeSave({}))).toBe("decode");
    expect(errKind(decodeSave(null))).toBe("decode");
    expect(errKind(decodeSave({ version: 1 }))).toBe("decode"); // v1 but missing fields
  });

  it("re-parses branded fields and rejects invalid ones (hardening)", () => {
    expect(errKind(decodeSave(rawSave({ player: "" })))).toBe("decode");
    expect(errKind(decodeSave(rawSave({ levels: [["bad id", 1]] })))).toBe(
      "decode",
    );
    expect(errKind(decodeSave(rawSave({ levels: [["math.add", -1]] })))).toBe(
      "decode",
    );
    expect(
      errKind(decodeSave(rawSave({ mastery: [["bad id", validMastery]] }))),
    ).toBe("decode");
  });

  it("rejects mastery violating correct<=attempts and negative counts (hardening)", () => {
    expect(
      errKind(
        decodeSave(
          rawSave({
            mastery: [["math.add", { ...validMastery, correct: 99 }]],
          }),
        ),
      ),
    ).toBe("decode"); // cross-field: correct > attempts
    expect(
      errKind(
        decodeSave(
          rawSave({
            mastery: [
              ["math.add", { ...validMastery, attempts: -1, correct: 0 }],
            ],
          }),
        ),
      ),
    ).toBe("decode"); // zod nonnegative
  });
});

describe("InMemoryProgressStore (AC-17)", () => {
  it("returns ok(null) for an absent key", async () => {
    const store = new InMemoryProgressStore();
    expect(await store.load("player:none" as SaveKey)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("round-trips save → load, lists, and deletes", async () => {
    const store = new InMemoryProgressStore();
    const key = "player:Ada" as SaveKey;

    expect((await store.save(key, progress)).ok).toBe(true);

    const loaded = await store.load(key);
    expect(loaded.ok).toBe(true);
    if (loaded.ok && loaded.value) {
      expect(loaded.value.player).toBe("Ada");
      expect(loaded.value.mastery.get(SKILL)?.correct).toBe(3);
    }

    const list = await store.list();
    expect(list.ok && list.value).toEqual([key]);

    expect((await store.delete(key)).ok).toBe(true);
    expect(await store.load(key)).toEqual({ ok: true, value: null });
  });
});
