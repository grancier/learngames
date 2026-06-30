# Learn Engine

TypeScript workspace for the Learn Engine primitives.

## Packages

| Package | Purpose |
| --- | --- |
| `@learn-engine/core` | Pure graphics primitives: color, cell, surface, and rasterizer. |
| `@learn-engine/ink` | Ink adapter that renders a `Surface` through `<CellSurface>`. |
| `@learn-engine/harness` | Terminal harness for visual inspection of ANSI rendering. |

## Commands

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm test:coverage
pnpm lint
pnpm harness
```

`make verify` runs the current verification set: typecheck, build, tests,
100% coverage, lint, and the harness.
