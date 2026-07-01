import { describe, expect, it } from "vitest";
import { RUNTIME_FIRED } from "./outcome.js";

describe("RUNTIME_FIRED", () => {
  it("is exactly the engine-fired subset of the five outcomes", () => {
    expect([...RUNTIME_FIRED]).toEqual(["timeout", "abandon", "terminate"]);
  });
});
