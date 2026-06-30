# Learn Engine — Graphics Spine Specification

**Scope:** the graphics substrate only (the "spine"). Version `0.1`. Target: TypeScript 5.6+, Node 20+, ESM, Ink 7, React 19, truecolor terminals + the browser xterm.js runtime (the substrate is renderer-agnostic; this document builds and tests the Node path).

This document is self-contained and implementation-ready. An engineer should be able to scaffold the project, paste the code, and verify it against the acceptance criteria and the testing steps below without further context.

---

## 1. Scope and non-goals

### 1.1 In scope (the graphics spine)

The spine is the rendering substrate every spatial game element is built on. It is four things:

1. **Color model** — truecolor `Rgb` + an explicit `"default"` (terminal default) value.
2. **`Cell`** — a single styled character cell, with per-channel transparency for compositing.
3. **`Surface`** — a mutable `width × height` cell buffer with drawing operations (`drawText`, `fillRect`, `drawBox`) and **compositing (`blit`)** with per-channel inherit semantics. This is the primitive Ink does not provide: a cell buffer you can layer into.
4. **Rasterizer + `<CellSurface>`** — pure functions that turn a `Surface` into coalesced styled runs, plus one Ink component that renders those runs as `<Text>` rows. Every spatial widget (tilemap, sprite layer, maze, banner, effects) will be a client of this single path.

The governing principle, restated: **everything spatial composites into a `Surface` in pure `core` code, then one component rasterizes it.** Effects, sprites, and tiles are *producers of Surfaces*, not bespoke Ink trees.

### 1.2 Explicitly out of scope (deferred)

| Deferred | Why it's out of the spine |
|---|---|
| Tick/clock, animation loop | Engine concern. The spine is **pull-based**: it renders whatever `Surface` it's handed. The thing that decides *when* to produce a new `Surface` is separate. |
| Tilemap, sprite, viewport/camera, maze, pathfinding | Clients of `Surface`. Built later on top of this. |
| Effects pipeline (color-cycle, shake, shadow/outline) | A client: `Effect = (Surface, t) => Surface`. Built later. |
| Input, keymap, focus | Control plane, not rendering. |
| Scene stack, turn loop, Stage/letterbox | Flow/engine. `<CellSurface>` accepts a sized surface; *who* sizes/centers it is the engine. |
| Lesson/content/i18n primitives | Separate workstream. |
| Wide-glyph (CJK/emoji) cell width | Known v1 limitation — see §6.4. Lands with the i18n phase. |
| Browser runtime wiring | The substrate is renderer-agnostic and already runs in the browser via the established xterm shim; this doc builds/tests the Node path only. |

---

## 2. Architecture

### 2.1 Data flow (pull-based)

```
                 (engine, out of scope)            ┌─────────── @learn-engine/core ───────────┐
 game state ──▶  build/compose a Surface  ──▶  Surface ──▶ rasterizeToSegments() ──▶ Segment[][]
                                                                                          │
                                                          ┌───────────────────────────────┤
                                                          ▼                               ▼
                                              rasterizeToAnsi()                  <CellSurface>  (@learn-engine/ink)
                                              (Node TTY / golden tests)                   │
                                                          │                               ▼
                                                          ▼                          Ink reconciler
                                                     process.stdout            ──▶  stdout (TTY) or xterm.js (web)
```

The spine has **no internal state and no time**. `Surface` is mutable for cheap in-place drawing, but from the renderer's perspective each frame is a fresh value: the engine hands `<CellSurface>` a surface, the component rasterizes and renders. Re-render cadence is the engine's job.

### 2.2 Package boundaries

```
packages/
  core/        @learn-engine/core   — color, cell, surface, rasterizer. ZERO react/ink deps. Pure, Node + browser.
  ink/         @learn-engine/ink    — <CellSurface>. Depends on ink, react, @learn-engine/core.
apps/
  harness/     @learn-engine/harness — node script: draws a demo surface, prints ANSI to stdout for visual inspection.
```

**Hard rule:** `@learn-engine/core` imports neither `react` nor `ink`. This is enforced by a test (§9.5). It is what makes the graphics correctness testable as pure functions with no renderer, and what keeps the substrate usable from any runtime.

### 2.3 Why this split is correct

- **Correctness lives in pure functions.** `Surface` operations and the rasterizer are deterministic, synchronous, and renderer-free. They get exhaustive unit + property tests with no Ink, no DOM, no terminal. This is the bulk of the test surface and the bulk of the risk.
- **The component is a trivial mapping.** `<CellSurface>` is ~15 lines that map `Segment[][]` to `<Text>`. It gets a thin smoke test, deliberately insulating the suite from `ink-testing-library` version drift (see §9.4).
- **Run-length coalescing is the one non-obvious optimization.** A naive renderer emitting one `<Text>` per cell would create `width × height` (≈2,400 at 80×30) React nodes per frame. Coalescing same-style runs typically cuts that by 10–50×; it is mandatory, not optional, and is specified + tested as such.

---

## 3. Toolchain & Node setup

### 3.1 Prerequisites

- **Node 20+** (Ink 7 requires it; ESM-only).
- **pnpm 9+** (workspace).
- The repo is ESM throughout (`"type": "module"`); all relative imports use explicit `.js` extensions (NodeNext resolution).

