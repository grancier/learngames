import { z } from "zod";
import {
  type Level,
  type LocaleId,
  type Result,
  type SkillId,
  err,
  ok,
  parseLocaleId,
  parseSkillId,
} from "./ids.js";

// ---- Wire DTO (what a YAML/JSON config deserializes to) ----
const SkillDefDTO = z.object({
  id: z.string(),
  title: z.string(), // a copy key, e.g. "content.math.add.title"
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
  | { kind: "duplicateLocale"; value: string }
  | { kind: "defaultLocaleNotListed"; value: string }
  | { kind: "duplicateSkill"; value: string }
  | { kind: "levelRange"; skill: string; minLevel: number; maxLevel: number }
  | { kind: "unknownPrereq"; skill: string; prereq: string }
  | { kind: "cycle"; cycle: readonly string[] };

/** Parse boundary: untrusted config → validated ContentPack, with curriculum-DAG checks. */
export function parseContentPack(
  raw: unknown,
): Result<ContentPack, ContentError> {
  const parsed = ContentPackDTO.safeParse(raw);
  if (!parsed.success) {
    return err({ kind: "schema", detail: parsed.error.message });
  }
  const dto = parsed.data;

  const defaultLocale = parseLocaleId(dto.defaultLocale);
  if (!defaultLocale.ok) {
    return err({ kind: "invalidId", value: dto.defaultLocale });
  }

  const locales: LocaleId[] = [];
  const seenLocales = new Set<string>();
  for (const l of dto.locales) {
    const p = parseLocaleId(l);
    if (!p.ok) return err({ kind: "invalidId", value: l });
    if (seenLocales.has(p.value)) {
      return err({ kind: "duplicateLocale", value: l });
    }
    seenLocales.add(p.value);
    locales.push(p.value);
  }
  if (!locales.includes(defaultLocale.value)) {
    return err({ kind: "defaultLocaleNotListed", value: dto.defaultLocale });
  }

  const skills = new Map<SkillId, SkillDef>();
  for (const s of dto.skills) {
    const id = parseSkillId(s.id);
    if (!id.ok) return err({ kind: "invalidId", value: s.id });
    if (skills.has(id.value)) {
      return err({ kind: "duplicateSkill", value: s.id });
    }
    if (s.minLevel > s.maxLevel) {
      return err({
        kind: "levelRange",
        skill: s.id,
        minLevel: s.minLevel,
        maxLevel: s.maxLevel,
      });
    }
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
      if (!skills.has(p)) {
        return err({ kind: "unknownPrereq", skill: skill.id, prereq: p });
      }
    }
  }

  // DAG: detect cycles via DFS
  const cycle = findCycle(skills);
  if (cycle) return err({ kind: "cycle", cycle });

  return ok({
    id: dto.id,
    defaultLocale: defaultLocale.value,
    locales,
    skills,
  });
}

function findCycle(
  skills: ReadonlyMap<SkillId, SkillDef>,
): readonly string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<SkillId, number>(
    [...skills.keys()].map((k) => [k, WHITE]),
  );
  const stack: SkillId[] = [];

  const visit = (id: SkillId): readonly string[] | null => {
    color.set(id, GRAY);
    stack.push(id);
    const def = skills.get(id) as SkillDef;
    for (const dep of def.prereqs) {
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
