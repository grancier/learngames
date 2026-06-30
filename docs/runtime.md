# Learn Engine — Pull-Based Runtime Specification

**Scope:** the runtime/orchestration layer (slice 2). Version `0.1`. Target: TypeScript 5.6+, Node 20+, ESM. **This layer is pure** — a deterministic reducer over `(state, input, signal, now)`. No timers, no `requestAnimationFrame`, no I/O. The adapter (slice 4) owns the single impure loop and feeds this reducer; the render-intent library (slice 3) produces the `Surface` a lesson draws. This package depends only on `@learn-engine/core` (the cell `Surface`) and `@learn-engine/lessons` (the domain).

Governed by [ADR 0001](adr/0001-cell-native-typescript-engine.md): pull-based (advance on input or a coarse tick, **not** a 60 Hz loop), lessons-as-SDK, no fuel, seeded-RNG-not-bitwise determinism, kill-filter retained.

---

## 1. Scope and non-goals

### 1.1 In scope

1. **Input model** — a normalized, closed `InputFrame` (`edges` + `held` + first-class `text` entry).
2. **The `Lesson<S>` SDK contract** — what a game author implements; parametric over author state `S`.
3. **The reducer** — pure `advance(state, input, signal, now) → { state, frame }`; `start(...)` to seed it.
4. **Five-outcome lifecycle** — `Win | Lose | Timeout | Abandon | Terminate`, the firing-layer partition, and the idempotent first-event-wins latch.
5. **Telemetry** — a versioned `TerminalEvent` emitted once, on the tick the session ends.
6. **Goal-based progression hook** — the bridge from a terminal outcome onto slice-1 `Progress`/`Mastery` (deferred from slice 1; it now has a caller).

### 1.2 Explicitly out of scope (deferred)

| Deferred | Why / where |
|---|---|
| The render-intent library (banner / box / input-field / tilemap / sprite) | Slice 3. The runtime only passes through the `Surface` a lesson returns. |
| Adapters (browser canvas, terminal ANSI) and the impure loop | Slice 4. The runtime is a pure reducer; the adapter calls `advance` and owns timing, raw input, and repaint. |
| Cross-lesson curriculum orchestration (which lesson unlocks next) | Host concern, fed by `TerminalEvent`; the runtime runs **one** lesson to a terminal event. |
| Bitwise cross-target determinism, replay, fuel | Dropped by ADR 0001. Seed is retained only for in-dev reproducibility. |

---

## 2. Architecture

### 2.1 The three rules this layer enforces

1. **Pure reducer.** `advance` is a pure function of `(state, input, signal, now)`. Wall-clock `now`, RNG, and all input are **injected**; the reducer reads no ambient time, randomness, or I/O. This is what keeps the whole runtime deterministically testable without an adapter.
2. **The firing-layer partition is type-enforced.** A `Lesson` may return only `Win`/`Lose` (`LessonVerdict`). `Timeout`/`Abandon`/`Terminate` are produced by the runtime and are *not expressible* by lesson code. A lesson literally cannot fake an abandon or swallow a crash.
3. **One terminal event, latched.** The lifecycle ends exactly once; the first outcome wins and the rest are dropped (idempotent). After `ended`, `advance` is a no-op that re-emits nothing.

### 2.2 Package boundaries

```
packages/
  runtime/   @learn-engine/runtime — PURE. Input model, Lesson<S> contract, the reducer,
             the five-outcome lifecycle + latch, telemetry, the progression hook.
             deps: @learn-engine/core, @learn-engine/lessons. NO react/ink/fs/fetch/timers/raf.
```

Enforced by a `no-render-deps`-style test (§11), mirroring `core` and `lessons`. Note: depending on `@learn-engine/core` for the `Surface` *type* is allowed — `Surface` is the cell substrate, not a render framework.

### 2.3 Data flow (one tick)