### 3.2 Workspace files

`pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

Root `package.json`

```json
{
  "name": "learn-engine",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r --filter './packages/*' build",
    "typecheck": "tsc -b --pretty",
    "test": "vitest run",
    "test:watch": "vitest",
    "harness": "pnpm --filter @learn-engine/harness start",
    "lint": "biome check ."
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "@biomejs/biome": "^1.9.0"
  }
}
```

Root `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

> `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are deliberate: the rasterizer indexes arrays heavily and the cell model leans on `undefined`-means-inherit. Both flags force you to handle exactly the cases that otherwise produce silent rendering bugs.

### 3.3 `packages/core`

`packages/core/package.json`

```json
{
  "name": "@learn-engine/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json" },
  "devDependencies": { "fast-check": "^3.22.0" }
}
```

`packages/core/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

### 3.4 `packages/ink`

`packages/ink/package.json`

```json
{
  "name": "@learn-engine/ink",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "peerDependencies": { "ink": "^7.0.0", "react": "^19.0.0" },
  "dependencies": { "@learn-engine/core": "workspace:*" },
  "devDependencies": {
    "ink": "^7.1.0",
    "react": "^19.0.0",
    "@types/react": "^19.0.0",
    "ink-testing-library": "^4.0.0"
  }
}
```

`packages/ink/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "jsx": "react-jsx" },
  "include": ["src"]
}
```

> **Pin caveat:** `ink-testing-library` historically lags Ink majors. If `pnpm install` reports a peer-dependency conflict against Ink 7, add a root `pnpm.overrides` entry or install with the documented override, **or** rely on the pure rasterizer tests (which need no Ink) for correctness and treat the component test as best-effort. The architecture is built so the suite stays green even if the Ink component test must be skipped. See §9.4.

### 3.5 `apps/harness`

`apps/harness/package.json`

```json
{
  "name": "@learn-engine/harness",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "start": "tsx src/main.ts" },
  "dependencies": { "@learn-engine/core": "workspace:*" },
  "devDependencies": { "tsx": "^4.19.0" }
}
```

### 3.6 Vitest config

Root `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: false,
  },
});
```

---

## 4. Color model — `packages/core/src/color.ts`

```ts
/** Truecolor RGB triple, each channel 0..255. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * A *resolved* color: a concrete truecolor triple, or the terminal's default color.
 * Distinct from `undefined`, which (in a `Cell`) means "inherit from the cell below during a blit".
 */
export type ColorValue = Rgb | "default";

const clampByte = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : 0;

/** Construct an `Rgb`, clamping each channel into 0..255. */
export function rgb(r: number, g: number, b: number): Rgb {
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
}

/**
 * `#rrggbb` for Ink's `color` / `backgroundColor` props.
 * Returns `undefined` for `"default"` and `undefined` input so the prop is omitted (Ink falls back to terminal default).
 */
