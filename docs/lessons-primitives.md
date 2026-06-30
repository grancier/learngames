# Learn Engine — Lesson Primitives Specification

**Scope:** the lesson/pedagogy layer only. Version `0.1`. Target: TypeScript 5.6+, Node 20+, ESM. **This layer is pure** — zero React/Ink/graphics/filesystem in the core package, mirroring the discipline of the graphics spine. It is the engine that turns config + player input into graded challenges, tracks mastery and progression, and persists progress — independent of how any of it is drawn.

This document is self-contained and implementation-ready. A developer should be able to scaffold the package, paste the code, build a real game on top of it (§12), and verify it against the acceptance criteria (§13) and testing steps (§14).

---

## 1. Scope and non-goals

### 1.1 In scope

1. **Domain identity** — branded `PlayerName`, `Level`, `SkillId`, `LocaleId`, `SaveKey`, parsed at boundaries (parse-don't-validate).
2. **Grading** — a closed `AnswerSpec` union + a pure total `grade()` function, with a `custom` escape hatch (registry) for developer-defined graders.
3. **Generation** — `ChallengeSource` (RNG-injected, deterministic) and a weighted `Scheduler`.
4. **Progression** — `Mastery` value + swappable `ProgressionPolicy`.
5. **Session** — a discriminated-union state machine (`configuring → active → complete`) with pure transitions, turn order for 1–2 players, and an attempt log.
6. **Content packs** — declarative, zod-validated config describing skills + a curriculum DAG; DTO ≠ domain.
7. **Localization** — ICU MessageFormat with locale fallback chains, separate UI/content namespaces, and **locale-aware numeric parsing** (the silent grading bug if omitted).
8. **Persistence** — async `ProgressStore` interface, a versioned + zod-validated save codec with migration, and an in-memory reference store. (Player name + save state live here.)
9. **Developer SDK** — the public surface and a worked example game in its own package (§12).

### 1.2 Explicitly out of scope (deferred)

| Deferred | Why |
|---|---|
| Rendering of lessons (banners, input fields, big fonts) | The graphics spine + Ink widgets. The lesson layer emits *data* (a `PromptSpec` with a copy key + params); something else draws it. |
| File/network I/O for config & saves | Runtime concern. The core parses already-read data and exposes the `ProgressStore` interface; concrete fs/IndexedDB adapters live in runtime packages (fs adapter sketched in §11.4 / §12 for the Node path). |
| Tick/clock, scene flow, input plumbing | Engine. |
| Spaced repetition scheduling | `Mastery.lastSeen` is reserved now so the save format is forward-compatible; the scheduler lands later. |
| Multi-numeral-system parsing (Arabic-Indic digits, etc.) | `parseLocaleNumber` handles Latin digits + locale separators in v1; full numeral systems deferred with the i18n phase. |

---

## 2. Architecture

### 2.1 The three rules this layer enforces

1. **Pure domain.** Every transition (`grade`, `recordOutcome`, `submit`, …) is a pure function or a function returning a new immutable value. No I/O, no time except an injected `now`, no RNG except an injected `Rng`. This is what makes the entire pedagogy testable with zero renderer and fully deterministic.
2. **Parse at the edge.** Untrusted bytes (config files, saved games, typed answers) are validated with zod / parse functions into branded domain types. A `ContentPack` or `Progress` value, once constructed, is known-valid.
3. **DTO ≠ domain.** Wire shapes (`ContentPackInput`, `SaveV1`) are separate types from domain shapes (`ContentPack`, `Progress`), mapped explicitly. Save compatibility is a forever commitment, so the wire format is versioned and migratable.

### 2.2 Package boundaries

```
packages/
  lessons/        @learn-engine/lessons — PURE. ids, grading, rng, generation, progression,
                  session, content, i18n, persistence (interface + codec + in-memory store).
                  deps: zod, intl-messageformat. NO react/ink/fs/fetch.
apps/
  examples/
    addition-drill/  @learn-engine/example-addition — a real game built ON the library:
                     its own ContentPack + locales, a custom ChallengeSource, an fs ProgressStore,
                     and a headless turn loop. This is the extensibility proof.
```

`@learn-engine/lessons` has **no** `react`, `ink`, `node:fs`, or `fetch` dependency (enforced by a test, §10.7). The fs `ProgressStore` and YAML loader are runtime adapters and live in the example (production would extract them to `@learn-engine/lessons-node`).

### 2.3 Data flow (a single turn)

```
ContentPack (config)        Localizer (locale bundles)        ProgressStore (player save)
       │                            │                                 │
       ▼                            │                                 ▼
   Scheduler.next(level, rng) ──▶ Challenge { prompt:{key,params}, answer } ──┐
                                    │                                          │
              localize prompt ◀─────┘  (format(key, params))                  │  (render — out of scope)
                                                                               ▼
   user types answer ──▶ Localizer.parseNumber / raw text ──▶ Response ──▶ submit(session, challenge, response, now)
                                                                               │
                                                       grade → recordOutcome → policy.evaluate → new Session + TurnResult
                                                                               │
                                                                      encodeSave → ProgressStore.save
```

---

## 3. Toolchain & Node setup

Shares the workspace from the graphics spine. New/relevant pieces only:

`packages/lessons/package.json`

```json
{
  "name": "@learn-engine/lessons",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "zod": "^4.0.0",
    "intl-messageformat": "^10.7.0"
  },
  "devDependencies": { "fast-check": "^3.22.0" }
}
```

`packages/lessons/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

Uses the same strict `tsconfig.base.json` from the graphics spine (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, NodeNext).

> **Pin caveat:** zod v4 and `intl-messageformat` v10 are assumed. The zod helpers used here are the stable subset (`object`, `string`, `number`, `literal`, `array`, `tuple`, `discriminatedUnion`, `safeParse`, `infer`); the save DTO deliberately models maps as **arrays of entries** rather than `z.record` to avoid record-key typing differences across zod versions. Verify the exact signatures against your lockfile.

---

## 4. Result & identity — `packages/lessons/src/ids.ts`

```ts
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A validated, non-empty (1–24 code points) display name. */
export type PlayerName = Brand<string, "PlayerName">;
/** A non-negative integer difficulty level. */
export type Level = Brand<number, "Level">;
/** A slug-like skill identifier, e.g. "math.add". */
export type SkillId = Brand<string, "SkillId">;
/** A BCP-47-ish locale tag, e.g. "en" or "es-MX". */
export type LocaleId = Brand<string, "LocaleId">;
/** A persistence key. */
export type SaveKey = Brand<string, "SaveKey">;

export type IdError =
  | { kind: "playerName"; len: number }
  | { kind: "level"; value: number }
  | { kind: "skillId"; value: string }
  | { kind: "localeId"; value: string };

export function parsePlayerName(raw: string): Result<PlayerName, IdError> {
  const t = raw.trim();
  const len = [...t].length; // count code points, not UTF-16 units
  return len >= 1 && len <= 24 ? ok(t as PlayerName) : err({ kind: "playerName", len });
}

export function parseLevel(n: number): Result<Level, IdError> {
  return Number.isInteger(n) && n >= 0 ? ok(n as Level) : err({ kind: "level", value: n });
}

export function parseSkillId(s: string): Result<SkillId, IdError> {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(s) ? ok(s as SkillId) : err({ kind: "skillId", value: s });
}

export function parseLocaleId(s: string): Result<LocaleId, IdError> {
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(s) ? ok(s as LocaleId) : err({ kind: "localeId", value: s });
}

export const nextLevel = (l: Level): Level => (l + 1) as Level;
export const saveKeyForPlayer = (name: PlayerName): SaveKey => `player:${name}` as SaveKey;
```

---

## 5. Grading — `packages/lessons/src/grading.ts`

```ts
/**
 * Closed union of how an answer is graded. Built-ins are exhaustive (the compiler enforces
 * coverage in `grade`). Developer-defined grading uses the `custom` variant + a GraderRegistry,
 * keeping the built-in set closed while leaving an open extension point (§12.3).
 */
export type AnswerSpec =
  | { readonly kind: "integer"; readonly value: number }
  | { readonly kind: "decimal"; readonly value: number; readonly tolerance: number }
  | { readonly kind: "word"; readonly accepted: readonly string[]; readonly caseSensitive: boolean; readonly trim: boolean }
  | { readonly kind: "choice"; readonly correct: number }
  | { readonly kind: "custom"; readonly graderId: string };

/**
 * A normalized response. Numeric answers are PARSED before they reach here — locale-aware parsing
 * (e.g. "3,5" → 3.5) is the input layer's job via `Localizer.parseNumber` (§8). This keeps `grade` pure.
 */
export type Response =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "choice"; readonly index: number };

