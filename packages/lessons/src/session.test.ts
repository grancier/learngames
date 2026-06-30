import { describe, expect, it } from "vitest";
import {
  type Challenge,
  type ChallengeSource,
  type Rng,
  Scheduler,
} from "./generation.js";
import type { Response } from "./grading.js";
import type { Level, PlayerName, SkillId } from "./ids.js";
import { type Mastery, streakPolicy } from "./progression.js";
import {
  type Roster,
  type Seat,
  type SeatProgress,
  type SessionConfig,
  configure,
  finish,
  nextChallenge,
  start,
  submit,
} from "./session.js";

const SKILL = "math.add" as SkillId;
const L = (n: number): Level => n as Level;

class FixedSource implements ChallengeSource {
  readonly skill = SKILL;
  generate(level: Level): Challenge {
    return {
      skill: this.skill,
      level,
      prompt: { key: "math.add.prompt" },
      answer: { kind: "integer", value: 4 },
    };
  }
}

const cfg = (roster: Roster): SessionConfig => ({
  roster,
  scheduler: new Scheduler([{ source: new FixedSource(), weight: 1 }]),
  policy: streakPolicy(2),
  startLevel: L(0),
});

const solo: SessionConfig = cfg({
  kind: "solo",
  player: { name: "Ada" as PlayerName },
});
const versus: SessionConfig = cfg({
  kind: "versus",
  players: [{ name: "Ada" as PlayerName }, { name: "Bo" as PlayerName }],
});

const correct: Response = { kind: "number", value: 4 };
const wrong: Response = { kind: "number", value: 0 };
const challenge: Challenge = {
  skill: SKILL,
  level: L(0),
  prompt: { key: "math.add.prompt" },
  answer: { kind: "integer", value: 4 },
};

describe("session lifecycle", () => {
  it("transitions configuring → active → complete", () => {
    const c = configure(solo);
    expect(c.phase).toBe("configuring");
    const a = start(c);
    expect(a.phase).toBe("active");
    expect(finish(a).phase).toBe("complete");
  });

  it("nextChallenge generates for the active seat's level", () => {
    const a = start(configure(solo));
    expect(nextChallenge(a, makeStubRng()).skill).toBe(SKILL);
  });
});

describe("submit (solo)", () => {
  it("grades, updates mastery/score, appends one attempt, holds the turn", () => {
    const a = start(configure(solo));
    const { session, result } = submit(a, challenge, correct, 1000);

    expect(result.outcome).toBe("correct");
    expect(result.levelChange).toBe("hold"); // streak 1 < 2
    expect(result.nextSeat).toBe("one");
    expect(session.attempts).toHaveLength(1);
    const sp = session.seats.get("one") as SeatProgress;
    expect(sp.score).toBe(1);
    expect(sp.mastery.get(SKILL)?.streak).toBe(1);
    expect(sp.level).toBe(0);
  });

  it("advances the level once the streak policy is satisfied", () => {
    let s = start(configure(solo));
    s = submit(s, challenge, correct, 1).session; // streak 1 → hold
    const out = submit(s, challenge, correct, 2); // streak 2 → advance
    expect(out.result.levelChange).toBe("advance");
    expect((out.session.seats.get("one") as SeatProgress).level).toBe(1);
  });

  it("an incorrect answer scores nothing and resets the streak", () => {
    const a = start(configure(solo));
    const { session, result } = submit(a, challenge, wrong, 5);
    expect(result.outcome).toBe("incorrect");
    const sp = session.seats.get("one") as SeatProgress;
    expect(sp.score).toBe(0);
    expect(sp.mastery.get(SKILL)?.streak).toBe(0);
  });
});

describe("submit (versus)", () => {
  it("alternates the turn between seats", () => {
    const a = start(configure(versus));
    const first = submit(a, challenge, correct, 1);
    expect(first.result.nextSeat).toBe("two");
    const second = submit(first.session, challenge, wrong, 2);
    expect(second.result.nextSeat).toBe("one");
    // each seat scored independently
    expect((second.session.seats.get("one") as SeatProgress).score).toBe(1);
    expect((second.session.seats.get("two") as SeatProgress).score).toBe(0);
  });
});

describe("configure resume", () => {
  it("uses startLevel/empty defaults when no resume is given", () => {
    const sp = configure(solo).seats.get("one") as SeatProgress;
    expect(sp.level).toBe(0);
    expect(sp.score).toBe(0);
    expect(sp.mastery.size).toBe(0);
  });

  it("seeds per-seat level/mastery/score from a resume map", () => {
    const mastery: ReadonlyMap<SkillId, Mastery> = new Map([
      [
        SKILL,
        { attempts: 4, correct: 3, streak: 1, bestStreak: 2, lastSeen: 9 },
      ],
    ]);
    const resume: ReadonlyMap<Seat, Partial<SeatProgress>> = new Map([
      ["one", { level: L(3), mastery, score: 5 }],
    ]);
    const sp = configure(solo, resume).seats.get("one") as SeatProgress;
    expect(sp.level).toBe(3);
    expect(sp.score).toBe(5);
    expect(sp.mastery.get(SKILL)?.correct).toBe(3);
  });
});

describe("phase typing", () => {
  it("rejects submit on a configuring session at compile time (AC-9)", () => {
    const configuring = configure(solo);
    // @ts-expect-error — submit requires an ActiveSession, not a configuring one
    submit(configuring, challenge, correct, 0);
    expect(configuring.phase).toBe("configuring");
  });
});

function makeStubRng(): Rng {
  return {
    float: () => 0,
    int: () => 0,
    pick: <T>(xs: readonly T[]): T => xs[0] as T,
  };
}
