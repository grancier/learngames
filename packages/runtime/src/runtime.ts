import type { Surface } from "@learn-engine/core";
import type { Rng } from "@learn-engine/lessons";
import { EMPTY_INPUT, type InputFrame, hasActivity } from "./input.js";
import type { Lesson, LessonContext, LessonId } from "./lesson.js";
import type { Outcome, TerminalEvent } from "./outcome.js";

export interface RuntimeConfig {
  /** Logical-tick budget; reaching it fires `timeout`. 0 disables. */
  readonly deadlineTicks: number;
  /** Inactivity budget in ticks; exceeding it fires `abandon`. 0 disables. */
  readonly inactivityTicks: number;
  /** Seed echoed into `TerminalEvent.seed` for dev reproducibility. */
  readonly seed: number;
}

/** Not lesson input — a per-tick host lifecycle signal. */
export type HostSignal = "none" | "quit" | "teardown";

export type Lifecycle =
  | { readonly phase: "running" }
  | { readonly phase: "ended"; readonly event: TerminalEvent };

export interface RuntimeState<S> {
  readonly lesson: Lesson<S>;
  readonly lessonState: S;
  readonly lifecycle: Lifecycle;
  readonly surface: Surface;
  readonly tick: number;
  readonly lastInputTick: number;
  readonly rng: Rng;
  readonly config: RuntimeConfig;
  readonly lessonId: LessonId;
  readonly startedAtMs: number;
}

export interface FrameOutput {
  readonly surface: Surface;
  readonly event?: TerminalEvent;
}

export interface AdvanceResult<S> {
  readonly state: RuntimeState<S>;
  readonly frame: FrameOutput;
}

/** Seed a session. Runs `lesson.init`, then paints the opening frame via a tick-0 `step`. Pure
 *  given `now`. A tick-0 verdict is ignored (paint-only); a tick-0 throw propagates. */
export function start<S>(
  lesson: Lesson<S>,
  ctx: LessonContext,
  config: RuntimeConfig,
  now: number,
): RuntimeState<S> {
  const lessonState = lesson.init(ctx);
  const first = lesson.step(lessonState, EMPTY_INPUT, {
    tick: 0,
    rng: ctx.rng,
  });
  return {
    lesson,
    lessonState: first.state,
    lifecycle: { phase: "running" },
    surface: first.surface,
    tick: 0,
    lastInputTick: 0,
    rng: ctx.rng,
    config,
    lessonId: ctx.lessonId,
    startedAtMs: now,
  };
}

/** Advance one logical tick. Pure: deterministic given (state, input, signal, now). */
export function advance<S>(
  state: RuntimeState<S>,
  input: InputFrame,
  signal: HostSignal,
  now: number,
): AdvanceResult<S> {
  if (state.lifecycle.phase === "ended") {
    return { state, frame: { surface: state.surface } }; // idempotent no-op
  }

  const tick = state.tick + 1;
  const lastInputTick = hasActivity(input) ? tick : state.lastInputTick;

  let nextLessonState = state.lessonState;
  let surface = state.surface;
  let outcome: Outcome | null = null;

  try {
    const r = state.lesson.step(state.lessonState, input, {
      tick,
      rng: state.rng,
    });
    nextLessonState = r.state;
    surface = r.surface;
    if (r.verdict) outcome = r.verdict; // win | lose — lesson-latched
  } catch {
    outcome = "terminate"; // error boundary: a throw in first-party step()
  }

  if (outcome === null) {
    if (signal === "teardown") outcome = "terminate";
    else if (signal === "quit") outcome = "abandon";
    else if (
      state.config.deadlineTicks > 0 &&
      tick >= state.config.deadlineTicks
    ) {
      outcome = "timeout";
    } else if (
      state.config.inactivityTicks > 0 &&
      tick - lastInputTick > state.config.inactivityTicks
    ) {
      outcome = "abandon";
    }
  }

  const base = {
    ...state,
    lessonState: nextLessonState,
    surface,
    tick,
    lastInputTick,
  };

  if (outcome === null) {
    return {
      state: { ...base, lifecycle: { phase: "running" } },
      frame: { surface },
    };
  }

  const event: TerminalEvent = {
    lessonId: state.lessonId,
    outcome,
    durationTicks: tick,
    attempts: state.lesson.attempts(nextLessonState),
    score: state.lesson.score(nextLessonState),
    schemaVersion: 1,
    durationMs: now - state.startedAtMs,
    seed: state.config.seed,
  };
  return {
    state: { ...base, lifecycle: { phase: "ended", event } },
    frame: { surface, event },
  };
}