```
adapter (slice 4)                         runtime (this layer)                lesson (SDK author)
  raw key/timer ──normalize──▶ InputFrame ──┐
  host lifecycle ───────────▶ HostSignal ───┤
  Date.now() ───────────────▶ now ──────────┤
                                            ▼
                                   advance(state, input, signal, now)
                                            │  tick+1; reset inactivity if input
                                            ▼
                              try lesson.step(s, input, {tick, rng}) ──▶ { state, surface, verdict? }
                                            │            (throw ⇒ terminate)
                                            ▼
                    verdict? → latch Win/Lose   else  signal/deadline/inactivity → latch T/A/T
                                            │
                              ended ⇒ snapshot score/attempts/seed ⇒ TerminalEvent
                                            ▼
   repaint(surface) ◀───────────── FrameOutput { surface, event? } ───────────────┘
```

---

## 3. Toolchain & package setup

`packages/runtime/package.json`

```json
{
  "name": "@learn-engine/runtime",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@learn-engine/core": "workspace:*",
    "@learn-engine/lessons": "workspace:*"
  }
}
```

`packages/runtime/tsconfig.json` mirrors the others: `extends ../../tsconfig.base.json`, `composite: true`, `types: ["node","vitest"]`, `rootDir: src`, `outDir: dist`, plus `references` to `core` and `lessons`. Add a `references` entry for `runtime` to the root `tsconfig.json` and a path alias in `vitest.config.ts`. Coverage stays gated at 100% on `packages/*/src`.

---

## 4. Input model — `packages/runtime/src/input.ts`

```ts
/** The closed navigation/action vocabulary (build_spec input model). Arcade movement reads
 *  `held`; menus/discrete actions read `edges`. */
export type Direction = "up" | "down" | "left" | "right";
export type Button = "select" | "back";
export type Key = Direction | Button;

/** A key-down transition that occurred during this tick. */
export type InputEdge =
  | { readonly kind: "dir"; readonly dir: Direction }
  | { readonly kind: "button"; readonly button: Button };

/** Text/numeric entry. First-class per ADR 0001 (no replay trace to protect). */
export type TextEdit =
  | { readonly kind: "insert"; readonly text: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "submit" };

/**
 * One tick of normalized input. `edges` = discrete presses (ordered); `held` = keys currently
 * down (continuous movement); `text` = entry events. Adapters normalize their raw events to this.
 */
export interface InputFrame {
  readonly edges: readonly InputEdge[];
  readonly held: ReadonlySet<Key>;
  readonly text: readonly TextEdit[];
}

export const EMPTY_INPUT: InputFrame = { edges: [], held: new Set<Key>(), text: [] };

/** True if this frame carries any player activity (used to reset the inactivity watchdog). */
export function hasActivity(input: InputFrame): boolean {
  return input.edges.length > 0 || input.text.length > 0 || input.held.size > 0;
}
```

---

## 5. The Lesson SDK contract — `packages/runtime/src/lesson.ts`

```ts
import type { Surface } from "@learn-engine/core";
import type { LocaleId, Localizer, Progress, Rng, Result } from "@learn-engine/lessons";
import type { InputFrame } from "./input.js";

declare const brand: unique symbol;
/** A slug-like lesson identifier, e.g. "math.addition-drill". */
export type LessonId = string & { readonly [brand]: "LessonId" };

export type LessonIdError = { readonly kind: "lessonId"; readonly value: string };

export function parseLessonId(s: string): Result<LessonId, LessonIdError> {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(s)
    ? { ok: true, value: s as LessonId }
    : { ok: false, error: { kind: "lessonId", value: s } };
}

/** The only outcomes a lesson may itself declare. The other three are runtime-fired (§6). */
export type LessonVerdict = "win" | "lose";

/** Built once, before the first tick. */
export interface LessonContext {
  readonly lessonId: LessonId;
  readonly locale: LocaleId;
  readonly localizer: Localizer;
  readonly rng: Rng;                 // seeded; deterministic for the whole session
  readonly resume: Progress | null;  // loaded save, if any
}

/** Passed to every `step`. */
export interface StepContext {
  readonly tick: number;             // 0-based logical step index for THIS step
  readonly rng: Rng;                 // same instance as init — advances deterministically
}

export interface StepResult<S> {
  readonly state: S;
  readonly surface: Surface;
  readonly verdict?: LessonVerdict;  // present iff the lesson latches win/lose this tick
}

/**
 * A lesson is SDK code. `init` seeds author state from config + resume; `step` advances it one
 * logical tick and returns the frame to draw (+ optional win/lose). `score`/`attempts` are pure
 * reads the runtime snapshots into the TerminalEvent — the lesson owns what they mean.
 */
export interface Lesson<S> {
  readonly id: LessonId;
  init(ctx: LessonContext): S;
  step(state: S, input: InputFrame, ctx: StepContext): StepResult<S>;
  score(state: S): number;
  attempts(state: S): number;
}
```

