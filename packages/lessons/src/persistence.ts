import { z } from "zod";
import {
  type Level,
  type PlayerName,
  type Result,
  type SaveKey,
  type SkillId,
  err,
  ok,
  parseLevel,
  parsePlayerName,
  parseSkillId,
} from "./ids.js";
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
// Field-level invariants (non-negative integers) are enforced here at the parse edge; the
// cross-field invariant (correct <= attempts) is checked in `fromV1`.
const MasteryDTO = z.object({
  attempts: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  streak: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
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

const SaveEnvelope = z.discriminatedUnion("version", [
  SaveV1 /* , SaveV2, ... */,
]);
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
    if (typeof v === "number" && v > 1)
      return err({ kind: "unsupported", found: v });
    return err({ kind: "decode", detail: parsed.error.message });
  }
  return fromV1(parsed.data); // future: switch on parsed.data.version, migrate V1→Vn
}

/**
 * Map a validated V1 DTO into the domain, RE-PARSING every branded field through its parser
 * rather than blind-casting untrusted save bytes, and checking the cross-field mastery invariant.
 */
function fromV1(d: SaveV1Type): Result<Progress, StoreError> {
  const player = parsePlayerName(d.player);
  if (!player.ok) {
    return err({ kind: "decode", detail: `invalid player name: ${d.player}` });
  }

  const levels = new Map<SkillId, Level>();
  for (const [k, v] of d.levels) {
    const id = parseSkillId(k);
    if (!id.ok)
      return err({ kind: "decode", detail: `invalid skill id: ${k}` });
    const lvl = parseLevel(v);
    if (!lvl.ok) return err({ kind: "decode", detail: `invalid level: ${v}` });
    levels.set(id.value, lvl.value);
  }

  const mastery = new Map<SkillId, Mastery>();
  for (const [k, m] of d.mastery) {
    const id = parseSkillId(k);
    if (!id.ok)
      return err({ kind: "decode", detail: `invalid skill id: ${k}` });
    if (m.correct > m.attempts) {
      return err({
        kind: "decode",
        detail: `mastery correct>attempts for ${k}`,
      });
    }
    mastery.set(id.value, m);
  }

  return ok({
    player: player.value,
    levels,
    mastery,
    highScore: d.highScore,
    updatedAt: d.updatedAt,
  });
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
