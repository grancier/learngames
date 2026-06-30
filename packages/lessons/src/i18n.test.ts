import { describe, expect, it } from "vitest";
import {
  type LocaleBundle,
  Localizer,
  parseLocaleNumber,
  separatorsFromParts,
} from "./i18n.js";
import type { LocaleId } from "./ids.js";

const en = "en" as LocaleId;
const es = "es" as LocaleId;
const esMX = "es-MX" as LocaleId;

const bundles: LocaleBundle[] = [
  {
    locale: en,
    messages: {
      "ui.feedback": "{outcome, select, correct {Correct!} other {Not quite.}}",
      "ui.score": "{name}: {score, plural, one {# point} other {# points}}",
      "only.en": "english only",
    },
  },
  {
    locale: es,
    messages: {
      "ui.feedback":
        "{outcome, select, correct {¡Correcto!} other {No exactamente.}}",
    },
  },
];

describe("Localizer.format", () => {
  it("resolves ICU plural and select messages", () => {
    const loc = new Localizer(bundles, en);
    expect(loc.format("ui.score", en, { name: "Ada", score: 1 })).toBe(
      "Ada: 1 point",
    );
    expect(loc.format("ui.score", en, { name: "Ada", score: 2 })).toBe(
      "Ada: 2 points",
    );
    expect(loc.format("ui.feedback", en, { outcome: "correct" })).toBe(
      "Correct!",
    );
    expect(loc.format("ui.feedback", en, { outcome: "wrong" })).toBe(
      "Not quite.",
    );
  });

  it("caches the compiled message across repeated calls", () => {
    const loc = new Localizer(bundles, en);
    const first = loc.format("ui.feedback", en, { outcome: "correct" });
    const second = loc.format("ui.feedback", en, { outcome: "correct" });
    expect(first).toBe("Correct!");
    expect(second).toBe("Correct!");
  });

  it("walks the fallback chain es-MX → es → default(en)", () => {
    const loc = new Localizer(bundles, en);
    // es bundle exists but lacks the key; es-MX has no bundle at all; en provides it.
    expect(loc.format("only.en", esMX)).toBe("english only");
    // es provides ui.feedback → resolved before falling through to en.
    expect(loc.format("ui.feedback", esMX, { outcome: "correct" })).toBe(
      "¡Correcto!",
    );
  });

  it("returns the key and fires onMissing when nothing resolves", () => {
    const seen: Array<[string, string]> = [];
    const loud = new Localizer(bundles, en, {
      onMissing: (k, l) => seen.push([k, l]),
    });
    expect(loud.format("nope.key", en)).toBe("nope.key");
    expect(seen).toEqual([["nope.key", "en"]]);

    // No onMissing configured → silent, still returns the key.
    const quiet = new Localizer(bundles, en);
    expect(quiet.format("nope.key", en)).toBe("nope.key");
  });
});

describe("Localizer.formatNumber / parseNumber", () => {
  it("formats and round-trips a number for a locale", () => {
    const loc = new Localizer(bundles, en);
    expect(loc.formatNumber(1234.5, en)).toBe("1,234.5");
    expect(loc.parseNumber("1,234.56", en)).toBe(1234.56);
  });
});

describe("separatorsFromParts", () => {
  it("reads real separators and falls back when a part is absent", () => {
    const real = new Intl.NumberFormat("en").formatToParts(12345.6);
    expect(separatorsFromParts(real)).toEqual({ group: ",", decimal: "." });
    // synthetic parts missing both → defensive defaults
    expect(separatorsFromParts([{ type: "integer", value: "5" }])).toEqual({
      group: ",",
      decimal: ".",
    });
  });
});

describe("parseLocaleNumber", () => {
  it("parses en and de grouped decimals to the same value", () => {
    expect(parseLocaleNumber("1,234.56", "en")).toBe(1234.56);
    expect(parseLocaleNumber("1.234,56", "de")).toBe(1234.56);
  });

  it("returns null for empty, sign-only, dot-only, and non-numeric input", () => {
    expect(parseLocaleNumber("", "en")).toBeNull();
    expect(parseLocaleNumber("-", "en")).toBeNull();
    expect(parseLocaleNumber("+", "en")).toBeNull();
    expect(parseLocaleNumber(".", "en")).toBeNull();
    expect(parseLocaleNumber("abc", "en")).toBeNull();
    expect(parseLocaleNumber("1-2", "en")).toBeNull(); // Number("1-2") is NaN
  });
});