export type Outcome = "correct" | "incorrect";

export type Grader = (response: Response) => Outcome;
export type GraderRegistry = ReadonlyMap<string, Grader>;

/** Pure, total. Unknown response shapes and unknown custom graders fail CLOSED (never "correct"). */
export function grade(spec: AnswerSpec, res: Response, custom?: GraderRegistry): Outcome {
  switch (spec.kind) {
    case "integer":
      return res.kind === "number" && Number.isInteger(res.value) && res.value === spec.value ? "correct" : "incorrect";
    case "decimal":
      return res.kind === "number" && Math.abs(res.value - spec.value) <= spec.tolerance ? "correct" : "incorrect";
    case "word": {
      if (res.kind !== "text") return "incorrect";
      const norm = (s: string): string => (spec.trim ? s.trim() : s);
      const got = norm(res.value);
      const eq = (a: string): boolean =>
        spec.caseSensitive ? norm(a) === got : norm(a).toLowerCase() === got.toLowerCase();
      return spec.accepted.some(eq) ? "correct" : "incorrect";
    }
    case "choice":
      return res.kind === "choice" && res.index === spec.correct ? "correct" : "incorrect";
    case "custom": {
      const g = custom?.get(spec.graderId);
      return g ? g(res) : "incorrect"; // unknown grader → fail closed
    }
    default:
      return assertNever(spec);
  }
}

function assertNever(x: never): never {
  throw new Error(`unhandled answer spec: ${JSON.stringify(x)}`);
}
```

---

## 6. Generation — `packages/lessons/src/generation.ts`

```ts
import type { Level, SkillId } from "./ids.js";
import type { AnswerSpec } from "./grading.js";

/** Deterministic, seedable RNG. Injected everywhere so generation/selection is reproducible. */
export interface Rng {
  /** float in [0,1). */
  float(): number;
  /** integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** uniform element. */
  pick<T>(items: readonly T[]): T;
}

/** mulberry32 — small, fast, deterministic. Good enough for content; not cryptographic. */
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error("pick from empty array");
      return items[Math.floor(next() * items.length)]!;
    },
  };
}

/** A prompt is DATA, not text: a localization key + params, resolved by the Localizer at render time. */
export interface PromptSpec {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly big?: boolean; // hint for large-font rendering (e.g. letter learning)
}

export interface Challenge {
  readonly skill: SkillId;
  readonly level: Level;
  readonly prompt: PromptSpec;
  readonly answer: AnswerSpec;
}

/** A producer of challenges for one skill. Implemented by the library AND by game authors. */
export interface ChallengeSource {
  readonly skill: SkillId;
  generate(level: Level, rng: Rng): Challenge;
}

/** Weighted selection across multiple sources. */
export class Scheduler {
  private readonly entries: ReadonlyArray<{ readonly source: ChallengeSource; readonly weight: number }>;
  private readonly total: number;

  constructor(entries: ReadonlyArray<{ source: ChallengeSource; weight: number }>) {
    if (entries.length === 0) throw new Error("Scheduler requires at least one source");
    const cleaned = entries.map((e) => ({ source: e.source, weight: Math.max(0, e.weight) }));
    this.total = cleaned.reduce((a, e) => a + e.weight, 0);
    if (this.total <= 0) throw new Error("Scheduler weights must sum to > 0");
    this.entries = cleaned;
  }

