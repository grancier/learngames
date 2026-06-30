import type {
  Challenge,
  ChallengeSource,
  Level,
  Rng,
  SkillId,
} from "@learn-engine/lessons";

/** The skill id this generator produces challenges for. Exported for reuse (e.g. resume mapping). */
export const ADD = "math.add" as SkillId;

/** A developer-authored generator: addition problems whose operands scale with the level. */
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
