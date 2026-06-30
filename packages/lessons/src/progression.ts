import type { Outcome } from "./grading.js";
import type { Level } from "./ids.js";

export interface Mastery {
  readonly attempts: number;
  readonly correct: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly lastSeen: number | null; // epoch ms; reserved for spaced repetition (forward-compatible)
}

export const emptyMastery: Mastery = {
  attempts: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  lastSeen: null,
};

/** Pure: fold one outcome into a mastery record. */
export function recordOutcome(
  m: Mastery,
  outcome: Outcome,
  now: number,
): Mastery {
  const streak = outcome === "correct" ? m.streak + 1 : 0;
  return {
    attempts: m.attempts + 1,
    correct: m.correct + (outcome === "correct" ? 1 : 0),
    streak,
    bestStreak: Math.max(m.bestStreak, streak),
    lastSeen: now,
  };
}

export const accuracy = (m: Mastery): number =>
  m.attempts === 0 ? 0 : m.correct / m.attempts;

export type LevelOutcome = "hold" | "advance";

/** Strategy: turns mastery into a level decision. Swappable per curriculum. */
export interface ProgressionPolicy {
  evaluate(level: Level, mastery: Mastery): LevelOutcome;
}

/** Advance once a clean streak is reached. */
export function streakPolicy(required: number): ProgressionPolicy {
  return {
    evaluate: (_level, m) => (m.streak >= required ? "advance" : "hold"),
  };
}

/** Advance once enough attempts AND accuracy threshold are met. */
export function accuracyWindowPolicy(
  minAttempts: number,
  minAccuracy: number,
): ProgressionPolicy {
  return {
    evaluate: (_level, m) =>
      m.attempts >= minAttempts && accuracy(m) >= minAccuracy
        ? "advance"
        : "hold",
  };
}
