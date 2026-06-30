import { describe, expect, it } from "vitest";
import {
  type AnswerSpec,
  type Grader,
  type GraderRegistry,
  grade,
} from "./grading.js";

describe("grade — integer", () => {
  it("matches an exact integer numeric response", () => {
    expect(
      grade({ kind: "integer", value: 12 }, { kind: "number", value: 12 }),
    ).toBe("correct");
  });

  it("rejects non-integers, wrong values, and wrong shapes", () => {
    expect(
      grade({ kind: "integer", value: 12 }, { kind: "number", value: 12.5 }),
    ).toBe("incorrect");
    expect(
      grade({ kind: "integer", value: 12 }, { kind: "number", value: 11 }),
    ).toBe("incorrect");
    expect(
      grade({ kind: "integer", value: 12 }, { kind: "text", value: "12" }),
    ).toBe("incorrect");
  });
});

describe("grade — decimal", () => {
  it("honors tolerance and rejects wrong shapes", () => {
    const spec: AnswerSpec = { kind: "decimal", value: 3.14, tolerance: 0.01 };
    expect(grade(spec, { kind: "number", value: 3.15 })).toBe("correct");
    expect(grade(spec, { kind: "number", value: 3.2 })).toBe("incorrect");
    expect(grade(spec, { kind: "text", value: "3.14" })).toBe("incorrect");
  });
});

describe("grade — word", () => {
  it("honors trim and caseSensitive against the accepted list", () => {
    const ci: AnswerSpec = {
      kind: "word",
      accepted: ["Cat", "Feline"],
      caseSensitive: false,
      trim: true,
    };
    expect(grade(ci, { kind: "text", value: "  cat " })).toBe("correct");
    expect(grade(ci, { kind: "text", value: "FELINE" })).toBe("correct");
    expect(grade(ci, { kind: "text", value: "dog" })).toBe("incorrect");

    const cs: AnswerSpec = {
      kind: "word",
      accepted: ["Cat"],
      caseSensitive: true,
      trim: false,
    };
    expect(grade(cs, { kind: "text", value: "Cat" })).toBe("correct");
    expect(grade(cs, { kind: "text", value: "cat" })).toBe("incorrect");
    expect(grade(cs, { kind: "text", value: " Cat" })).toBe("incorrect");
  });

  it("rejects a non-text response", () => {
    const spec: AnswerSpec = {
      kind: "word",
      accepted: ["x"],
      caseSensitive: false,
      trim: true,
    };
    expect(grade(spec, { kind: "number", value: 1 })).toBe("incorrect");
  });
});

describe("grade — choice", () => {
  it("matches the correct index and rejects mismatches/shapes", () => {
    expect(
      grade({ kind: "choice", correct: 2 }, { kind: "choice", index: 2 }),
    ).toBe("correct");
    expect(
      grade({ kind: "choice", correct: 2 }, { kind: "choice", index: 0 }),
    ).toBe("incorrect");
    expect(
      grade({ kind: "choice", correct: 2 }, { kind: "number", value: 2 }),
    ).toBe("incorrect");
  });
});

describe("grade — custom (open seam)", () => {
  const isEven: Grader = (r) =>
    r.kind === "number" && r.value % 2 === 0 ? "correct" : "incorrect";
  const registry: GraderRegistry = new Map([["isEven", isEven]]);

  it("invokes a registered grader and returns its verdict", () => {
    expect(
      grade(
        { kind: "custom", graderId: "isEven" },
        { kind: "number", value: 4 },
        registry,
      ),
    ).toBe("correct");
    expect(
      grade(
        { kind: "custom", graderId: "isEven" },
        { kind: "number", value: 3 },
        registry,
      ),
    ).toBe("incorrect");
  });

  it("fails closed for an unregistered grader or an absent registry", () => {
    expect(
      grade(
        { kind: "custom", graderId: "missing" },
        { kind: "number", value: 4 },
        registry,
      ),
    ).toBe("incorrect");
    expect(
      grade(
        { kind: "custom", graderId: "missing" },
        { kind: "number", value: 4 },
      ),
    ).toBe("incorrect");
  });
});

describe("grade — totality", () => {
  it("throws on an unknown spec kind (assertNever guard)", () => {
    const bogus = { kind: "bogus" } as unknown as AnswerSpec;
    expect(() => grade(bogus, { kind: "number", value: 1 })).toThrow(
      /unhandled answer spec/,
    );
  });
});
