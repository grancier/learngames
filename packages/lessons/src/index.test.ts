import { describe, expect, it } from "vitest";
import * as lessons from "./index.js";

describe("@learn-engine/lessons public surface", () => {
  it("re-exports the domain API from a single barrel", () => {
    // one representative value export from each module
    expect(typeof lessons.ok).toBe("function"); // ids
    expect(typeof lessons.grade).toBe("function"); // grading
    expect(typeof lessons.makeRng).toBe("function"); // generation
    expect(typeof lessons.recordOutcome).toBe("function"); // progression
    expect(typeof lessons.Localizer).toBe("function"); // i18n
    expect(typeof lessons.parseContentPack).toBe("function"); // content
    expect(typeof lessons.configure).toBe("function"); // session
    expect(typeof lessons.InMemoryProgressStore).toBe("function"); // persistence
  });
});