  next(level: Level, rng: Rng): Challenge {
    let r = rng.float() * this.total;
    for (const e of this.entries) {
      r -= e.weight;
      if (r < 0) return e.source.generate(level, rng);
    }
    return this.entries[this.entries.length - 1]!.source.generate(level, rng);
  }

  sources(): readonly ChallengeSource[] {
    return this.entries.map((e) => e.source);
  }
}
```

---

## 7. Progression — `packages/lessons/src/progression.ts`

```ts
import type { Level } from "./ids.js";
import type { Outcome } from "./grading.js";

export interface Mastery {
  readonly attempts: number;
  readonly correct: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly lastSeen: number | null; // epoch ms; reserved for spaced repetition (forward-compatible)
}

export const emptyMastery: Mastery = { attempts: 0, correct: 0, streak: 0, bestStreak: 0, lastSeen: null };

/** Pure: fold one outcome into a mastery record. */
export function recordOutcome(m: Mastery, outcome: Outcome, now: number): Mastery {
  const streak = outcome === "correct" ? m.streak + 1 : 0;
  return {
    attempts: m.attempts + 1,
    correct: m.correct + (outcome === "correct" ? 1 : 0),
    streak,
    bestStreak: Math.max(m.bestStreak, streak),
    lastSeen: now,
  };
}

export const accuracy = (m: Mastery): number => (m.attempts === 0 ? 0 : m.correct / m.attempts);

export type LevelOutcome = "hold" | "advance";

/** Strategy: turns mastery into a level decision. Swappable per curriculum. */
export interface ProgressionPolicy {
  evaluate(level: Level, mastery: Mastery): LevelOutcome;
}

/** Advance once a clean streak is reached. */
export function streakPolicy(required: number): ProgressionPolicy {
  return { evaluate: (_level, m) => (m.streak >= required ? "advance" : "hold") };
}

/** Advance once enough attempts AND accuracy threshold are met. */
export function accuracyWindowPolicy(minAttempts: number, minAccuracy: number): ProgressionPolicy {
  return { evaluate: (_level, m) => (m.attempts >= minAttempts && accuracy(m) >= minAccuracy ? "advance" : "hold") };
}
```

> **Behavior note:** mastery is per-skill, not per-level; advancing a level does not reset mastery. With `streakPolicy(3)`, a hot streak will keep advancing each turn. If a curriculum wants one-advance-then-cool-down, encode that in a custom policy that consults `level` and recent history. v1 keeps the simple behavior, documented.

---

## 8. Localization — `packages/lessons/src/i18n.ts`

```ts
import IntlMessageFormat from "intl-messageformat";
import type { LocaleId } from "./ids.js";

export interface LocaleBundle {
  readonly locale: LocaleId;
  readonly messages: Readonly<Record<string, string>>; // key → ICU MessageFormat string
}

export interface LocalizerOptions {
  /** Called when a key is missing in the whole fallback chain. Default: silent, returns the key. */
  readonly onMissing?: (key: string, locale: LocaleId) => void;
}

/**
 * ICU MessageFormat localizer with fallback chains and namespaced keys.
 * Convention: keys are namespaced ("ui.*", "content.*", "math.add.prompt"); split UI vs content by prefix.
 */
export class Localizer {
  private readonly bundles: ReadonlyMap<LocaleId, Readonly<Record<string, string>>>;
  private readonly defaultLocale: LocaleId;
  private readonly opts: LocalizerOptions;
  private readonly cache = new Map<string, IntlMessageFormat>();

  constructor(bundles: readonly LocaleBundle[], defaultLocale: LocaleId, opts: LocalizerOptions = {}) {
    this.bundles = new Map(bundles.map((b) => [b.locale, b.messages]));
    this.defaultLocale = defaultLocale;
    this.opts = opts;
  }

  /** Fallback chain, e.g. "es-MX" → ["es-MX", "es", defaultLocale]. */
  private chain(locale: LocaleId): LocaleId[] {
    const parts = locale.split("-");
    const out: LocaleId[] = [];
    for (let i = parts.length; i > 0; i--) out.push(parts.slice(0, i).join("-") as LocaleId);
    if (!out.includes(this.defaultLocale)) out.push(this.defaultLocale);
    return out;
  }

  private lookup(key: string, locale: LocaleId): { msg: string; locale: LocaleId } | null {
    for (const l of this.chain(locale)) {
      const b = this.bundles.get(l);
      if (b && Object.prototype.hasOwnProperty.call(b, key)) return { msg: b[key]!, locale: l };
    }
    return null;
  }

  /** Format an ICU message (plurals, select, number/date) with params. Returns the key on miss. */
  format(key: string, locale: LocaleId, params: Readonly<Record<string, string | number>> = {}): string {
    const found = this.lookup(key, locale);
    if (!found) {
      this.opts.onMissing?.(key, locale);
      return key;
    }
    const cacheKey = `${found.locale}\u0000${key}`;
    let f = this.cache.get(cacheKey);
    if (!f) {
      f = new IntlMessageFormat(found.msg, found.locale);
      this.cache.set(cacheKey, f);
    }
    return String(f.format(params));
  }

  formatNumber(n: number, locale: LocaleId): string {
    return new Intl.NumberFormat(locale).format(n);
  }

  parseNumber(raw: string, locale: LocaleId): number | null {
    return parseLocaleNumber(raw, locale);
  }
}

/**
 * Locale-aware numeric parse. Derives this locale's group/decimal separators from Intl, strips groups,
 * normalizes the decimal mark, and parses. Handles "1.234,56" (de) and "1,234.56" (en). v1: Latin digits.
 */
