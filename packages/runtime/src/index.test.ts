import { describe, expect, it } from "vitest";
import * as runtime from "./index.js";

describe("@learn-engine/runtime public surface", () => {
  it("re-exports the runtime API from a single barrel", () => {
    expect(typeof runtime.start).toBe("function");
    expect(typeof runtime.advance).toBe("function");
    expect(typeof runtime.parseLessonId).toBe("function");
    expect(typeof runtime.recordLessonResult).toBe("function");
    expect(typeof runtime.hasActivity).toBe("function");
    expect(runtime.EMPTY_INPUT).toBeDefined();
  });
});
