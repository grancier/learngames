import type { LessonId, LessonVerdict } from "./lesson.js";

/** The outcomes the engine fires, not the lesson — the firing partition
 *  (learner/build_spec_v1.md §15.2) expressed as data, e.g. for validating a stored event. */
export const RUNTIME_FIRED = ["timeout", "abandon", "terminate"] as const;

/** The canonical five (§15.1): the lesson's `LessonVerdict` (win/lose) plus the runtime-fired set. */
export type Outcome = LessonVerdict | (typeof RUNTIME_FIRED)[number];

/** Emitted exactly once, on the tick the session ends. Versioned wire format. */
export interface TerminalEvent {
  readonly lessonId: LessonId;
  readonly outcome: Outcome;
  readonly durationTicks: number;
  readonly attempts: number;
  readonly score: number;
  readonly schemaVersion: 1;
  /** Optional honest wall-clock (telemetry-only per ADR 0001). */
  readonly durationMs?: number;
  /** Optional; reproduce a session in dev. NOT a replay contract. */
  readonly seed?: number;
}