> The math drill (UC1) implements `step` as a thin wrapper over the slice-1 `Session` — accumulate `text` into an answer, on `submit` call `Session.submit`, latch `win` at the goal. The letter-shooter (UC2) implements a rich `step` moving cell-snapped entities and latching `win` when the word is spelled. **Same interface, no special-casing.**

---

## 6. Lifecycle & outcomes — `packages/runtime/src/outcome.ts`

```ts
import type { LessonVerdict, LessonId } from "./lesson.js";

/** The canonical five (learner/build_spec_v1.md §15.1). */
export type Outcome = LessonVerdict | "timeout" | "abandon" | "terminate";

/** Emitted exactly once, on the tick the session ends. Versioned wire format. */
export interface TerminalEvent {
  readonly lessonId: LessonId;
  readonly outcome: Outcome;
  readonly durationTicks: number;   // logical steps elapsed — deterministic
  readonly attempts: number;        // snapshot via Lesson.attempts
  readonly score: number;           // snapshot via Lesson.score
  readonly schemaVersion: 1;
  readonly durationMs?: number;     // optional honest wall-clock (telemetry-only per ADR 0001)
  readonly seed?: number;           // optional; reproduce a session in dev (NOT a replay contract)
}
```

### 6.1 Firing-layer partition

| Outcome | Fired by | How |
|---|---|---|
| `win`, `lose` | **the lesson** (latched) | `StepResult.verdict` |
| `timeout` | **the runtime** | armed logical deadline (`config.deadlineTicks`) reached |
| `abandon` | **the runtime** | inactivity watchdog (`config.inactivityTicks`) **or** host `quit` signal |
| `terminate` | **the runtime** | `step()` threw (error boundary) **or** host `teardown` signal |

### 6.2 The latch + per-tick evaluation order (tie-break)

The lifecycle ends once; the first outcome wins. Within a single `advance`, the runtime resolves a same-tick race in this order — **`step()` runs first**, so a `win` on the very tick a deadline would fire still counts as a win (the player made it):

1. If already `ended` → no-op; re-emit nothing.
2. Run `lesson.step(...)`. A **throw ⇒ `terminate`**. A returned **`verdict` ⇒ that outcome**.
3. Only if neither: host `teardown` ⇒ `terminate`; else host `quit` ⇒ `abandon`; else deadline reached ⇒ `timeout`; else inactivity exceeded ⇒ `abandon`.

---

## 7. The reducer — `packages/runtime/src/runtime.ts`

```ts
import type { Surface } from "@learn-engine/core";
import type { Rng } from "@learn-engine/lessons";
import { EMPTY_INPUT, hasActivity, type InputFrame } from "./input.js";
import type { Lesson, LessonContext, LessonId } from "./lesson.js";
import type { Outcome, TerminalEvent } from "./outcome.js";

export interface RuntimeConfig {
  /** Logical-tick budget; reaching it fires `timeout`. 0 disables. */
  readonly deadlineTicks: number;
  /** Inactivity budget in ticks; exceeding it fires `abandon`. 0 disables. */
  readonly inactivityTicks: number;
  /** Seed echoed into TerminalEvent.seed for dev reproducibility. */
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
  readonly surface: Surface;        // last frame rendered
  readonly tick: number;            // ticks elapsed (0 before the first advance)
  readonly lastInputTick: number;
  readonly rng: Rng;
  readonly config: RuntimeConfig;
  readonly lessonId: LessonId;
  readonly startedAtMs: number;
}

export interface FrameOutput {
  readonly surface: Surface;
  readonly event?: TerminalEvent;   // present only on the ending tick
}

export interface AdvanceResult<S> {
  readonly state: RuntimeState<S>;
  readonly frame: FrameOutput;
}

/** Seed a session. Runs `lesson.init` and paints the initial frame (tick 0). Pure given `now`. */
export function start<S>(
  lesson: Lesson<S>,
  ctx: LessonContext,
  config: RuntimeConfig,
  now: number,
): RuntimeState<S> {
  const lessonState = lesson.init(ctx);
  const first = lesson.step(lessonState, EMPTY_INPUT, { tick: 0, rng: ctx.rng });
  // start paints only: a tick-0 verdict is ignored; a tick-0 throw propagates (hard authoring error).
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
    const r = state.lesson.step(state.lessonState, input, { tick, rng: state.rng });
    nextLessonState = r.state;
    surface = r.surface;
    if (r.verdict) outcome = r.verdict; // win | lose
  } catch {
    outcome = "terminate"; // error boundary — a throw in first-party step()
  }

  if (outcome === null) {
    if (signal === "teardown") outcome = "terminate";
    else if (signal === "quit") outcome = "abandon";
    else if (state.config.deadlineTicks > 0 && tick >= state.config.deadlineTicks) outcome = "timeout";
    else if (state.config.inactivityTicks > 0 && tick - lastInputTick > state.config.inactivityTicks) outcome = "abandon";
  }

  const base = { ...state, lessonState: nextLessonState, surface, tick, lastInputTick };

  if (outcome === null) {
    return { state: { ...base, lifecycle: { phase: "running" } }, frame: { surface } };
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
  return { state: { ...base, lifecycle: { phase: "ended", event } }, frame: { surface, event } };
}
```

