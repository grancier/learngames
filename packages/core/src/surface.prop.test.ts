import fc from "fast-check";
import { describe, it } from "vitest";
import { Surface, rasterizeToSegments, rasterizeToText } from "./index.js";

describe("Surface invariants", () => {
  it("rasterized rows always match the surface dimensions", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 20 }),
        (width, height) => {
          const text = rasterizeToText(Surface.create(width, height));

          return (
            text.length === height &&
            text.every((line) => [...line].length === width)
          );
        },
      ),
    );
  });

  it("blitting a fully transparent surface is a no-op", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 15 }),
        (width, height) => {
          const base = Surface.create(width, height);
          const before = base.clone();

          base.blit(Surface.transparent(width, height), 0, 0);

          return base.equals(before);
        },
      ),
    );
  });

  it("coalesced segment text concatenates back to the row width", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (width) => {
        const surface = Surface.create(width, 1);
        const segments = rasterizeToSegments(surface)[0] ?? [];

        return (
          segments.map((segment) => segment.text).join("").length === width
        );
      }),
    );
  });
});
