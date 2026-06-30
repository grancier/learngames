import type { AnswerSpec } from "./grading.js";
import type { Level, SkillId } from "./ids.js";

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
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) {
        throw new Error("pick from empty array");
      }
      return items[Math.floor(next() * items.length)] as T;
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

type WeightedEntry = {
  readonly source: ChallengeSource;
  readonly weight: number;
};

/** Weighted selection across multiple sources. */
export class Scheduler {
  private readonly entries: readonly WeightedEntry[];
  private readonly total: number;

  constructor(
    entries: ReadonlyArray<{ source: ChallengeSource; weight: number }>,
  ) {
    if (entries.length === 0) {
      throw new Error("Scheduler requires at least one source");
    }
    const cleaned = entries.map((e) => ({
      source: e.source,
      weight: Math.max(0, e.weight),
    }));
    this.total = cleaned.reduce((a, e) => a + e.weight, 0);
    if (this.total <= 0) {
      throw new Error("Scheduler weights must sum to > 0");
    }
    this.entries = cleaned;
  }

  next(level: Level, rng: Rng): Challenge {
    let r = rng.float() * this.total;
    for (const e of this.entries) {
      r -= e.weight;
      if (r < 0) return e.source.generate(level, rng);
    }
    // Defensive: float rounding could leave r >= 0 after the last subtraction.
    const last = this.entries[this.entries.length - 1] as WeightedEntry;
    return last.source.generate(level, rng);
  }

  sources(): readonly ChallengeSource[] {
    return this.entries.map((e) => e.source);
  }
}
