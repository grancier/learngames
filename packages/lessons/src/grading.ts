/**
 * Closed union of how an answer is graded. Built-ins are exhaustive (the compiler enforces
 * coverage in `grade`). Developer-defined grading uses the `custom` variant + a GraderRegistry,
 * keeping the built-in set closed while leaving an open extension point.
 */
export type AnswerSpec =
  | { readonly kind: "integer"; readonly value: number }
  | {
      readonly kind: "decimal";
      readonly value: number;
      readonly tolerance: number;
    }
  | {
      readonly kind: "word";
      readonly accepted: readonly string[];
      readonly caseSensitive: boolean;
      readonly trim: boolean;
    }
  | { readonly kind: "choice"; readonly correct: number }
  | { readonly kind: "custom"; readonly graderId: string };

/**
 * A normalized response. Numeric answers are PARSED before they reach here — locale-aware
 * parsing (e.g. "3,5" → 3.5) is the input layer's job via `Localizer.parseNumber`. This keeps
 * `grade` pure.
 */
export type Response =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "choice"; readonly index: number };

export type Outcome = "correct" | "incorrect";

export type Grader = (response: Response) => Outcome;
export type GraderRegistry = ReadonlyMap<string, Grader>;

/** Pure, total. Unknown response shapes and unknown custom graders fail CLOSED (never "correct"). */
export function grade(
  spec: AnswerSpec,
  res: Response,
  custom?: GraderRegistry,
): Outcome {
  switch (spec.kind) {
    case "integer":
      return res.kind === "number" &&
        Number.isInteger(res.value) &&
        res.value === spec.value
        ? "correct"
        : "incorrect";
    case "decimal":
      return res.kind === "number" &&
        Math.abs(res.value - spec.value) <= spec.tolerance
        ? "correct"
        : "incorrect";
    case "word": {
      if (res.kind !== "text") return "incorrect";
      const norm = (s: string): string => (spec.trim ? s.trim() : s);
      const got = norm(res.value);
      const eq = (a: string): boolean =>
        spec.caseSensitive
          ? norm(a) === got
          : norm(a).toLowerCase() === got.toLowerCase();
      return spec.accepted.some(eq) ? "correct" : "incorrect";
    }
    case "choice":
      return res.kind === "choice" && res.index === spec.correct
        ? "correct"
        : "incorrect";
    case "custom": {
      const g = custom?.get(spec.graderId);
      return g ? g(res) : "incorrect"; // unknown grader → fail closed
    }
    default:
      return assertNever(spec);
  }
}

function assertNever(x: never): never {
  throw new Error(`unhandled answer spec: ${JSON.stringify(x)}`);
}
