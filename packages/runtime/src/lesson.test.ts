import { describe, expect, it } from "vitest";
import { parseLessonId } from "./lesson.js";

describe("parseLessonId", () => {
  it("accepts a slug-like id", () => {
    const r = parseLessonId("math.addition-drill");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("math.addition-drill");
  });

  it("rejects an invalid id with a typed lessonId error", () => {
    const r = parseLessonId("nope nope");
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.error).toEqual({ kind: "lessonId", value: "nope nope" });
  });
});
