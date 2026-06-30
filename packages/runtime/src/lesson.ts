import type { Surface } from "@learn-engine/core";
import {
  type LocaleId,
  type Localizer,
  type Progress,
  type Result,
  type Rng,
  err,
  ok,
} from "@learn-engine/lessons";
import type { InputFrame } from "./input.js";

declare const brand: unique symbol;
/** A slug-like lesson identifier, e.g. "math.addition-drill". */
export type LessonId = string & { readonly [brand]: "LessonId" };

export type LessonIdError = {
  readonly kind: "lessonId";
  readonly value: string;
};

export function parseLessonId(s: string): Result<LessonId, LessonIdError> {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(s)
    ? ok(s as LessonId)
    : err({ kind: "lessonId", value: s });
}

/** The only outcomes a lesson may itself declare. Timeout/Abandon/Terminate are runtime-fired. */
export type LessonVerdict = "win" | "lose";

/** Built once, before the first tick. */
export interface LessonContext {
  readonly lessonId: LessonId;
  readonly locale: LocaleId;
  readonly localizer: Localizer;
  readonly rng: Rng;
  readonly resume: Progress | null;
}

/** Passed to every `step`. */
export interface StepContext {
  readonly tick: number;
  readonly rng: Rng;
}

export interface StepResult<S> {
  readonly state: S;
  readonly surface: Surface;
  readonly verdict?: LessonVerdict;
}

/**
 * A lesson is SDK code. `init` seeds author state from config + resume; `step` advances it one
 * logical tick and returns the frame to draw (+ an optional win/lose). `score`/`attempts` are
 * pure reads the runtime snapshots into the TerminalEvent — the lesson owns what they mean.
 */
export interface Lesson<S> {
  readonly id: LessonId;
  init(ctx: LessonContext): S;
  step(state: S, input: InputFrame, ctx: StepContext): StepResult<S>;
  score(state: S): number;
  attempts(state: S): number;
}