export function toHex(c: ColorValue | undefined): string | undefined {
  if (c === undefined || c === "default") return undefined;
  const h = (n: number): string => n.toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** SGR parameters for a foreground color: truecolor `38;2;r;g;b` or default `39`. */
export function fgSgr(c: ColorValue): string {
  return c === "default" ? "39" : `38;2;${c.r};${c.g};${c.b}`;
}

/** SGR parameters for a background color: truecolor `48;2;r;g;b` or default `49`. */
export function bgSgr(c: ColorValue): string {
  return c === "default" ? "49" : `48;2;${c.r};${c.g};${c.b}`;
}

/** Structural color equality (used by the rasterizer's run coalescing and by tests). */
export function colorEq(a: ColorValue | undefined, b: ColorValue | undefined): boolean {
  if (a === b) return true; // covers both undefined, both "default", same reference
  if (a === undefined || b === undefined || a === "default" || b === "default") return false;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
```

---

## 5. Cell model — `packages/core/src/cell.ts`

```ts
import type { ColorValue } from "./color.js";

/**
 * A single styled character cell.
 *
 * Field semantics deliberately differ between a **base** surface (the thing you rasterize)
 * and a **source** surface being blitted on top:
 *
 *  - `char: null`      → transparent glyph. On blit, the destination glyph is preserved.
 *  - `fg`/`bg` undefined → inherit. On blit, the destination color is preserved.
 *  - `fg`/`bg` = "default" → an *explicit* terminal-default color (NOT inherit).
 *  - `bold` undefined    → inherit on blit.
 *
 * A base surface should contain only fully-resolved cells (no `null` char, no `undefined`
 * attrs); the rasterizer resolves any stragglers defensively (`char ?? " "`, color `?? "default"`).
 */
export interface Cell {
  readonly char: string | null;
  readonly fg?: ColorValue;
  readonly bg?: ColorValue;
  readonly bold?: boolean;
}

/** Fully-opaque blank — the default base fill. */
export const BLANK: Cell = { char: " ", fg: "default", bg: "default", bold: false };

/** Fully-transparent cell — blitting it changes nothing. */
export const TRANSPARENT: Cell = { char: null };

/** Style bag for drawing helpers. Omitted fields mean "inherit on blit". */
export interface CellStyle {
  readonly fg?: ColorValue;
  readonly bg?: ColorValue;
  readonly bold?: boolean;
}
```

### 5.1 The compositing truth table (normative)

For a source cell `S` blitted over a destination cell `D`, the result `R` is computed **per channel**:

| Channel | Rule |
|---|---|
| `char` | `S.char === null ? D.char : S.char` |
| `fg`   | `S.fg === undefined ? D.fg : S.fg` |
| `bg`   | `S.bg === undefined ? D.bg : S.bg` |
| `bold` | `S.bold === undefined ? D.bold : S.bold` |

This yields the three cases every sprite/effect needs:

- **Opaque overwrite** — `S = {char:"#", fg, bg, bold}` → replaces `D` entirely.
- **Transparent skip** — `S = {char:null}` (= `TRANSPARENT`) → `R = D`.
- **Glyph over background** — `S = {char:"@", fg:red}` (bg/bold undefined) → red `@` painted, but `D`'s background and bold preserved. (A red hero over a green tile.)

---

## 6. Surface — `packages/core/src/surface.ts`

```ts
import { BLANK, type Cell, type CellStyle } from "./cell.js";
import { colorEq } from "./color.js";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BorderGlyphs {
  readonly tl: string; readonly tr: string; readonly bl: string; readonly br: string;
  readonly top: string; readonly bottom: string; readonly left: string; readonly right: string;
}

export const BORDERS = {
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", top: "─", bottom: "─", left: "│", right: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", top: "═", bottom: "═", left: "║", right: "║" },
  round:  { tl: "╭", tr: "╮", bl: "╰", br: "╯", top: "─", bottom: "─", left: "│", right: "│" },
  bold:   { tl: "┏", tr: "┓", bl: "┗", br: "┛", top: "━", bottom: "━", left: "┃", right: "┃" },
} as const satisfies Record<string, BorderGlyphs>;

/**
 * A mutable `width × height` grid of `Cell`s, row-major. The substrate every spatial
 * element draws into. Out-of-bounds *writes* are silently clipped; out-of-bounds reads
 * via `get` throw (use `tryGet` for the soft variant).
 */
export class Surface {
  readonly width: number;
  readonly height: number;
  private readonly cells: Cell[]; // length width*height, row-major

  private constructor(width: number, height: number, cells: Cell[]) {
    this.width = width;
    this.height = height;
    this.cells = cells;
  }

  /** Create a surface filled with `fill` (default: opaque blank). */
  static create(width: number, height: number, fill: Cell = BLANK): Surface {
    assertDims(width, height);
    return new Surface(width, height, new Array<Cell>(width * height).fill(fill));
  }

  /** Create a fully-transparent surface — the canonical sprite/overlay scratch buffer. */
  static transparent(width: number, height: number): Surface {
    return Surface.create(width, height, { char: null });
  }

  private idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Cell at (x,y). Throws `RangeError` if out of bounds. */
  get(x: number, y: number): Cell {
    if (!this.inBounds(x, y)) {
      throw new RangeError(`get(${x},${y}) out of bounds for ${this.width}x${this.height}`);
    }
    return this.cells[this.idx(x, y)]!;
  }

  /** Cell at (x,y) or `undefined` if out of bounds. */
  tryGet(x: number, y: number): Cell | undefined {
    return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : undefined;
  }

  /** Set (x,y). Out-of-bounds is a silent no-op (drawing convenience). */
  set(x: number, y: number, cell: Cell): void {
    if (this.inBounds(x, y)) this.cells[this.idx(x, y)] = cell;
  }

  /** Read-only snapshot of one row (for the rasterizer and tests). */
  row(y: number): readonly Cell[] {
    const start = y * this.width;
    return this.cells.slice(start, start + this.width);
  }

  fill(cell: Cell): void {
    this.cells.fill(cell);
  }

  clear(fill: Cell = BLANK): void {
    this.cells.fill(fill);
  }

  /**
   * Write `text` left-to-right starting at (x,y), one row, clipping at edges.
   * v1 assumes single-width glyphs (see spec §6.4 for the wide-glyph limitation).
   */
  drawText(x: number, y: number, text: string, style: CellStyle = {}): void {
    let cx = x;
    for (const ch of text) {
      this.set(cx, y, { char: ch, fg: style.fg, bg: style.bg, bold: style.bold });
      cx += 1;
    }
  }

  /** Fill a rectangle with one cell value. Clipped to bounds. */
  fillRect(rect: Rect, cell: Cell): void {
    for (let yy = rect.y; yy < rect.y + rect.height; yy++) {
      for (let xx = rect.x; xx < rect.x + rect.width; xx++) {
        this.set(xx, yy, cell);
      }
    }
  }

  /** Draw a 1-cell box outline with a border glyph set. No-op for degenerate rects. */
  drawBox(rect: Rect, border: BorderGlyphs, style: CellStyle = {}): void {
    const { x, y, width: w, height: h } = rect;
    if (w <= 0 || h <= 0) return;
    const s = (ch: string): Cell => ({ char: ch, fg: style.fg, bg: style.bg, bold: style.bold });
    const x2 = x + w - 1;
    const y2 = y + h - 1;
    this.set(x, y, s(border.tl));
    this.set(x2, y, s(border.tr));
    this.set(x, y2, s(border.bl));
    this.set(x2, y2, s(border.br));
    for (let xx = x + 1; xx < x2; xx++) {
      this.set(xx, y, s(border.top));
      this.set(xx, y2, s(border.bottom));
    }
    for (let yy = y + 1; yy < y2; yy++) {
      this.set(x, yy, s(border.left));
      this.set(x2, yy, s(border.right));
    }
  }

  /**
   * Composite `src` over this surface at (dx,dy) using the per-channel inherit rule
   * (cell.ts §5.1). Clipped to this surface's bounds; negative offsets are fine.
   */
  blit(src: Surface, dx: number, dy: number): void {
    for (let sy = 0; sy < src.height; sy++) {
      const ty = dy + sy;
      if (ty < 0 || ty >= this.height) continue;
      for (let sx = 0; sx < src.width; sx++) {
        const tx = dx + sx;
        if (tx < 0 || tx >= this.width) continue;
        const s = src.cells[src.idx(sx, sy)]!;
        const d = this.cells[this.idx(tx, ty)]!;
        this.cells[this.idx(tx, ty)] = {
          char: s.char === null ? d.char : s.char,
          fg: s.fg === undefined ? d.fg : s.fg,
          bg: s.bg === undefined ? d.bg : s.bg,
          bold: s.bold === undefined ? d.bold : s.bold,
        };
      }
    }
  }

  /** Deep copy (cells are immutable values, so a slice suffices). */
  clone(): Surface {
    return new Surface(this.width, this.height, this.cells.slice());
  }

  /** Structural equality of every cell — for tests. */
  equals(other: Surface): boolean {
    if (this.width !== other.width || this.height !== other.height) return false;
    for (let i = 0; i < this.cells.length; i++) {
      if (!cellEq(this.cells[i]!, other.cells[i]!)) return false;
    }
    return true;
  }
}

function assertDims(w: number, h: number): void {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new RangeError(`invalid surface dimensions ${w}x${h}`);
  }
}