> **On `start` and tick-0 verdicts/throws:** `start` paints the opening frame by calling `step` once at tick 0. A `win`/`lose` returned there is **ignored** (start is paint-only; the first terminal is evaluated from tick 1). A **throw** at tick-0 paint **propagates** from `start` — a lesson that cannot paint its first frame is a hard authoring error and should fail loudly, not be laundered into a `terminate` telemetry event. Keeping `start` paint-only avoids an `AdvanceResult` shape that can end before tick 1.

---

## 8. Goal-based progression hook — `packages/runtime/src/progression-bridge.ts`

The bridge from a terminal lesson result onto a player's durable `Progress`, reusing slice-1 primitives. Cross-lesson unlocking (which lesson next) is the host's job, fed by this.

```ts
import { type Mastery, type Outcome as GradeOutcome, type Progress, type SkillId, emptyMastery, recordOutcome } from "@learn-engine/lessons";
import type { Outcome, TerminalEvent } from "./outcome.js";

/** Mapping policy (documented decision):
 *  win → "correct"; lose / timeout → "incorrect"; abandon / terminate → no mastery change
 *  (a kid leaving or a crash is not a pedagogical signal). highScore always tracks best score. */
function masterySignal(o: Outcome): GradeOutcome | null {
  switch (o) {
    case "win": return "correct";
    case "lose":
    case "timeout": return "incorrect";
    case "abandon":
    case "terminate": return null;
  }
}

/** Fold a terminal event into Progress for the skill the lesson exercised. Pure. */
export function recordLessonResult(progress: Progress, skill: SkillId, event: TerminalEvent, now: number): Progress {
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
```

---

## 9. Worked example — the math drill as a `Lesson` (UC1)

A sketch proving the thin-wrapper claim (full version lands in slice 5). `MathDrillState` holds the slice-1 `ActiveSession`, the current `Challenge`, the in-progress typed answer, and a goal counter.

```ts
// step(): accumulate text → on submit, grade via Session.submit → render via slice-3 intents.
step(s, input, ctx) {
  let entry = s.entry;
  let session = s.session;
  let challenge = s.challenge;
  let verdict: LessonVerdict | undefined;

  for (const t of input.text) {
    if (t.kind === "insert") entry += t.text;
    else if (t.kind === "backspace") entry = entry.slice(0, -1);
    else if (t.kind === "submit") {
      const n = s.localizer.parseNumber(entry, s.locale);
      const res = submit(session, challenge, { kind: "number", value: n ?? Number.NaN }, ctx.tick);
      session = res.session;
      entry = "";
      challenge = nextChallenge(session, ctx.rng);
      if (countCorrect(session) >= s.goal) verdict = "win";
    }
  }
  return { state: { ...s, session, challenge, entry }, surface: renderDrill(s, entry), verdict };
}
```

`score(s) = seatScore(s.session)`, `attempts(s) = s.session.attempts.length`. Rendering (`renderDrill`) is slice-3 intents; here it is a placeholder.