export function parseLocaleNumber(raw: string, locale: string): number | null {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const group = parts.find((p) => p.type === "group")?.value ?? ",";
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
  const normalized = raw
    .trim()
    .split(group).join("")        // remove grouping separators (may be NBSP etc.)
    .split(decimal).join(".")     // normalize decimal mark to "."
    .replace(/[^0-9.+-]/g, "");
  if (normalized === "" || normalized === "-" || normalized === "+" || normalized === ".") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
```

---

## 9. Content packs — `packages/lessons/src/content.ts`

```ts
import { z } from "zod";
import { type LocaleId, type Level, type Result, type SkillId, err, ok, parseLocaleId, parseSkillId } from "./ids.js";

// ---- Wire DTO (what a YAML/JSON config deserializes to) ----
const SkillDefDTO = z.object({
  id: z.string(),
  title: z.string(),             // a copy key, e.g. "content.math.add.title"
  prereqs: z.array(z.string()).default([]),
  minLevel: z.number().int().nonnegative().default(0),
  maxLevel: z.number().int().nonnegative().default(99),
});

const ContentPackDTO = z.object({
  id: z.string(),
  schemaVersion: z.literal(1),
  defaultLocale: z.string(),
  locales: z.array(z.string()).min(1),
  skills: z.array(SkillDefDTO).min(1),
});

export type ContentPackInput = z.infer<typeof ContentPackDTO>;

// ---- Domain shape (branded, map-indexed, validated) ----
export interface SkillDef {
  readonly id: SkillId;
  readonly titleKey: string;
  readonly prereqs: readonly SkillId[];
  readonly minLevel: Level;
  readonly maxLevel: Level;
}

export interface ContentPack {
  readonly id: string;
  readonly defaultLocale: LocaleId;
  readonly locales: readonly LocaleId[];
  readonly skills: ReadonlyMap<SkillId, SkillDef>;
}

export type ContentError =
  | { kind: "schema"; detail: string }
  | { kind: "invalidId"; value: string }
  | { kind: "unknownPrereq"; skill: string; prereq: string }
  | { kind: "cycle"; cycle: readonly string[] };

/** Parse boundary: untrusted config → validated ContentPack, with curriculum-DAG checks. */
export function parseContentPack(raw: unknown): Result<ContentPack, ContentError> {
  const parsed = ContentPackDTO.safeParse(raw);
  if (!parsed.success) return err({ kind: "schema", detail: parsed.error.message });
  const dto = parsed.data;

  const defaultLocale = parseLocaleId(dto.defaultLocale);
  if (!defaultLocale.ok) return err({ kind: "invalidId", value: dto.defaultLocale });

  const locales: LocaleId[] = [];
  for (const l of dto.locales) {
    const p = parseLocaleId(l);
    if (!p.ok) return err({ kind: "invalidId", value: l });
    locales.push(p.value);
  }

  const skills = new Map<SkillId, SkillDef>();
  for (const s of dto.skills) {
    const id = parseSkillId(s.id);
    if (!id.ok) return err({ kind: "invalidId", value: s.id });
    const prereqs: SkillId[] = [];
    for (const p of s.prereqs) {
      const pid = parseSkillId(p);
      if (!pid.ok) return err({ kind: "invalidId", value: p });
      prereqs.push(pid.value);
    }
    skills.set(id.value, {
      id: id.value,
      titleKey: s.title,
      prereqs,
      minLevel: s.minLevel as Level,
      maxLevel: s.maxLevel as Level,
    });
  }

  // prereqs must exist
  for (const skill of skills.values()) {
    for (const p of skill.prereqs) {
      if (!skills.has(p)) return err({ kind: "unknownPrereq", skill: skill.id, prereq: p });
    }
  }

  // DAG: detect cycles via DFS
  const cycle = findCycle(skills);
  if (cycle) return err({ kind: "cycle", cycle });

  return ok({ id: dto.id, defaultLocale: defaultLocale.value, locales, skills });
}

function findCycle(skills: ReadonlyMap<SkillId, SkillDef>): readonly string[] | null {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<SkillId, number>([...skills.keys()].map((k) => [k, WHITE]));
  const stack: SkillId[] = [];

  const visit = (id: SkillId): readonly string[] | null => {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of skills.get(id)!.prereqs) {
      const c = color.get(dep);
      if (c === GRAY) return [...stack.slice(stack.indexOf(dep)), dep]; // back-edge → cycle
      if (c === WHITE) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  };

  for (const id of skills.keys()) {
    if (color.get(id) === WHITE) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}
```

---

## 10. Session — `packages/lessons/src/session.ts`

```ts
import type { Challenge, Rng, Scheduler } from "./generation.js";
import { grade, type GraderRegistry, type Outcome, type Response } from "./grading.js";
import type { Level, PlayerName } from "./ids.js";
import { nextLevel } from "./ids.js";
import { type LevelOutcome, type Mastery, type ProgressionPolicy, emptyMastery, recordOutcome } from "./progression.js";
import type { SkillId } from "./ids.js";

export type Seat = "one" | "two";
export interface Player {
  readonly name: PlayerName;
}

/** 1 or 2 players modeled as a closed union — no representable 0- or 3-player states. */
export type Roster =
  | { readonly kind: "solo"; readonly player: Player }
  | { readonly kind: "versus"; readonly players: readonly [Player, Player] };

export interface SeatProgress {
  readonly player: Player;
  readonly level: Level;
  readonly mastery: ReadonlyMap<SkillId, Mastery>;
  readonly score: number;
}

export interface Attempt {
  readonly at: number;
  readonly seat: Seat;
  readonly skill: SkillId;
  readonly level: Level;
  readonly response: Response;
  readonly outcome: Outcome;
}

export interface SessionConfig {
  readonly roster: Roster;
  readonly scheduler: Scheduler;
  readonly policy: ProgressionPolicy;
  readonly startLevel: Level;
  readonly graders?: GraderRegistry;
}

interface Base {
  readonly config: SessionConfig;
  readonly seats: ReadonlyMap<Seat, SeatProgress>;
  readonly attempts: readonly Attempt[];
  readonly turn: Seat;
}

/** Discriminated-union state machine. Phase-specific transition functions accept only the right phase. */
export type Session =
  | (Base & { readonly phase: "configuring" })
  | (Base & { readonly phase: "active" })
  | (Base & { readonly phase: "complete" });

export type ActiveSession = Extract<Session, { phase: "active" }>;

/** Build a fresh configuring session. `resume` seeds per-seat progress from a loaded save (optional). */
export function configure(config: SessionConfig, resume?: ReadonlyMap<Seat, Partial<SeatProgress>>): Session & { phase: "configuring" } {
  const mk = (seat: Seat, player: Player): [Seat, SeatProgress] => {
    const r = resume?.get(seat);
    return [seat, {
      player,
      level: r?.level ?? config.startLevel,
      mastery: r?.mastery ?? new Map<SkillId, Mastery>(),
      score: r?.score ?? 0,
    }];
  };
  const seats: Array<[Seat, SeatProgress]> =
    config.roster.kind === "solo"
      ? [mk("one", config.roster.player)]
      : [mk("one", config.roster.players[0]), mk("two", config.roster.players[1])];
  return { config, seats: new Map(seats), attempts: [], turn: "one", phase: "configuring" };
}

export function start(s: Session & { phase: "configuring" }): ActiveSession {
  return { ...s, phase: "active" };
}

export function finish(s: ActiveSession): Session & { phase: "complete" } {
  return { ...s, phase: "complete" };
}

/** Generate the next challenge for the active seat. */
export function nextChallenge(s: ActiveSession, rng: Rng): Challenge {
  const seat = s.seats.get(s.turn)!;
  return s.config.scheduler.next(seat.level, rng);
}

export interface TurnResult {
  readonly outcome: Outcome;
  readonly levelChange: LevelOutcome;
  readonly nextSeat: Seat;
}

/** Grade, update the active seat's mastery/level/score, append an attempt, advance turn. Pure. */
export function submit(s: ActiveSession, challenge: Challenge, response: Response, now: number): { session: ActiveSession; result: TurnResult } {
  const seat = s.turn;
  const sp = s.seats.get(seat)!;
  const outcome = grade(challenge.answer, response, s.config.graders);

  const prev = sp.mastery.get(challenge.skill) ?? emptyMastery;
  const m = recordOutcome(prev, outcome, now);
  const levelChange = s.config.policy.evaluate(sp.level, m);
  const level = levelChange === "advance" ? nextLevel(sp.level) : sp.level;

  const mastery = new Map(sp.mastery);
  mastery.set(challenge.skill, m);

  const seats = new Map(s.seats);
  seats.set(seat, { ...sp, level, mastery, score: sp.score + (outcome === "correct" ? 1 : 0) });

  const nextSeat: Seat = s.config.roster.kind === "versus" ? (seat === "one" ? "two" : "one") : "one";
  const attempt: Attempt = { at: now, seat, skill: challenge.skill, level: sp.level, response, outcome };

  return {
    session: { ...s, seats, attempts: [...s.attempts, attempt], turn: nextSeat },
    result: { outcome, levelChange, nextSeat },
  };
}
```

---

## 11. Persistence — `packages/lessons/src/persistence.ts`

```ts
import { z } from "zod";
import type { Level, PlayerName, Result, SaveKey, SkillId } from "./ids.js";
import { err, ok } from "./ids.js";
import type { Mastery } from "./progression.js";

/** Durable per-player snapshot. NOT a session — resume = load Progress, then `configure(..., resume)`. */
export interface Progress {
  readonly player: PlayerName;
  readonly levels: ReadonlyMap<SkillId, Level>;
  readonly mastery: ReadonlyMap<SkillId, Mastery>;
  readonly highScore: number;
  readonly updatedAt: number;
}

export type StoreError =
  | { kind: "io"; cause: unknown }
  | { kind: "decode"; detail: string }
  | { kind: "unsupported"; found: number };

/** Async by design (idiomatic JS; keeps IndexedDB/remote backends open at zero cost). */
export interface ProgressStore {
  load(key: SaveKey): Promise<Result<Progress | null, StoreError>>;
  save(key: SaveKey, progress: Progress): Promise<Result<void, StoreError>>;
  list(): Promise<Result<readonly SaveKey[], StoreError>>;
  delete(key: SaveKey): Promise<Result<void, StoreError>>;
}

// ---- Versioned wire format. Maps are stored as arrays of entries (zod-version-stable). ----
const MasteryDTO = z.object({
  attempts: z.number(),
  correct: z.number(),
  streak: z.number(),
  bestStreak: z.number(),
  lastSeen: z.number().nullable(),
});

const SaveV1 = z.object({
  version: z.literal(1),
  player: z.string(),
  highScore: z.number(),
  updatedAt: z.number(),
  levels: z.array(z.tuple([z.string(), z.number()])),
  mastery: z.array(z.tuple([z.string(), MasteryDTO])),
});

const SaveEnvelope = z.discriminatedUnion("version", [SaveV1 /* , SaveV2, ... */]);
type SaveV1Type = z.infer<typeof SaveV1>;

export function encodeSave(p: Progress): SaveV1Type {
  return {
    version: 1,
    player: p.player,
    highScore: p.highScore,
    updatedAt: p.updatedAt,
    levels: [...p.levels].map(([k, v]) => [k, v] as [string, number]),
    mastery: [...p.mastery].map(([k, v]) => [k, v] as [string, Mastery]),
  };
}

export function decodeSave(raw: unknown): Result<Progress, StoreError> {
  const parsed = SaveEnvelope.safeParse(raw);
  if (!parsed.success) {
    const v = (raw as { version?: unknown } | null)?.version;
    if (typeof v === "number" && v > 1) return err({ kind: "unsupported", found: v });
    return err({ kind: "decode", detail: parsed.error.message });
  }
  return ok(fromV1(parsed.data)); // future: switch on parsed.data.version, migrate V1→Vn
}

function fromV1(d: SaveV1Type): Progress {
  return {
    player: d.player as PlayerName,
    levels: new Map(d.levels.map(([k, v]) => [k as SkillId, v as Level])),
    mastery: new Map(d.mastery.map(([k, v]) => [k as SkillId, v])),
    highScore: d.highScore,
    updatedAt: d.updatedAt,
  };
}

/** Reference store: in-memory, fully serializing through JSON so it catches non-serializable bugs. */
export class InMemoryProgressStore implements ProgressStore {
  private readonly map = new Map<string, unknown>();
  async load(key: SaveKey): Promise<Result<Progress | null, StoreError>> {
    const raw = this.map.get(key);
    return raw === undefined ? ok(null) : decodeSave(raw);
  }
  async save(key: SaveKey, p: Progress): Promise<Result<void, StoreError>> {
    this.map.set(key, JSON.parse(JSON.stringify(encodeSave(p))));
    return ok(undefined);
  }
  async list(): Promise<Result<readonly SaveKey[], StoreError>> {
    return ok([...this.map.keys()] as SaveKey[]);
  }
  async delete(key: SaveKey): Promise<Result<void, StoreError>> {
    this.map.delete(key);
    return ok(undefined);
  }
}
```

### 11.4 Runtime adapter boundary (lives outside `@learn-engine/lessons`)

The fs and IndexedDB stores implement the same interface. The Node fs adapter (used by the example in §12):

```ts
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { type ProgressStore, type Progress, type StoreError, decodeSave, encodeSave } from "@learn-engine/lessons";
import { type SaveKey, type Result, ok, err } from "@learn-engine/lessons";

export class FileProgressStore implements ProgressStore {
  constructor(private readonly dir: string) {}
  private path(key: SaveKey): string { return join(this.dir, `${encodeURIComponent(key)}.json`); }

  async load(key: SaveKey): Promise<Result<Progress | null, StoreError>> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.path(key), "utf8"));
      return decodeSave(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return ok(null);
      return err({ kind: "io", cause: e });
    }
  }
  async save(key: SaveKey, p: Progress): Promise<Result<void, StoreError>> {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.path(key), JSON.stringify(encodeSave(p)), "utf8");
      return ok(undefined);
    } catch (e) { return err({ kind: "io", cause: e }); }
  }
  async list(): Promise<Result<readonly SaveKey[], StoreError>> {
    try {
      const files = await readdir(this.dir);
      return ok(files.filter((f) => f.endsWith(".json")).map((f) => decodeURIComponent(f.slice(0, -5)) as SaveKey));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return ok([]);
      return err({ kind: "io", cause: e });
    }
  }
  async delete(key: SaveKey): Promise<Result<void, StoreError>> {
    try { await unlink(this.path(key)); return ok(undefined); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return ok(undefined); return err({ kind: "io", cause: e }); }
  }
}
```

The browser adapter wraps IndexedDB (e.g. via `idb`) behind the identical interface; the engine never knows which is in use.

### 11.5 Barrel — `packages/lessons/src/index.ts`

```ts
export * from "./ids.js";
export * from "./grading.js";
export * from "./generation.js";
export * from "./progression.js";
export * from "./session.js";
export * from "./content.js";
export * from "./i18n.js";
export * from "./persistence.js";
```

---

## 12. Building a game on the library (the developer SDK)

This is the primary use case: a developer creates a **new package** that depends on `@learn-engine/lessons` and assembles a game from the primitives. They never fork the library.

### 12.1 The seven steps

1. **New package** that depends on `@learn-engine/lessons`.
2. **Author a ContentPack** (YAML/JSON) describing skills + curriculum, and **locale files** (ICU strings) for copy.
3. **Provide content** — either implement `ChallengeSource`(s) for *generated* problems, or (later) ship item banks. Custom grading uses a `GraderRegistry`.
4. **Choose a `ProgressStore`** — `InMemoryProgressStore` to start; `FileProgressStore`/IndexedDB later. No code change above the interface.
5. **Build a `Localizer`** from the locale bundles + the pack's default locale.
6. **Configure a `Session`** from a `Roster`, `Scheduler`, and `ProgressionPolicy`.
7. **Drive the loop** headlessly: `nextChallenge → localize prompt → collect input → submit → persist`. Rendering plugs in later via the graphics spine; the loop itself is renderer-free.

### 12.2 Extension points

| Want to… | Implement / supply | Code or data? |
|---|---|---|
| Add a new problem generator | `ChallengeSource` | code |
| Change advancement rules | `ProgressionPolicy` | code |
| Add a bespoke grader (e.g. "anagram of") | `Grader` in a `GraderRegistry`, referenced by `{kind:"custom", graderId}` | code |
| Swap storage backend | `ProgressStore` | code |
| Add skills / curriculum / difficulty bands | ContentPack YAML | **data** |
| Add a language / change copy | locale file | **data** |

The built-in `AnswerSpec` kinds are a **closed** union (so `grade` stays exhaustively checked); the `custom` variant + registry is the deliberate open seam for developer-defined grading.

### 12.3 Worked example — `apps/examples/addition-drill`

`apps/examples/addition-drill/package.json`

```json
{
  "name": "@learn-engine/example-addition",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "play": "tsx src/play.ts" },
  "dependencies": { "@learn-engine/lessons": "workspace:*", "yaml": "^2.6.0" },
  "devDependencies": { "tsx": "^4.19.0", "vitest": "^2.1.0" }
}
```

`apps/examples/addition-drill/content/pack.yaml`

```yaml
id: addition-drill
schemaVersion: 1
defaultLocale: en
locales: [en, es]
skills:
  - id: math.add
    title: content.math.add.title
    prereqs: []
    minLevel: 0
    maxLevel: 10