function cellEq(a: Cell, b: Cell): boolean {
  return (
    a.char === b.char &&
    colorEq(a.fg, b.fg) &&
    colorEq(a.bg, b.bg) &&
    (a.bold ?? false) === (b.bold ?? false)
  );
}
```

### 6.1 Invariants

- `cells.length === width * height` at all times.
- `width`, `height` are positive integers (enforced at construction).
- `set` never throws and never grows the buffer; OOB writes are dropped.
- `blit` never throws and never reads/writes OOB; it clips on both axes including negative `dx`/`dy`.
- A `Surface` produced by `create(w,h)` rasterizes to `h` lines of exactly `w` columns.

### 6.2 Complexity

- `create`, `clone`, `fill`, `clear`: O(w·h).
- `set`, `get`, `tryGet`: O(1).
- `drawText`: O(len).
- `fillRect`, `drawBox`, `blit`: O(area touched), clipped.

### 6.3 Mutability contract

`Surface` is mutable for in-place drawing efficiency, but `Cell` values are immutable (frozen by convention — never mutate a `Cell` in place; always replace). `blit` writes new `Cell` objects rather than mutating existing ones, so a `clone()` taken before a blit is unaffected. This is what lets the engine keep a previous frame for diffing later without defensive copying inside the hot path.

### 6.4 Known v1 limitation — single-width glyphs

`drawText` and the cell grid assume every glyph occupies exactly one display column. Wide glyphs (CJK, many emoji) occupy two columns in a terminal and will misalign the grid. This is **deliberately deferred** to the i18n phase, where a grapheme/east-asian-width pass will be added at the `drawText` boundary. The spine exposes the right seam for it (text enters only through `drawText`), so the fix is localized.

---

## 7. Rasterizer — `packages/core/src/rasterize.ts`

```ts
import type { Cell } from "./cell.js";
import { bgSgr, colorEq, fgSgr, type ColorValue } from "./color.js";
import type { Surface } from "./surface.js";

/** A maximal run of cells sharing one style, within one row. Colors are resolved (never undefined). */
export interface Segment {
  readonly text: string;
  readonly fg: ColorValue;
  readonly bg: ColorValue;
  readonly bold: boolean;
}

const resolveChar = (c: Cell): string => c.char ?? " ";
const resolveFg = (c: Cell): ColorValue => c.fg ?? "default";
const resolveBg = (c: Cell): ColorValue => c.bg ?? "default";

/**
 * Coalesce each row into maximal same-style runs. O(width) per row, O(w·h) total.
 * This is the optimization that keeps the Ink tree small (one <Text> per run, not per cell).
 */
export function rasterizeToSegments(surface: Surface): Segment[][] {
  const rows: Segment[][] = [];
  for (let y = 0; y < surface.height; y++) {
    const cells = surface.row(y);
    const segs: Segment[] = [];
    let cur: { fg: ColorValue; bg: ColorValue; bold: boolean; text: string } | null = null;

    for (const cell of cells) {
      const fg = resolveFg(cell);
      const bg = resolveBg(cell);
      const bold = cell.bold ?? false;
      const ch = resolveChar(cell);

      if (cur !== null && colorEq(cur.fg, fg) && colorEq(cur.bg, bg) && cur.bold === bold) {
        cur.text += ch;
      } else {
        if (cur !== null) segs.push(cur);
        cur = { fg, bg, bold, text: ch };
      }
    }
    if (cur !== null) segs.push(cur);
    rows.push(segs);
  }
  return rows;
}

