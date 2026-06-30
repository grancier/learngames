import {
  type Outcome as GradeOutcome,
  type Progress,
  type SkillId,
  emptyMastery,
  recordOutcome,
} from "@learn-engine/lessons";
import type { Outcome, TerminalEvent } from "./outcome.js";

/**
 * Mapping policy (documented decision): win → "correct"; lose / timeout → "incorrect";
 * abandon / terminate → no mastery change (a kid leaving or a crash is not a pedagogical signal).
 */
function masterySignal(o: Outcome): GradeOutcome | null {
  switch (o) {
    case "win":
      return "correct";
    case "lose":
    case "timeout":
      return "incorrect";
    case "abandon":
    case "terminate":
      return null;
  }
}

/**
 * Fold a terminal lesson result into a player's durable `Progress` for the skill it exercised.
 * Pure. Cross-lesson curriculum unlocking (which lesson next) is the host's job, fed by this.
 */
export function recordLessonResult(
  progress: Progress,
  skill: SkillId,
  event: TerminalEvent,
  now: number,
): Progress {
  const signal = masterySignal(event.outcome);
  const mastery = new Map(progress.mastery);
  if (signal) {
    const prev = mastery.get(skill) ?? emptyMastery;
    mastery.set(skill, recordOutcome(prev, signal, now));
  }
  return {
    ...progress,
    mastery,
    highScore: Math.max(progress.highScore, event.score),
    updatedAt: now,
  };
}
