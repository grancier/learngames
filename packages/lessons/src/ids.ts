export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

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

/** Parse a display name: 1–24 code points after trimming. */
export function parsePlayerName(raw: string): Result<PlayerName, IdError> {
  const t = raw.trim();
  const len = [...t].length; // count code points, not UTF-16 units
  return len >= 1 && len <= 24
    ? ok(t as PlayerName)
    : err({ kind: "playerName", len });
}

/** Parse a difficulty level: a non-negative integer. */
export function parseLevel(n: number): Result<Level, IdError> {
  return Number.isInteger(n) && n >= 0
    ? ok(n as Level)
    : err({ kind: "level", value: n });
}

/** Parse a skill id: a slug like "math.add". */
export function parseSkillId(s: string): Result<SkillId, IdError> {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(s)
    ? ok(s as SkillId)
    : err({ kind: "skillId", value: s });
}

/** Parse a BCP-47-ish locale tag, e.g. "en" or "es-MX". */
export function parseLocaleId(s: string): Result<LocaleId, IdError> {
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(s)
    ? ok(s as LocaleId)
    : err({ kind: "localeId", value: s });
}

export const nextLevel = (l: Level): Level => (l + 1) as Level;
export const saveKeyForPlayer = (name: PlayerName): SaveKey =>
  `player:${name}` as SaveKey;