const RESET = "\x1b[0m";

/** Render to ANSI lines for a TTY or golden tests — one reset-terminated string per row. */
export function rasterizeToAnsi(surface: Surface): string[] {
  return rasterizeToSegments(surface).map((segs) =>
    segs
      .map((s) => {
        const sgr = [s.bold ? "1" : "22", fgSgr(s.fg), bgSgr(s.bg)].join(";");
        return `\x1b[${sgr}m${s.text}`;
      })
      .join("") + RESET,
  );
}

/** Plain-text grid (styling stripped) — for human-readable snapshots and assertions. */
export function rasterizeToText(surface: Surface): string[] {
  return rasterizeToSegments(surface).map((segs) => segs.map((s) => s.text).join(""));
}
```

### 7.1 ANSI emission contract

- Each line begins with one or more SGR sequences and ends with a single `\x1b[0m` reset.
- Each segment emits `\x1b[{bold};{fg};{bg}m{text}` where:
  - `bold` ∈ {`1` (on), `22` (off)},
  - `fg` ∈ {`38;2;r;g;b`, `39` (default)},
  - `bg` ∈ {`48;2;r;g;b`, `49` (default)}.
- The reset at line end means lines are independent; a renderer can emit them in any order or re-emit a single line without leaking state.

### 7.2 `core` barrel — `packages/core/src/index.ts`

```ts
export * from "./color.js";
export * from "./cell.js";
export * from "./surface.js";
export * from "./rasterize.js";
```

---

## 8. `<CellSurface>` — `packages/ink/src/CellSurface.tsx`

```tsx
import { Box, Text } from "ink";
import { useMemo } from "react";
import { rasterizeToSegments, toHex, type Surface } from "@learn-engine/core";

export interface CellSurfaceProps {
  /** The surface to render. Pass a fresh reference when content changes so memoization invalidates. */
  readonly surface: Surface;
}

/**
 * Renders a `Surface` as a column of Ink rows. Each row is one `<Text>` containing one child
 * `<Text>` per coalesced style run. This is the ONLY place a `Surface` becomes an Ink tree;
 * every spatial widget renders by producing a `Surface` and handing it here.
 */
export function CellSurface({ surface }: CellSurfaceProps): React.JSX.Element {
  const rows = useMemo(() => rasterizeToSegments(surface), [surface]);
  return (
    <Box flexDirection="column">
      {rows.map((segs, y) => (
        <Text key={y}>
          {segs.map((s, i) => (
            <Text key={i} color={toHex(s.fg)} backgroundColor={toHex(s.bg)} bold={s.bold}>
              {s.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
```

`packages/ink/src/index.ts`

```ts
export { CellSurface, type CellSurfaceProps } from "./CellSurface.js";
```

### 8.1 Memoization contract

`useMemo` keys on `surface` **identity**. The engine must hand a *new* `Surface` reference when content changes (the natural outcome of building a frame). Mutating a surface in place and re-rendering the same reference will not invalidate the memo. At 80×30 a full rasterize is sub-millisecond, so even without memoization the cost is trivial; the memo exists to avoid needless work on unrelated re-renders, not as a correctness mechanism.

### 8.2 Sizing

`<CellSurface>` renders exactly `surface.height` rows of `surface.width` columns. It does **not** center, letterbox, or clamp to the terminal — that is the engine's Stage (out of scope). The component assumes the surface already matches the intended draw area.

---

## 9. Testing strategy

The split is intentional: **~95% of the tests are pure** (`@learn-engine/core`, no Ink, no DOM), and a single thin component test covers `<CellSurface>`.

### 9.1 `Surface` unit tests — `packages/core/src/surface.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { BLANK, Surface, BORDERS, rgb } from "./index.js";
import { rasterizeToText } from "./index.js";

describe("Surface construction", () => {
  it("creates w*h blank cells", () => {
    const s = Surface.create(3, 2);
    expect([s.width, s.height]).toEqual([3, 2]);
    expect(rasterizeToText(s)).toEqual(["   ", "   "]);
  });

  it("rejects non-positive / non-integer dimensions", () => {
    expect(() => Surface.create(0, 5)).toThrow(RangeError);
    expect(() => Surface.create(2.5, 5)).toThrow(RangeError);
  });
});

describe("get/set bounds", () => {
  it("round-trips in bounds", () => {
    const s = Surface.create(2, 2);
    s.set(1, 1, { char: "x" });
    expect(s.get(1, 1).char).toBe("x");
  });

  it("throws on out-of-bounds get, no-ops on out-of-bounds set", () => {
    const s = Surface.create(2, 2);
    expect(() => s.get(2, 0)).toThrow(RangeError);
    s.set(9, 9, { char: "z" }); // no-op
    expect(rasterizeToText(s)).toEqual(["  ", "  "]);
    expect(s.tryGet(9, 9)).toBeUndefined();
  });
});

describe("drawText", () => {
  it("writes left-to-right and clips at the right edge", () => {
    const s = Surface.create(3, 1);
    s.drawText(1, 0, "abc"); // 'a' at x=1, 'b' at x=2, 'c' clipped
    expect(rasterizeToText(s)).toEqual([" ab"]);
  });
});

describe("drawBox", () => {
  it("draws corners and edges", () => {
    const s = Surface.create(3, 3);
    s.drawBox({ x: 0, y: 0, width: 3, height: 3 }, BORDERS.single);
    expect(rasterizeToText(s)).toEqual(["┌─┐", "│ │", "└─┘"]);
  });
});

describe("blit compositing", () => {
  it("opaque overwrite, transparent skip, glyph-over-background inherit", () => {
    const dst = Surface.create(3, 1, { char: ".", fg: "default", bg: rgb(0, 0, 255), bold: false });
    const src = Surface.transparent(3, 1);
    src.set(1, 0, { char: "@", fg: rgb(255, 0, 0) }); // bg/bold undefined → inherit

    dst.blit(src, 0, 0);

    expect(dst.get(0, 0).char).toBe("."); // transparent src cell → dst preserved
    const mid = dst.get(1, 0);
    expect(mid.char).toBe("@");
    expect(mid.fg).toEqual(rgb(255, 0, 0));
    expect(mid.bg).toEqual(rgb(0, 0, 255)); // inherited from dst
  });

  it("clips negative and overflowing offsets without throwing", () => {
    const dst = Surface.create(2, 2, BLANK);
    const src = Surface.create(2, 2, { char: "#", fg: "default", bg: "default", bold: false });
    dst.blit(src, -1, -1); // only src(1,1) lands at dst(0,0)
    expect(dst.get(0, 0).char).toBe("#");
    expect(dst.get(1, 1).char).toBe(" ");
    expect(() => dst.blit(src, 100, 100)).not.toThrow();
  });
});

describe("clone & equals", () => {
  it("clone is independent; equals is structural", () => {
    const a = Surface.create(2, 2);
    const b = a.clone();
    expect(a.equals(b)).toBe(true);
    b.set(0, 0, { char: "!" });
    expect(a.equals(b)).toBe(false);
    expect(a.get(0, 0).char).toBe(" "); // original untouched
  });
});
```

### 9.2 Rasterizer unit tests — `packages/core/src/rasterize.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { Surface, rasterizeToSegments, rasterizeToAnsi, fgSgr, bgSgr, rgb } from "./index.js";

describe("color SGR", () => {
  it("emits truecolor and default codes", () => {
    expect(fgSgr(rgb(10, 20, 30))).toBe("38;2;10;20;30");
    expect(fgSgr("default")).toBe("39");
    expect(bgSgr(rgb(1, 2, 3))).toBe("48;2;1;2;3");
    expect(bgSgr("default")).toBe("49");
  });
});

describe("run coalescing", () => {
  it("merges maximal same-style runs", () => {
    const s = Surface.create(4, 1, { char: "a", fg: rgb(1, 2, 3), bg: "default", bold: false });
    s.set(2, 0, { char: "b", fg: rgb(9, 9, 9), bg: "default", bold: false });
    const [row] = rasterizeToSegments(s);
    expect(row?.map((r) => r.text)).toEqual(["aa", "b", "a"]); // 3 runs, not 4 cells
  });

  it("a uniform row yields exactly one segment", () => {
    const s = Surface.create(20, 1, { char: "=", fg: rgb(5, 5, 5), bg: "default", bold: false });
    expect(rasterizeToSegments(s)[0]).toHaveLength(1);
  });
});

describe("ANSI lines", () => {
  it("each line is SGR-prefixed and reset-terminated", () => {
    const s = Surface.create(1, 1, { char: "x", fg: rgb(1, 2, 3), bg: "default", bold: true });
    const [line] = rasterizeToAnsi(s);
    expect(line?.startsWith("\x1b[")).toBe(true);
    expect(line?.endsWith("\x1b[0m")).toBe(true);
    expect(line).toContain("38;2;1;2;3");
    expect(line).toContain("1;"); // bold-on
  });

  it("ansi-stripped line equals the row text", () => {
    const s = Surface.create(5, 1);
    s.drawText(0, 0, "hi", { fg: rgb(0, 255, 0) });
    const stripped = rasterizeToAnsi(s)[0]?.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toBe("hi   ");
  });
});
```

### 9.3 Property tests (optional but recommended) — `packages/core/src/surface.prop.test.ts`

```ts
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Surface, TRANSPARENT, rasterizeToSegments, rasterizeToText } from "./index.js";

describe("invariants", () => {
  it("rasterized rows always have exactly `width` columns", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 20 }), (w, h) => {
        const text = rasterizeToText(Surface.create(w, h));
        return text.length === h && text.every((line) => [...line].length === w);
      }),
    );
  });

  it("blitting a fully-transparent surface is a no-op", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 15 }), (w, h) => {
        const base = Surface.create(w, h);
        const before = base.clone();
        base.blit(Surface.transparent(w, h), 0, 0);
        return base.equals(before);
      }),
    );
  });

  it("coalesced segment text concatenates back to the row text", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (w) => {
        const s = Surface.create(w, 1);
        const segs = rasterizeToSegments(s)[0] ?? [];
        return segs.map((seg) => seg.text).join("").length === w;
      }),
    );
  });
});
```

### 9.4 Component smoke test — `packages/ink/src/CellSurface.test.tsx`

```tsx
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { Surface, rgb } from "@learn-engine/core";
import { CellSurface } from "./CellSurface.js";

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("CellSurface", () => {
  it("renders `height` rows whose stripped text equals the grid", () => {
    const s = Surface.create(3, 2);
    s.drawText(0, 0, "abc", { fg: rgb(0, 255, 0) });
    const { lastFrame } = render(<CellSurface surface={s} />);
    expect(strip(lastFrame() ?? "").split("\n")).toEqual(["abc", "   "]);
  });

  it("emits color escapes for non-default cells", () => {
    const s = Surface.create(1, 1);
    s.drawText(0, 0, "x", { fg: rgb(255, 0, 0) });
    const { lastFrame } = render(<CellSurface surface={s} />);
    expect(lastFrame()).toMatch(/\x1b\[/); // some SGR present
  });
});
```

> If `ink-testing-library` cannot resolve against your pinned Ink 7, **skip this file** (`describe.skip`) and rely on §9.1–9.3. Correctness does not depend on it; it only guards the trivial Segment→`<Text>` mapping.

### 9.5 Dependency-boundary test — `packages/core/src/no-render-deps.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("@learn-engine/core purity", () => {
  it("declares no react/ink dependency", () => {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.peerDependencies };
    expect(Object.keys(all)).not.toContain("react");
    expect(Object.keys(all)).not.toContain("ink");
  });
});
```

---

## 10. Visual harness — `apps/harness/src/main.ts`

A non-test sanity check you run in a real terminal to confirm colors, alignment, borders, and transparency look right end-to-end.

```ts
import { BORDERS, Surface, rasterizeToAnsi, rgb } from "@learn-engine/core";