---

## 10. Acceptance criteria

**Reducer & determinism**
- **AC-1** `advance` is pure: equal `(state, input, signal, now)` ⇒ equal `(state, frame)`; it reads no ambient time/RNG/I/O.
- **AC-2** A fixed seed + a fixed input script ⇒ identical surfaces and identical `TerminalEvent` across runs.
- **AC-3** `tick` increments by 1 per `advance`; `lastInputTick` resets only on a frame with activity.

**Lifecycle & the five outcomes**
- **AC-4** A lesson returning `verdict: "win"` / `"lose"` ends the session with that outcome.
- **AC-5** `deadlineTicks` reached with no verdict ⇒ `timeout`; `signal: "quit"` ⇒ `abandon`; `signal: "teardown"` ⇒ `terminate`; inactivity beyond `inactivityTicks` ⇒ `abandon`.
- **AC-6** A `step()` that **throws** ⇒ `terminate` (the reducer never propagates the throw).
- **AC-7** **Tie-break:** a `win` returned on the same tick the deadline elapses resolves to `win` (step runs first).
- **AC-8** **Latch idempotency:** after `ended`, further `advance` calls return the state unchanged and emit no second `event`.
- **AC-9** A `Lesson` type cannot return `timeout`/`abandon`/`terminate` (`LessonVerdict` excludes them) — verified with `@ts-expect-error`.

**Telemetry**
- **AC-10** `TerminalEvent` fires exactly once, on the ending tick, carrying `outcome`, `durationTicks`, snapshotted `score`/`attempts`, `schemaVersion: 1`, and (optional) `durationMs`/`seed`.

**Progression bridge**
- **AC-11** `recordLessonResult` folds `win`→correct, `lose`/`timeout`→incorrect, `abandon`/`terminate`→no mastery change; `highScore` tracks the max; `updatedAt` always advances.

**Input**
- **AC-12** `hasActivity` is true iff `edges`/`text`/`held` is non-empty; `EMPTY_INPUT` is inert.

**Quality**
- **AC-13** `tsc -b` clean (no `any`); 100% coverage on `packages/runtime/src`.
- **AC-14** `@learn-engine/runtime` declares no `react`/`ink`/`node:fs` dependency (enforced by test).

---

## 11. Testing steps

1. `pnpm install` — resolves the new workspace package.
2. `pnpm typecheck` — exit 0; the `@ts-expect-error` proving AC-9 stays an error.
3. `pnpm test` — representative suites:
   - `runtime.test.ts` — determinism (AC-1/2/3), each outcome path (AC-4/5/6), the tie-break (AC-7), latch idempotency (AC-8), telemetry snapshot (AC-10). A `FakeLesson<S>` whose `step` is scripted (return a verdict / throw on cue) is the seam.
   - `outcome.test.ts` / `progression-bridge.test.ts` — the mapping policy (AC-11).
   - `input.test.ts` — `hasActivity`/`EMPTY_INPUT` (AC-12).
   - `no-render-deps.test.ts` — no react/ink/node:fs (AC-14).
4. `pnpm test:coverage` — 100% on `packages/runtime/src`.

---

## 12. Definition of Done

- `packages/runtime` exists; `pnpm typecheck && pnpm build && pnpm test` pass with 100% coverage on its `src`.
- AC-1 … AC-14 hold.
- `@learn-engine/runtime` has zero `react`/`ink`/`node:fs` deps; the reducer reads no ambient time/RNG/I/O.

---

## 13. Forward-compatibility (what plugs in later)

- **Slice 3 (render intents)** — `renderDrill`-style placeholders become `banner`/`box`/`input-field`/`tilemap`/`sprite` builders that compile to `Surface` cells, kill-filter enforced.
- **Slice 4 (adapters)** — a browser-canvas adapter and a terminal adapter each own a loop that normalizes raw input → `InputFrame`, calls `advance`, and repaints `frame.surface` (diffing consecutive surfaces). The reducer is unchanged.
- **Slice 5 (worked games)** — the UC1 drill and UC2 letter-speller as full `Lesson<S>` implementations, proving the SDK.
- **Spaced repetition** — `recordLessonResult` already feeds `Mastery.lastSeen`; a scheduler can order lessons by it with no format change.