```

`apps/examples/addition-drill/content/en.json`

```json
{
  "content.math.add.title": "Addition",
  "math.add.prompt": "What is {a} + {b}?",
  "ui.feedback": "{outcome, select, correct {Correct!} other {Not quite.}}",
  "ui.score": "{name}: {score, plural, one {# point} other {# points}}"
}
```

`apps/examples/addition-drill/content/es.json`

```json
{
  "content.math.add.title": "Suma",
  "math.add.prompt": "¿Cuánto es {a} + {b}?",
  "ui.feedback": "{outcome, select, correct {¡Correcto!} other {No exactamente.}}",
  "ui.score": "{name}: {score, plural, one {# punto} other {# puntos}}"
}
```

`apps/examples/addition-drill/src/source.ts` — a developer-authored `ChallengeSource`:

```ts
import type { ChallengeSource, Challenge, Level, Rng, SkillId } from "@learn-engine/lessons";

export const ADD = "math.add" as SkillId;

export class AdditionSource implements ChallengeSource {
  readonly skill = ADD;
  generate(level: Level, rng: Rng): Challenge {
    const max = 5 + level * 5; // difficulty scales with level
    const a = rng.int(0, max);
    const b = rng.int(0, max);
    return {
      skill: this.skill,
      level,
      prompt: { key: "math.add.prompt", params: { a, b }, big: true },
      answer: { kind: "integer", value: a + b },
    };
  }
}
```

`apps/examples/addition-drill/src/play.ts` — headless turn loop (deterministic; persists + resumes):

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  Localizer, Scheduler, configure, decodeSave, encodeSave, makeRng, nextChallenge, parseContentPack,
  parsePlayerName, saveKeyForPlayer, start, streakPolicy, submit,
  type LocaleBundle, type LocaleId, type Level, type Progress, type Response,
} from "@learn-engine/lessons";
import { AdditionSource } from "./source.js";
import { FileProgressStore } from "./file-store.js"; // the §11.4 adapter, vendored into the example

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

async function main(): Promise<void> {
  // 2/5. content pack + locales
  const pack = parseContentPack(parseYaml(await readFile(here("../content/pack.yaml"), "utf8")));
  if (!pack.ok) throw new Error(`content: ${JSON.stringify(pack.error)}`);
  const bundles: LocaleBundle[] = await Promise.all(
    pack.value.locales.map(async (l) => ({
      locale: l,
      messages: JSON.parse(await readFile(here(`../content/${l}.json`), "utf8")) as Record<string, string>,
    })),
  );
  const i18n = new Localizer(bundles, pack.value.defaultLocale);
  const locale = "en" as LocaleId;

  // 1/4. player + store (+ resume if a save exists)
  const name = parsePlayerName("Ada");
  if (!name.ok) throw new Error("bad name");
  const store = new FileProgressStore(here("../.saves"));
  const key = saveKeyForPlayer(name.value);
  const loaded = await store.load(key);
  const resume =
    loaded.ok && loaded.value
      ? new Map([["one", { level: (loaded.value.levels.get(AdditionSource.prototype.skill ?? ("math.add" as never)) ?? 0) as Level, mastery: loaded.value.mastery }]] as const)
      : undefined;

  // 6. configure session
  const session0 = start(
    configure({
      roster: { kind: "solo", player: { name: name.value } },
      scheduler: new Scheduler([{ source: new AdditionSource(), weight: 1 }]),
      policy: streakPolicy(3),
      startLevel: 0 as Level,
    }, resume as never),
  );

  // 7. deterministic headless loop — an auto-player that always answers correctly
  const rng = makeRng(1234);
  let session = session0;
  for (let turn = 0; turn < 5; turn++) {
    const challenge = nextChallenge(session, rng);
    console.log(i18n.format(challenge.prompt.key, locale, challenge.prompt.params));
    const correctAnswer = (challenge.answer.kind === "integer" ? challenge.answer.value : 0);
    const response: Response = { kind: "number", value: correctAnswer };
    const out = submit(session, challenge, response, Date.now());
    session = out.session;
    console.log(i18n.format("ui.feedback", locale, { outcome: out.result.outcome }));
  }

  // persist
  const seat = session.seats.get("one")!;
  const progress: Progress = {
    player: name.value,
    levels: new Map([[AdditionSource.prototype.skill ?? ("math.add" as never), seat.level]]),
    mastery: seat.mastery,
    highScore: seat.score,
    updatedAt: Date.now(),
  };
  await store.save(key, progress);
  console.log(i18n.format("ui.score", locale, { name: name.value, score: seat.score }));
}

void main();
```

