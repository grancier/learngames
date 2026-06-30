import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type Challenge,
  type ChallengeSource,
  type Rng,
  Scheduler,
  makeRng,
} from "./generation.js";
import type { Level, SkillId } from "./ids.js";

const L = (n: number): Level => n as Level;
const ADD = "math.add" as SkillId;
const SUB = "math.sub" as SkillId;

class StubSource implements ChallengeSource {
  constructor(readonly skill: SkillId) {}
  generate(level: Level, rng: Rng): Challenge {
    const max = 5 + level * 5; // difficulty scales with level
    const a = rng.int(0, max);
    return {
      skill: this.skill,
      level,
      prompt: { key: "stub.prompt", params: { a } },
      answer: { kind: "integer", value: a },
    };
  }
}

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(7);
    const b = makeRng(7);
    expect([a.float(), a.float(), a.float()]).toEqual([
      b.float(),
      b.float(),
      b.float(),
    ]);
  });

  it("keeps int within [min,max] for arbitrary seeds and bounds", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (seed, x, y) => {
          const min = Math.min(x, y);
          const max = Math.max(x, y);
          const rng = makeRng(seed);
          for (let i = 0; i < 20; i++) {
            const v = rng.int(min, max);
            if (v < min || v > max) return false;
          }
          return true;
        },
      ),
    );
  });

  it("pick returns an element and throws on empty", () => {
    const rng = makeRng(1);
    expect([10, 20, 30]).toContain(rng.pick([10, 20, 30]));
    expect(() => rng.pick([])).toThrow(/empty/);
  });
});

describe("Scheduler construction", () => {
  it("rejects empty entries and non-positive total weight", () => {
    expect(() => new Scheduler([])).toThrow(/at least one/);
    expect(
      () => new Scheduler([{ source: new StubSource(ADD), weight: 0 }]),
    ).toThrow(/> 0/);
    // negative weights clamp to 0 → total 0 → throws
    expect(
      () => new Scheduler([{ source: new StubSource(ADD), weight: -3 }]),
    ).toThrow(/> 0/);
  });
});

describe("Scheduler selection", () => {
  it("selects sources in proportion to weights (seeded, deterministic)", () => {
    const sched = new Scheduler([
      { source: new StubSource(ADD), weight: 3 },
      { source: new StubSource(SUB), weight: 1 },
    ]);
    const rng = makeRng(12345);
    const N = 20000;
    let add = 0;
    for (let i = 0; i < N; i++) {
      if (sched.next(L(0), rng).skill === ADD) add++;
    }
    expect(add / N).toBeGreaterThan(0.72);
    expect(add / N).toBeLessThan(0.78);
  });

  it("exposes its sources and falls back to the last entry on rounding", () => {
    const s1 = new StubSource(ADD);
    const s2 = new StubSource(SUB);
    const sched = new Scheduler([
      { source: s1, weight: 1 },
      { source: s2, weight: 1 },
    ]);
    expect(sched.sources()).toEqual([s1, s2]);
    // A degenerate rng returning 1 keeps r ≥ 0 through the loop → exercises the fallback.
    const hot: Rng = {
      float: () => 1,
      int: () => 0,
      pick: <T>(xs: readonly T[]): T => xs[0] as T,
    };
    expect(sched.next(L(0), hot).skill).toBe(SUB);
  });
});

describe("ChallengeSource", () => {
  it("is deterministic given a fixed rng and scales difficulty with level", () => {
    const src = new StubSource(ADD);
    expect(src.generate(L(0), makeRng(99))).toEqual(
      src.generate(L(0), makeRng(99)),
    );

    const rng = makeRng(5);
    for (let i = 0; i < 50; i++) {
      const a = src.generate(L(3), rng).prompt.params?.a as number; // range [0, 20]
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(20);
    }
  });
});