const W = 60;
const H = 18;
const screen = Surface.create(W, H);

// 1. bordered frame
screen.drawBox({ x: 0, y: 0, width: W, height: H }, BORDERS.bold, { fg: rgb(90, 90, 90) });

// 2. heading (bold green)
screen.drawText(4, 2, "SURFACE DEMO", { fg: rgb(0, 255, 128), bold: true });

// 3. a "tile band" of dotted green-on-default to blit a sprite over
screen.fillRect({ x: 2, y: 6, width: W - 4, height: 5 }, { char: ".", fg: rgb(40, 90, 40), bg: "default", bold: false });

// 4. a sprite with TRANSPARENT background → the dotted band must show through behind it
const sprite = Surface.transparent(5, 1);
sprite.drawText(0, 0, "(o_o)", { fg: rgb(255, 80, 80) }); // bg undefined → inherit
screen.blit(sprite, 6, 8);

// 5. a multi-color row to eyeball run coalescing
screen.drawText(4, 13, "RED", { fg: rgb(255, 0, 0) });
screen.drawText(7, 13, "GRN", { fg: rgb(0, 255, 0) });
screen.drawText(10, 13, "BLU", { fg: rgb(80, 120, 255) });

process.stdout.write(rasterizeToAnsi(screen).join("\n") + "\n");
```

**What to verify by eye:** the bold-line frame is unbroken; "SURFACE DEMO" is bold green; the dotted band is visible *behind* the red `(o_o)` sprite (proving transparent-bg compositing); the RED/GRN/BLU words render in their colors with no bleed.

---

## 11. Acceptance criteria

Each criterion is binary and verifiable via the tests in §9 or the harness in §10.

**Color & cell**
- **AC-1** `rgb(r,g,b)` clamps each channel to `0..255` and rounds; `rgb(300,-5,1.6)` → `{r:255,g:0,b:2}`.
- **AC-2** `fgSgr`/`bgSgr` emit `38;2;r;g;b`/`48;2;r;g;b` for `Rgb` and `39`/`49` for `"default"`.
- **AC-3** `toHex(Rgb)` returns `#rrggbb`; `toHex("default")` and `toHex(undefined)` return `undefined`.

