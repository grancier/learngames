import { describe, expect, it } from "vitest";
import {
  type ContentError,
  type ContentPack,
  parseContentPack,
} from "./content.js";
import type { Result, SkillId } from "./ids.js";

// Shaped to exercise every DFS branch: `c` has a forward ref (white-recurse) and a shared
// prereq `a` that is BLACK by the time `b`/`c` reach it (already-visited skip), and `a`/`b`
// are BLACK when the outer loop reaches them (outer skip).
const valid = {
  id: "addition-drill",
  schemaVersion: 1,
  defaultLocale: "en",
  locales: ["en", "es"],
  skills: [
    {
      id: "c",
      title: "content.c.title",
      prereqs: ["a", "b"],
      minLevel: 0,
      maxLevel: 9,
    },
    {
      id: "a",
      title: "content.a.title",
      prereqs: [],
      minLevel: 0,
      maxLevel: 10,
    },
    {
      id: "b",
      title: "content.b.title",
      prereqs: ["a"],
      minLevel: 1,
      maxLevel: 8,
    },
  ],
};

const errKind = (r: Result<ContentPack, ContentError>): string | null =>
  r.ok ? null : r.error.kind;

describe("parseContentPack — valid", () => {
  it("parses a valid pack into branded domain types", () => {
    const r = parseContentPack(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("addition-drill");
    expect(r.value.defaultLocale).toBe("en");
    expect([...r.value.locales]).toEqual(["en", "es"]);
    expect(r.value.skills.size).toBe(3);
    const a = r.value.skills.get("a" as SkillId);
    expect(a?.titleKey).toBe("content.a.title");
    expect(a?.minLevel).toBe(0);
    const b = r.value.skills.get("b" as SkillId);
    expect(b?.prereqs).toEqual(["a"]);
  });

  it("applies DTO defaults for omitted optional fields", () => {
    const r = parseContentPack({
      id: "p",
      schemaVersion: 1,
      defaultLocale: "en",
      locales: ["en"],
      skills: [{ id: "x", title: "t" }], // prereqs/minLevel/maxLevel omitted
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const x = r.value.skills.get("x" as SkillId);
    expect(x?.prereqs).toEqual([]);
    expect(x?.minLevel).toBe(0);
    expect(x?.maxLevel).toBe(99);
  });
});

describe("parseContentPack — rejections", () => {
  it("rejects schema-invalid input", () => {
    expect(errKind(parseContentPack({}))).toBe("schema");
    expect(errKind(parseContentPack({ ...valid, schemaVersion: 2 }))).toBe(
      "schema",
    );
  });

  it("rejects invalid defaultLocale, locale, skill id, and prereq id", () => {
    expect(errKind(parseContentPack({ ...valid, defaultLocale: "BAD!" }))).toBe(
      "invalidId",
    );
    expect(
      errKind(parseContentPack({ ...valid, locales: ["en", "BAD!"] })),
    ).toBe("invalidId");
    expect(
      errKind(
        parseContentPack({
          ...valid,
          locales: ["en"],
          skills: [
            { id: "Bad Id", title: "t", prereqs: [], minLevel: 0, maxLevel: 1 },
          ],
        }),
      ),
    ).toBe("invalidId");
    expect(
      errKind(
        parseContentPack({
          ...valid,
          locales: ["en"],
          skills: [
            {
              id: "ok",
              title: "t",
              prereqs: ["bad id"],
              minLevel: 0,
              maxLevel: 1,
            },
          ],
        }),
      ),
    ).toBe("invalidId");
  });

  it("rejects duplicate locales and an unlisted defaultLocale", () => {
    expect(errKind(parseContentPack({ ...valid, locales: ["en", "en"] }))).toBe(
      "duplicateLocale",
    );
    expect(
      errKind(
        parseContentPack({
          ...valid,
          defaultLocale: "fr",
          locales: ["en", "es"],
        }),
      ),
    ).toBe("defaultLocaleNotListed");
  });

  it("rejects duplicate skill ids and an inverted level range", () => {
    expect(
      errKind(
        parseContentPack({
          ...valid,
          locales: ["en"],
          skills: [
            { id: "a", title: "t", prereqs: [], minLevel: 0, maxLevel: 1 },
            { id: "a", title: "t2", prereqs: [], minLevel: 0, maxLevel: 1 },
          ],
        }),
      ),
    ).toBe("duplicateSkill");
    expect(
      errKind(
        parseContentPack({
          ...valid,
          locales: ["en"],
          skills: [
            { id: "a", title: "t", prereqs: [], minLevel: 5, maxLevel: 2 },
          ],
        }),
      ),
    ).toBe("levelRange");
  });

  it("rejects unknown prereqs and reports curriculum cycles", () => {
    expect(
      errKind(
        parseContentPack({
          ...valid,
          locales: ["en"],
          skills: [
            {
              id: "a",
              title: "t",
              prereqs: ["ghost"],
              minLevel: 0,
              maxLevel: 1,
            },
          ],
        }),
      ),
    ).toBe("unknownPrereq");

    const cyc = parseContentPack({
      ...valid,
      locales: ["en"],
      skills: [
        { id: "a", title: "t", prereqs: ["b"], minLevel: 0, maxLevel: 1 },
        { id: "b", title: "t", prereqs: ["a"], minLevel: 0, maxLevel: 1 },
      ],
    });
    expect(errKind(cyc)).toBe("cycle");
    if (!cyc.ok && cyc.error.kind === "cycle") {
      expect(cyc.error.cycle).toContain("a");
      expect(cyc.error.cycle).toContain("b");
    }
  });
});
