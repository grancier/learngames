import type { ColorValue } from "./color.js";

export interface Cell {
  readonly char: string | null;
  readonly fg?: ColorValue | undefined;
  readonly bg?: ColorValue | undefined;
  readonly bold?: boolean | undefined;
}

export const BLANK: Cell = {
  char: " ",
  fg: "default",
  bg: "default",
  bold: false,
};

export const TRANSPARENT: Cell = { char: null };

export interface CellStyle {
  readonly fg?: ColorValue | undefined;
  readonly bg?: ColorValue | undefined;
  readonly bold?: boolean | undefined;
}
