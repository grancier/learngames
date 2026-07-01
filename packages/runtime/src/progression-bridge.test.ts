import {
  type PlayerName,
  type Progress,
  type SkillId,
  emptyMastery,
  recordOutcome,
} from "@learn-engine/lessons";
import { describe, expect, it } from "vitest";
import type { LessonId } from "./lesson.js";
import type { Outcome, TerminalEvent } from "./outcome.js";
import { recordLessonResult } from "./progression-bridge.js";

const SKILL = "math.add" as SkillId;

const baseProgress = (over: Partial<Progress> = {}): Progress => ({
  player: "Ada" as PlayerName,
  levels: new Map(),
  mastery: new Map(),
  highScore: 0,
  updatedAt: 0,
  ...over,
});

const ev = (outcome: Outcome, score = 0): TerminalEvent => ({
  lessonId: "math.add" as LessonId,
  outcome,
  durationTicks: 1,
  attempts: 1,
  score,
  schemaVersion: 1,
});

describe("recordLessonResult", () => {
  it("folds a win into mastery as 'correct' and tracks the high score", () => {
    const p = recordLessonResult(baseProgress(), SKILL, ev("win", 10), 5);
    expect(p.mastery.get(SKILL)?.correct).toBe(1);
    expect(p.mastery.get(SKILL)?.attempts).toBe(1);
    expect(p.highScore).toBe(10);
    expect(p.updatedAt).toBe(5);
  });

  it("folds lose and timeout as 'incorrect'", () => {
    const lose = recordLessonResult(baseProgress(), SKILL, ev("lose"), 1);
    expect(lose.mastery.get(SKILL)?.correct).toBe(0);
    expect(lose.mastery.get(SKILL)?.attempts).toBe(1);
    const timeout = recordLessonResult(baseProgress(), SKILL, ev("timeout"), 1);
    expect(timeout.mastery.get(SKILL)?.attempts).toBe(1);
  });

  it("leaves mastery untouched for abandon and terminate", () => {
    expect(
      recordLessonResult(baseProgress(), SKILL, ev("abandon"), 1).mastery.size,
    ).toBe(0);
    expect(
      recordLessonResult(baseProgress(), SKILL, ev("terminate"), 1).mastery
        .size,
    ).toBe(0);
  });

  it("accumulates onto existing mastery and keeps the better high score", () => {
    const seeded = baseProgress({
      mastery: new Map([[SKILL, recordOutcome(emptyMastery, "correct", 1)]]),
      highScore: 50,
    });
    const p = recordLessonResult(seeded, SKILL, ev("win", 10), 9);
    expect(p.mastery.get(SKILL)?.correct).toBe(2);
    expect(p.highScore).toBe(50);
  });
});