> The example shows the full surface end-to-end: data-driven content, a custom generator, ICU-localized prompts/feedback, a swappable store, and save→resume — **without a single line of rendering code**. That separation is the point: a game author can build and test all their pedagogy headlessly, then add the graphics spine on top.

---

## 13. Acceptance criteria

**Identity & grading**
- **AC-1** `parsePlayerName` accepts 1–24 code points (trimmed) and rejects empty/over-long; other parse fns enforce their formats and return typed `IdError`s.
- **AC-2** `grade` is total over the union; `integer` requires an integer numeric response equal to the target; `decimal` honors `tolerance`; `word` honors `trim`/`caseSensitive` against the accepted list; `choice` matches index.
- **AC-3** `grade` fails closed: a response of the wrong shape, or a `custom` spec with an unregistered `graderId`, returns `"incorrect"` (never throws, never "correct").
- **AC-4** A registered custom grader is invoked and its verdict returned.

**Generation & progression**
- **AC-5** `makeRng(seed)` is deterministic: identical seeds yield identical sequences; `int` stays within `[min,max]`.
- **AC-6** A `ChallengeSource` is deterministic given a fixed `Rng`; difficulty parameters scale with `level`.
- **AC-7** `Scheduler` selects sources in proportion to weights (within statistical tolerance over many seeded draws); zero-or-negative total weights throw at construction.
- **AC-8** `recordOutcome` increments attempts, tracks streak/bestStreak, resets streak on incorrect, and stamps `lastSeen`; `streakPolicy`/`accuracyWindowPolicy` advance exactly at their thresholds.

