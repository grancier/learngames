import { describe, expect, it } from "vitest";
import type { Level } from "./ids.js";
import {
  accuracy,
  accuracyWindowPolicy,
  emptyMastery,
  recordOutcome,
  streakPolicy,
} from "./progression.js";

const L = 0 as Level;

describe("recordOutcome", () => {
  it("folds a correct outcome: attempts/correct/streak up, lastSeen stamped", () => {
    expect(recordOutcome(emptyMastery, "correct", 1000)).toEqual({
      attempts: 1,
      correct: 1,
      streak: 1,
      bestStreak: 1,
      lastSeen: 1000,
    });
  });

  it("resets streak on incorrect but preserves bestStreak and correct count", () => {
    let m = emptyMastery;
    m = recordOutcome(m, "correct", 1);
    m = recordOutcome(m, "correct", 2); // streak 2, best 2
    m = recordOutcome(m, "incorrect", 3);
    expect(m).toEqual({
      attempts: 3,
      correct: 2,
      streak: 0,
      bestStreak: 2,
      lastSeen: 3,
    });
  });
});

describe("accuracy", () => {
  it("is 0 with no attempts and correct/attempts otherwise", () => {
    expect(accuracy(emptyMastery)).toBe(0);
    expect(
      accuracy({
        attempts: 4,
        correct: 3,
        streak: 0,
        bestStreak: 1,
        lastSeen: null,
      }),
    ).toBe(0.75);
  });
});

describe("streakPolicy", () => {
  it("advances at the required streak and holds below it", () => {
    const p = streakPolicy(3);
    expect(p.evaluate(L, { ...emptyMastery, streak: 2 })).toBe("hold");
    expect(p.evaluate(L, { ...emptyMastery, streak: 3 })).toBe("advance");
  });
});

describe("accuracyWindowPolicy", () => {
  const p = accuracyWindowPolicy(4, 0.8);

  it("holds until both minAttempts and minAccuracy are met", () => {
    // too few attempts
    expect(
      p.evaluate(L, {
        attempts: 3,
        correct: 3,
        streak: 3,
        bestStreak: 3,
        lastSeen: null,
      }),
    ).toBe("hold");
    // enough attempts, accuracy 0.6 < 0.8
    expect(
      p.evaluate(L, {
        attempts: 5,
        correct: 3,
        streak: 0,
        bestStreak: 2,
        lastSeen: null,
      }),
    ).toBe("hold");
    // both thresholds met
    expect(
      p.evaluate(L, {
        attempts: 5,
        correct: 5,
        streak: 5,
        bestStreak: 5,
        lastSeen: null,
      }),
    ).toBe("advance");
  });
});
