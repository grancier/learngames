/** Truecolor RGB triple, each channel normalized to 0..255. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * A resolved color: either concrete truecolor or the runtime's default color.
 * `undefined` remains reserved for inherit/omit semantics at higher layers.
 */
export type ColorValue = Rgb | "default";

const clampByte = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : 0;

export function rgb(r: number, g: number, b: number): Rgb {
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
}

export function toHex(c: ColorValue | undefined): string | undefined {
  if (c === undefined || c === "default") return undefined;
  const h = (n: number): string => n.toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

export function fgSgr(c: ColorValue): string {
  return c === "default" ? "39" : `38;2;${c.r};${c.g};${c.b}`;
}

export function bgSgr(c: ColorValue): string {
  return c === "default" ? "49" : `48;2;${c.r};${c.g};${c.b}`;
}

export function colorEq(
  a: ColorValue | undefined,
  b: ColorValue | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === "default" || b === "default")
    return false;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