**Session**
- **AC-9** Transition functions are phase-typed: calling `submit` on a `configuring` session is a **compile error** (verified with `@ts-expect-error`).
- **AC-10** `submit` grades, updates the active seat's mastery/level/score, appends one `Attempt`, and advances the turn (solo stays `"one"`; versus alternates).
- **AC-11** `configure(config, resume)` seeds per-seat level/mastery/score from a resume map when provided, else from `startLevel`/empty.

**Content & i18n**
- **AC-12** `parseContentPack` rejects schema-invalid input, invalid ids, unknown prereqs, and curriculum **cycles** (returning the cycle path), and accepts a valid pack into branded domain types.
- **AC-13** `Localizer.format` resolves ICU messages (plural/select) and walks the fallback chain (`es-MX → es → default`); a missing key returns the key and fires `onMissing`.
- **AC-14** `parseLocaleNumber` parses `"1,234.56"` (en) and `"1.234,56"` (de) to `1234.56`, and returns `null` for non-numeric input.

**Persistence**
- **AC-15** `encodeSave`/`decodeSave` round-trip a `Progress` value losslessly (maps preserved).
- **AC-16** `decodeSave` returns `{kind:"unsupported", found}` for a higher `version`, and `{kind:"decode"}` for malformed data — never throws.
- **AC-17** `InMemoryProgressStore` and `FileProgressStore` implement the full `ProgressStore` contract; `load` of an absent key returns `ok(null)`; save→load round-trips; `FileProgressStore.load` returns `ok(null)` on `ENOENT`, not an error.

