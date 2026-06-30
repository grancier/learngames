import { Surface } from "@learn-engine/core";
import { type LocaleId, Localizer, makeRng } from "@learn-engine/lessons";
import { describe, expect, it } from "vitest";
import { EMPTY_INPUT, type InputFrame, type Key } from "./input.js";
import type {
  Lesson,
  LessonContext,
  LessonId,
  LessonVerdict,
  StepResult,
} from "./lesson.js";
import {
  type RuntimeConfig,
  type RuntimeState,
  advance,
  start,
} from "./runtime.js";

const SURF = Surface.create(4, 2);
const LID = "test.fake" as LessonId;

interface FakeState {
  readonly tick: number;
  readonly score: number;
  readonly attempts: number;
}

function ctx(seed = 1): LessonContext {
  return {
    lessonId: LID,
    locale: "en" as LocaleId,
    localizer: new Localizer([], "en" as LocaleId),
    rng: makeRng(seed),
    resume: null,
  };
}

/** A scriptable lesson — the seam for exercising every runtime branch. */
function makeLesson(
  opts: {
    readonly verdictOnTick?: number;
    readonly verdict?: LessonVerdict;
    readonly throwOnTick?: number;
    readonly score?: number;
    readonly attempts?: number;
  } = {},
): Lesson<FakeState> {
  return {
    id: LID,
    init: () => ({
      tick: 0,
      score: opts.score ?? 0,
      attempts: opts.attempts ?? 0,
    }),
    step: (state, _input, c) => {
      if (opts.throwOnTick !== undefined && c.tick === opts.throwOnTick) {
        throw new Error("boom");
      }
      const next: FakeState = { ...state, tick: c.tick };
      if (opts.verdictOnTick !== undefined && c.tick === opts.verdictOnTick) {
        return { state: next, surface: SURF, verdict: opts.verdict ?? "win" };
      }
      return { state: next, surface: SURF };
    },
    score: (s) => s.score,
    attempts: (s) => s.attempts,
  };
}

const cfg = (over: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
  deadlineTicks: 0,
  inactivityTicks: 0,
  seed: 7,
  ...over,
});

const ACTIVE: InputFrame = {
  edges: [{ kind: "button", button: "select" }],
  held: new Set<Key>(),
  text: [],
};

describe("start", () => {
  it("paints the opening frame and begins running at tick 0", () => {
    const s = start(makeLesson(), ctx(), cfg(), 1000);
    expect(s.lifecycle.phase).toBe("running");
    expect(s.tick).toBe(0);
    expect(s.surface).toBe(SURF);
  });
});

describe("advance — running", () => {
  it("increments the tick and stays running with no terminal condition", () => {
    const s0 = start(makeLesson(), ctx(), cfg(), 0);
    const { state, frame } = advance(s0, EMPTY_INPUT, "none", 16);
    expect(state.lifecycle.phase).toBe("running");
    expect(state.tick).toBe(1);
    expect(frame.event).toBeUndefined();
    expect(frame.surface).toBe(SURF);
  });

  it("resets the inactivity clock only on a frame with activity", () => {
    const s0 = start(makeLesson(), ctx(), cfg(), 0);
    const idle = advance(s0, EMPTY_INPUT, "none", 16).state;
    expect(idle.lastInputTick).toBe(0);
    const active = advance(idle, ACTIVE, "none", 32).state;
    expect(active.lastInputTick).toBe(2);
  });
});

describe("advance — lesson-latched outcomes", () => {
  it("ends with 'win' and emits one fully-populated TerminalEvent", () => {
    const s0 = start(
      makeLesson({ verdictOnTick: 1, verdict: "win", score: 5, attempts: 3 }),
      ctx(),
      cfg({ seed: 42 }),
      1000,
    );
    const { state, frame } = advance(s0, ACTIVE, "none", 1500);
    expect(state.lifecycle.phase).toBe("ended");
    expect(frame.event).toEqual({
      lessonId: LID,
      outcome: "win",
      durationTicks: 1,
      attempts: 3,
      score: 5,
      schemaVersion: 1,
      durationMs: 500,
      seed: 42,
    });
  });

  it("ends with 'lose' when the lesson latches it", () => {
    const s0 = start(
      makeLesson({ verdictOnTick: 1, verdict: "lose" }),
      ctx(),
      cfg(),
      0,
    );
    expect(advance(s0, ACTIVE, "none", 1).frame.event?.outcome).toBe("lose");
  });
});