**Surface**
- **AC-4** `Surface.create(w,h)` holds exactly `w*h` cells equal to the fill; non-positive/non-integer dims throw `RangeError`.
- **AC-5** In-bounds `set`/`get` round-trip; OOB `get` throws `RangeError`; OOB `set` is a no-op; `tryGet` returns `undefined` OOB.
- **AC-6** `drawText` writes left-to-right and clips at the right and vertical edges (no throw, no wrap).
- **AC-7** `drawBox` produces the correct corner/edge glyphs for every entry in `BORDERS`.
- **AC-8** `blit` obeys the §5.1 truth table exactly: opaque overwrite, transparent (`char:null`) skip, and per-channel inherit for `fg`/`bg`/`bold`.
- **AC-9** `blit` clips negative and overflowing offsets without throwing or reading/writing OOB.
- **AC-10** `clone()` is independent of the original; `equals()` is true iff every cell is structurally equal.

**Rasterizer**
- **AC-11** `rasterizeToSegments` coalesces maximal same-style runs: a uniform row of `N` cells yields exactly one segment.
- **AC-12** For any surface, concatenating a row's segment texts reproduces that row's resolved characters (`null`→space), length `width`.
- **AC-13** `rasterizeToAnsi` produces `height` lines, each SGR-prefixed and terminated with `\x1b[0m`; ansi-stripped, each line equals the row text.

