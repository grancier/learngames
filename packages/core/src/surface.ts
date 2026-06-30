import { BLANK, type Cell, type CellStyle } from "./cell.js";
import { colorEq } from "./color.js";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BorderGlyphs {
  readonly tl: string;
  readonly tr: string;
  readonly bl: string;
  readonly br: string;
  readonly top: string;
  readonly bottom: string;
  readonly left: string;
  readonly right: string;
}

export const BORDERS = {
  single: {
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
    top: "─",
    bottom: "─",
    left: "│",
    right: "│",
  },
  double: {
    tl: "╔",
    tr: "╗",
    bl: "╚",
    br: "╝",
    top: "═",
    bottom: "═",
    left: "║",
    right: "║",
  },
  round: {
    tl: "╭",
    tr: "╮",
    bl: "╰",
    br: "╯",
    top: "─",
    bottom: "─",
    left: "│",
    right: "│",
  },
  bold: {
    tl: "┏",
    tr: "┓",
    bl: "┗",
    br: "┛",
    top: "━",
    bottom: "━",
    left: "┃",
    right: "┃",
  },
} as const satisfies Record<string, BorderGlyphs>;

export class Surface {
  readonly width: number;
  readonly height: number;
  private readonly cells: Cell[];

  private constructor(width: number, height: number, cells: Cell[]) {
    this.width = width;
    this.height = height;
    this.cells = cells;
  }

  static create(width: number, height: number, fill: Cell = BLANK): Surface {
    assertDims(width, height);
    return new Surface(
      width,
      height,
      new Array<Cell>(width * height).fill(fill),
    );
  }

  static transparent(width: number, height: number): Surface {
    return Surface.create(width, height, { char: null });
  }

  private idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Cell {
    if (!this.inBounds(x, y)) {
      throw new RangeError(
        `get(${x},${y}) out of bounds for ${this.width}x${this.height}`,
      );
    }
    return this.cells[this.idx(x, y)] as Cell;
  }

  tryGet(x: number, y: number): Cell | undefined {
    return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : undefined;
  }

  set(x: number, y: number, cell: Cell): void {
    if (this.inBounds(x, y)) this.cells[this.idx(x, y)] = cell;
  }

  row(y: number): readonly Cell[] {
    if (!Number.isInteger(y) || y < 0 || y >= this.height) {
      throw new RangeError(`row(${y}) out of bounds for height ${this.height}`);
    }
    const start = y * this.width;
    return this.cells.slice(start, start + this.width);
  }

  fill(cell: Cell): void {
    this.cells.fill(cell);
  }

  clear(fill: Cell = BLANK): void {
    this.cells.fill(fill);
  }

  drawText(x: number, y: number, text: string, style: CellStyle = {}): void {
    let cx = x;
    for (const char of text) {
      this.set(cx, y, {
        char,
        fg: style.fg,
        bg: style.bg,
        bold: style.bold,
      });
      cx += 1;
    }
  }

  fillRect(rect: Rect, cell: Cell): void {
    for (let yy = rect.y; yy < rect.y + rect.height; yy++) {
      for (let xx = rect.x; xx < rect.x + rect.width; xx++) {
        this.set(xx, yy, cell);
      }
    }
  }

  drawBox(rect: Rect, border: BorderGlyphs, style: CellStyle = {}): void {
    const { x, y, width, height } = rect;
    if (width <= 0 || height <= 0) return;

    const styled = (char: string): Cell => ({
      char,
      fg: style.fg,
      bg: style.bg,
      bold: style.bold,
    });
    const x2 = x + width - 1;
    const y2 = y + height - 1;

    this.set(x, y, styled(border.tl));
    this.set(x2, y, styled(border.tr));
    this.set(x, y2, styled(border.bl));
    this.set(x2, y2, styled(border.br));

    for (let xx = x + 1; xx < x2; xx++) {
      this.set(xx, y, styled(border.top));
      this.set(xx, y2, styled(border.bottom));
    }

    for (let yy = y + 1; yy < y2; yy++) {
      this.set(x, yy, styled(border.left));
      this.set(x2, yy, styled(border.right));
    }
  }

  blit(src: Surface, dx: number, dy: number): void {
    for (let sy = 0; sy < src.height; sy++) {
      const ty = dy + sy;
      if (ty < 0 || ty >= this.height) continue;

      for (let sx = 0; sx < src.width; sx++) {
        const tx = dx + sx;
        if (tx < 0 || tx >= this.width) continue;

        const source = src.cells[src.idx(sx, sy)] as Cell;
        const destination = this.cells[this.idx(tx, ty)] as Cell;
        this.cells[this.idx(tx, ty)] = {
          char: source.char === null ? destination.char : source.char,
          fg: source.fg === undefined ? destination.fg : source.fg,
          bg: source.bg === undefined ? destination.bg : source.bg,
          bold: source.bold === undefined ? destination.bold : source.bold,
        };
      }
    }
  }

  clone(): Surface {
    return new Surface(this.width, this.height, this.cells.slice());
  }

  equals(other: Surface): boolean {
    if (this.width !== other.width || this.height !== other.height)
      return false;
    for (let index = 0; index < this.cells.length; index++) {
      if (!cellEq(this.cells[index] as Cell, other.cells[index] as Cell))
        return false;
    }
    return true;
  }
}

function assertDims(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(`invalid surface dimensions ${width}x${height}`);
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