**Toolchain / quality**
- **AC-18** `tsc -b` passes under the strict base config (no `any`).
- **AC-19** `@learn-engine/lessons` declares no `react`, `ink`, or `node:fs` dependency (enforced by §10.7 test).
- **AC-20** The example game (§12.3) runs headlessly to completion, localizes prompts/feedback, and persists then resumes a save.

---

## 14. Detailed testing steps

Run from the repository root.

1. **Install**
   ```bash
   pnpm install
   ```
   *Expected:* clean install; `zod`, `intl-messageformat`, `fast-check`, `yaml` resolved.

2. **Typecheck (AC-9, AC-18)**
   ```bash
   pnpm typecheck
   ```
   *Expected:* exit 0. The `@ts-expect-error` in the session test (below) must remain an error, proving the phase typing.

3. **Build**
   ```bash
   pnpm build
   ```
   *Expected:* `packages/lessons/dist` populated with `.js` + `.d.ts`.

4. **Pure unit + property suite (AC-1 … AC-17, AC-19)**
   ```bash
   pnpm test
   ```
   Representative tests to author (`packages/lessons/src/*.test.ts`):

   - `grading.test.ts` — every `AnswerSpec` kind incl. fail-closed and custom-registry cases (AC-2/3/4).
   - `generation.test.ts` — RNG determinism (two `makeRng(7)` produce equal sequences); `Scheduler` weight distribution over 10k seeded draws within ±3% (AC-5/6/7).
   - `progression.test.ts` — streak/accuracy folding and both policies' thresholds (AC-8).
   - `session.test.ts` — `submit` effects + turn alternation, plus:
     ```ts
     // @ts-expect-error — submit requires an ActiveSession, not a configuring one (AC-9)
     submit(configure(cfg), challenge, response, 0);
     ```
   - `content.test.ts` — valid pack parses; a pack with `prereqs: [b]`, `b` with `prereqs: [a]`, `a` with `prereqs: [b]` returns `{kind:"cycle"}`; unknown prereq and bad id rejected (AC-12).
   - `i18n.test.ts` — ICU plural/select format; fallback `es-MX`→`es`; missing key returns key + `onMissing` fires; `parseLocaleNumber` for `en`/`de` (AC-13/14).
   - `persistence.test.ts` — encode/decode round-trip; `version: 2` → `unsupported`; garbage → `decode`; `InMemoryProgressStore` CRUD incl. absent-key `ok(null)` (AC-15/16/17).
   - `no-render-deps.test.ts` — assert `@learn-engine/lessons` package.json has no `react`/`ink`/`node:fs` dep (AC-19).

   *Expected:* all green.

5. **Run the example game headlessly (AC-20)**
   ```bash
   pnpm --filter @learn-engine/example-addition play
   ```
   *Expected:* five localized prompts (`What is a + b?`), each followed by `Correct!`, then `Ada: 5 points`. A `.saves/player%3AAda.json` file appears under the example dir.

6. **Verify save→resume (AC-11, AC-17)**
   ```bash
   pnpm --filter @learn-engine/example-addition play   # run a second time
   cat apps/examples/addition-drill/.saves/*.json
   ```
   *Expected:* the second run loads the prior save (resume path taken — confirm the starting level reflects prior advancement if a streak was reached), and the JSON shows `version: 1`, the player, and the levels/mastery entry arrays.

7. **Switch the store with no domain change (AC-17)**
   Temporarily replace `new FileProgressStore(...)` with `new InMemoryProgressStore()` in `play.ts`, re-run step 5.
   *Expected:* identical gameplay output; no file written. Demonstrates the store is a swappable seam.

8. **Localization spot check (AC-13)**
   Change `const locale = "en"` to `"es"` in `play.ts`, re-run.
   *Expected:* prompts read `¿Cuánto es a + b?`, feedback `¡Correcto!`, score `Ada: 5 puntos` (correct Spanish plural via ICU).

---

## 15. Definition of Done

- All modules in §4–§11 exist; `pnpm typecheck && pnpm build && pnpm test` pass.
- The example game (§12.3) runs, localizes, and persists/resumes (steps 5–6).
- AC-1 … AC-20 hold.
- `@learn-engine/lessons` has zero `react`/`ink`/`node:fs` dependencies; all I/O is behind the `ProgressStore` interface or an injected loader.

---

## 16. Forward-compatibility notes (what plugs in later)

- **Item banks** — a second `ChallengeSource` implementation that draws from authored items in the ContentPack instead of generating, using the same `Challenge`/`grade` path.
- **Spaced repetition** — a scheduler that orders skills by `Mastery.lastSeen` + an interval (SM-2-ish). The save format already carries `lastSeen`, so no migration is needed to start collecting the signal.
- **Event-sourced progress** — persist the `Attempt[]` log and derive `Progress` by replay, instead of (or alongside) snapshotting. The `Attempt` type is already the event.
- **Rendering** — lesson widgets consume `PromptSpec` + `Localizer` + `Session`/`TurnResult` and draw via the graphics spine. The lesson layer emits data; the widgets are a separate workstream that depends on both this package and the spine.
- **`@learn-engine/lessons-node`** — extract `FileProgressStore` + a YAML ContentPack loader out of the example into a published runtime adapter once a second game needs them.
