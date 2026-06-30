import type { Cell } from "./cell.js";
import { type ColorValue, bgSgr, colorEq, fgSgr } from "./color.js";
import type { Surface } from "./surface.js";

export interface Segment {
  readonly text: string;
  readonly fg: ColorValue;
  readonly bg: ColorValue;
  readonly bold: boolean;
}

const resolveChar = (cell: Cell): string => cell.char ?? " ";
const resolveFg = (cell: Cell): ColorValue => cell.fg ?? "default";
const resolveBg = (cell: Cell): ColorValue => cell.bg ?? "default";

export function rasterizeToSegments(surface: Surface): Segment[][] {
  const rows: Segment[][] = [];

  for (let y = 0; y < surface.height; y++) {
    const segments: Segment[] = [];
    let current: Segment | null = null;

    for (const cell of surface.row(y)) {
      const fg = resolveFg(cell);
      const bg = resolveBg(cell);
      const bold = cell.bold ?? false;
      const char = resolveChar(cell);

      if (
        current !== null &&
        colorEq(current.fg, fg) &&
        colorEq(current.bg, bg) &&
        current.bold === bold
      ) {
        current = {
          text: current.text + char,
          fg: current.fg,
          bg: current.bg,
          bold: current.bold,
        };
        segments[segments.length - 1] = current;
      } else {
        current = { text: char, fg, bg, bold };
        segments.push(current);
      }
    }

    rows.push(segments);
  }

  return rows;
}

export function rasterizeToAnsi(surface: Surface): string[] {
  return rasterizeToSegments(surface).map(
    (segments) =>
      `${segments
        .map((segment) => {
          const sgr = [
            segment.bold ? "1" : "22",
            fgSgr(segment.fg),
            bgSgr(segment.bg),
          ].join(";");
          return `\x1b[${sgr}m${segment.text}`;
        })
        .join("")}\x1b[0m`,
  );
}

export function rasterizeToText(surface: Surface): string[] {
  return rasterizeToSegments(surface).map((segments) =>
    segments.map((segment) => segment.text).join(""),
  );
}