**Component**
- **AC-14** `<CellSurface surface={s}>` renders exactly `s.height` rows; the ansi-stripped `lastFrame()` equals the surface's text grid.
- **AC-15** Non-default cells produce SGR escapes in the rendered frame.

**Toolchain / quality**
- **AC-16** `tsc -b` passes with the strict flags in §3.2 (no `any`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **AC-17** `@learn-engine/core` declares no `react`/`ink` dependency (enforced by §9.5).
- **AC-18** Performance: rasterizing an 80×30 surface to segments completes in **< 2 ms** on a typical dev laptop (measure with `console.time` around `rasterizeToSegments`; informational budget, not a hard CI gate).

---

## 12. Detailed testing steps

Run from the repository root.

1. **Install**

   ```bash
   pnpm install
   ```

   *Expected:* a clean install. If a peer-dependency warning mentions `ink-testing-library` vs Ink 7, note it for step 5 (it does not affect core tests).

2. **Typecheck (AC-16)**

   ```bash
   pnpm typecheck
   ```

   *Expected:* exit 0, no diagnostics. A failure here usually means an `undefined`-vs-`"default"` confusion in the cell/color code — re-read §5.

3. **Build the packages**

   ```bash
   pnpm build
   ```

   *Expected:* `packages/core/dist` and `packages/ink/dist` populated with `.js` + `.d.ts`.

4. **Run the pure test suite (AC-1 … AC-13, AC-17)**

   ```bash
   pnpm test
   ```

   *Expected:* all of `surface.test.ts`, `rasterize.test.ts`, `surface.prop.test.ts`, `no-render-deps.test.ts` green. These require no Ink, no terminal, no DOM. This is the authoritative correctness gate.

5. **Run the component test (AC-14, AC-15)**

   ```bash
   pnpm test packages/ink
   ```

   *Expected:* `CellSurface.test.tsx` green. *If* it fails only on `ink-testing-library` resolution against Ink 7, mark the file `describe.skip` and proceed — §9.4 explains why correctness is unaffected; record it as a known toolchain pin to revisit.

6. **Visual harness in a real terminal (AC-8 transparency, colors, borders — by eye)**

   ```bash
   pnpm harness
   ```

   *Expected output (in Konsole / GNOME Terminal / any truecolor terminal):*
   - an unbroken bold-line frame,
   - "SURFACE DEMO" in **bold green**,
   - a dotted green band with the red `(o_o)` sprite on it **and the dots visible behind/around the sprite** (this is the transparent-background blit working — the single most important thing to confirm visually),
   - a row reading `RED GRN BLU` each in its own color.

   Resize the window and re-run; the output is a fixed 60×18 block and should render identically regardless of terminal size.

7. **Performance spot check (AC-18)**

   Add temporarily to the harness, or run a one-off:

   ```ts
   import { Surface, rasterizeToSegments } from "@learn-engine/core";
   const s = Surface.create(80, 30);
   console.time("raster"); for (let i = 0; i < 1000; i++) rasterizeToSegments(s); console.timeEnd("raster");
   ```

   *Expected:* ≪ 2 ms per call (i.e. the 1000-iteration total well under 2 s, typically a few hundred ms).

8. **Lint (optional)**

   ```bash
   pnpm lint
   ```

   *Expected:* clean, or only style nits you choose to accept.

---

## 13. Definition of Done

The graphics spine is done when:

- All files in §4–§10 exist and `pnpm typecheck && pnpm build && pnpm test` pass (steps 2–5 green; step 5 green or explicitly skipped per §9.4).
- The harness (step 6) renders correctly in at least one truecolor terminal, with transparent-bg compositing visibly working.
- All acceptance criteria AC-1 … AC-18 hold.
- `@learn-engine/core` has zero `react`/`ink` dependencies.

---

## 14. Forward-compatibility notes (how the rest plugs in)

These are **not** built now, but the spine is shaped so each lands as a client without changing the substrate:

- **Tilemap / sprite layer** → produce a `Surface` (tilemap is `fillRect`/`drawText` per tile; sprites are `Surface.transparent` blitted over it). Renders via `<CellSurface>`.
- **Maze** → a tilemap plus a generator and a BFS/A* over walkable tiles; rendering is unchanged.
- **Effects pipeline** → `type Effect = (input: Surface, t: number) => Surface`. Each effect reads a surface and returns a new one (color-cycle, blink, wipe, shake, and the deferred shadow/outline). Composed left-to-right, fed to `<CellSurface>`. The clock that supplies `t` is the engine's, not the spine's.
- **Banner / big font** → a producer of a `Surface` (cfonts glyph lines drawn via `drawText`, optionally composited with the effects pipeline later). Renders via `<CellSurface>`.
- **Viewport/camera** → a function `(world: Surface, camera: Rect) => Surface` that blits a sub-window into a screen-sized surface. Whole-cell scrolling only.

The seam that makes all of this work is the one rule this spine enforces: **everything spatial becomes a `Surface`, and exactly one component turns a `Surface` into pixels.**
