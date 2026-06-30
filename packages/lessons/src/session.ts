import type { Challenge, Rng, Scheduler } from "./generation.js";
import {
  type GraderRegistry,
  type Outcome,
  type Response,
  grade,
} from "./grading.js";
import { type Level, type PlayerName, type SkillId, nextLevel } from "./ids.js";
import {
  type LevelOutcome,
  type Mastery,
  type ProgressionPolicy,
  emptyMastery,
  recordOutcome,
} from "./progression.js";

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
export function configure(
  config: SessionConfig,
  resume?: ReadonlyMap<Seat, Partial<SeatProgress>>,
): Session & { phase: "configuring" } {
  const mk = (seat: Seat, player: Player): [Seat, SeatProgress] => {
    const r = resume?.get(seat);
    return [
      seat,
      {
        player,
        level: r?.level ?? config.startLevel,
        mastery: r?.mastery ?? new Map<SkillId, Mastery>(),
        score: r?.score ?? 0,
      },
    ];
  };
  const seats: Array<[Seat, SeatProgress]> =
    config.roster.kind === "solo"
      ? [mk("one", config.roster.player)]
      : [
          mk("one", config.roster.players[0]),
          mk("two", config.roster.players[1]),
        ];
  return {
    config,
    seats: new Map(seats),
    attempts: [],
    turn: "one",
    phase: "configuring",
  };
}

export function start(s: Session & { phase: "configuring" }): ActiveSession {
  return { ...s, phase: "active" };
}

export function finish(s: ActiveSession): Session & { phase: "complete" } {
  return { ...s, phase: "complete" };
}

/** Generate the next challenge for the active seat. */
export function nextChallenge(s: ActiveSession, rng: Rng): Challenge {
  const seat = s.seats.get(s.turn) as SeatProgress;
  return s.config.scheduler.next(seat.level, rng);
}

export interface TurnResult {
  readonly outcome: Outcome;
  readonly levelChange: LevelOutcome;
  readonly nextSeat: Seat;
}

/**
 * Grade, update the active seat's mastery/level/score, append an attempt, advance turn. Pure.
 *
 * Precondition (internal/trusted SDK boundary): `challenge` is the one currently issued for the
 * active turn — there is no anti-forgery check, by design.
 */
export function submit(
  s: ActiveSession,
  challenge: Challenge,
  response: Response,
  now: number,
): { session: ActiveSession; result: TurnResult } {
  const seat = s.turn;
  const sp = s.seats.get(seat) as SeatProgress;
  const outcome = grade(challenge.answer, response, s.config.graders);

  const prev = sp.mastery.get(challenge.skill) ?? emptyMastery;
  const m = recordOutcome(prev, outcome, now);
  const levelChange = s.config.policy.evaluate(sp.level, m);
  const level = levelChange === "advance" ? nextLevel(sp.level) : sp.level;

  const mastery = new Map(sp.mastery);
  mastery.set(challenge.skill, m);

  const seats = new Map(s.seats);
  seats.set(seat, {
    ...sp,
    level,
    mastery,
    score: sp.score + (outcome === "correct" ? 1 : 0),
  });

  const nextSeat: Seat =
    s.config.roster.kind === "versus"
      ? seat === "one"
        ? "two"
        : "one"
      : "one";
  const attempt: Attempt = {
    at: now,
    seat,
    skill: challenge.skill,
    level: sp.level,
    response,
    outcome,
  };

  return {
    session: {
      ...s,
      seats,
      attempts: [...s.attempts, attempt],
      turn: nextSeat,
    },
    result: { outcome, levelChange, nextSeat },
  };
}