describe("advance — runtime-fired outcomes", () => {
  it("fires 'terminate' when step() throws (error boundary)", () => {
    const s0 = start(makeLesson({ throwOnTick: 1 }), ctx(), cfg(), 0);
    const { state, frame } = advance(s0, EMPTY_INPUT, "none", 1);
    expect(state.lifecycle.phase).toBe("ended");
    expect(frame.event?.outcome).toBe("terminate");
  });

  it("fires 'terminate' on a host teardown signal", () => {
    const s0 = start(makeLesson(), ctx(), cfg(), 0);
    expect(advance(s0, EMPTY_INPUT, "teardown", 1).frame.event?.outcome).toBe(
      "terminate",
    );
  });

  it("fires 'abandon' on a host quit signal", () => {
    const s0 = start(makeLesson(), ctx(), cfg(), 0);
    expect(advance(s0, EMPTY_INPUT, "quit", 1).frame.event?.outcome).toBe(
      "abandon",
    );
  });

  it("fires 'timeout' when the logical deadline is reached", () => {
    let s = start(makeLesson(), ctx(), cfg({ deadlineTicks: 2 }), 0);
    s = advance(s, EMPTY_INPUT, "none", 1).state; // tick 1 < 2 → running
    expect(advance(s, EMPTY_INPUT, "none", 2).frame.event?.outcome).toBe(
      "timeout",
    );
  });

  it("fires 'abandon' after the inactivity budget with no input", () => {
    let s = start(makeLesson(), ctx(), cfg({ inactivityTicks: 2 }), 0);
    s = advance(s, EMPTY_INPUT, "none", 1).state; // 1 - 0 = 1, not > 2
    s = advance(s, EMPTY_INPUT, "none", 2).state; // 2 - 0 = 2, not > 2
    expect(advance(s, EMPTY_INPUT, "none", 3).frame.event?.outcome).toBe(
      "abandon",
    );
  });
});

describe("advance — latch", () => {
  it("resolves a win on the exact deadline tick as 'win' (step runs first)", () => {
    const s0 = start(
      makeLesson({ verdictOnTick: 1, verdict: "win" }),
      ctx(),
      cfg({ deadlineTicks: 1 }),
      0,
    );
    expect(advance(s0, ACTIVE, "none", 1).frame.event?.outcome).toBe("win");
  });

  it("is idempotent after ending: further advances change nothing and emit no event", () => {
    const ended = advance(
      start(makeLesson({ verdictOnTick: 1 }), ctx(), cfg(), 0),
      ACTIVE,
      "none",
      1,
    ).state;
    expect(ended.lifecycle.phase).toBe("ended");
    const again = advance(ended, ACTIVE, "none", 99);
    expect(again.state).toBe(ended);
    expect(again.frame.event).toBeUndefined();
  });

  it("is deterministic: identical inputs yield identical terminal events", () => {
    const make = (): RuntimeState<FakeState> =>
      start(
        makeLesson({ verdictOnTick: 2, verdict: "win", score: 9, attempts: 4 }),
        ctx(5),
        cfg({ seed: 5 }),
        100,
      );
    const runOnce = (s: RuntimeState<FakeState>): unknown => {
      const a = advance(s, ACTIVE, "none", 110).state;
      return advance(a, ACTIVE, "none", 120).frame.event;
    };
    expect(runOnce(make())).toEqual(runOnce(make()));
  });
});

describe("Lesson contract typing", () => {
  it("a Lesson cannot declare a runtime-fired outcome (AC-9)", () => {
    const badStep = (): StepResult<FakeState> => ({
      state: { tick: 0, score: 0, attempts: 0 },
      surface: SURF,
      // @ts-expect-error — verdict is LessonVerdict; timeout/abandon/terminate are runtime-fired only
      verdict: "timeout",
    });
    expect(typeof badStep).toBe("function");
  });
});
