import { type ColorValue, Surface } from "@learn-engine/core";
import {
  GLYPH_GAP,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  LINE_GAP,
  glyphFor,
} from "./font.js";

/**
 * The banner render-intent: compile text into big block glyphs composited onto cells via the
 * upper-half-block "▀" (foreground = top pixel, background = bottom pixel), which doubles the
 * vertical resolution and paints SOLID colored blocks — not text. Optional black outline and a
 * drop-shadow are separate layers, matching the 8-bit look. Kill-filter clean: cells only.
 */
export interface BannerStyle {
  readonly fill: ColorValue;
  readonly background: ColorValue;
  /** Outline color drawn as a 1-pixel ring around the fill. Omit for no outline. */
  readonly outline?: ColorValue;
  /** Drop-shadow color drawn offset under the fill. Omit for no shadow. */
  readonly shadow?: ColorValue;
  /** Fraction of the surface's doubled pixel height the text block fills (0..1). Default 0.85. */
  readonly heightFraction?: number;
  /** Shadow offset in half-block pixels. Default scales with the glyph height. */
  readonly shadowOffset?: number;
}

const HALF_BLOCK = "▀";
const EMPTY = 0;
const SHADOW = 1;
const OUTLINE = 2;
const FILL = 3;

interface Mask {
  readonly data: readonly boolean[];
  readonly width: number;
  readonly height: number;
}

/** A single line of text rasterized to a native-resolution pixel mask. */
function lineMask(line: string): Mask {
  const chars = [...line];
  const width =
    chars.length === 0
      ? 0
      : chars.length * GLYPH_WIDTH + (chars.length - 1) * GLYPH_GAP;
  const data = new Array<boolean>(width * GLYPH_HEIGHT).fill(false);
  let ox = 0;
  for (const ch of chars) {
    const glyph = glyphFor(ch);
    for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
      const rowStr = glyph[gy] as string;
      for (let gx = 0; gx < GLYPH_WIDTH; gx++) {
        if (rowStr[gx] === "#") data[gy * width + (ox + gx)] = true;
      }
    }
    ox += GLYPH_WIDTH + GLYPH_GAP;
  }
  return { data, width, height: GLYPH_HEIGHT };
}

/** Stack the lines vertically (each centered) into one block mask. */
function blockMask(lines: readonly string[]): Mask {
  const masks = lines.map(lineMask);
  const width = masks.reduce((m, lm) => Math.max(m, lm.width), 0);
  const height = masks.length * GLYPH_HEIGHT + (masks.length - 1) * LINE_GAP;
  const data = new Array<boolean>(width * height).fill(false);
  let oy = 0;
  for (const lm of masks) {
    const dx = Math.floor((width - lm.width) / 2);
    for (let y = 0; y < GLYPH_HEIGHT; y++) {
      for (let x = 0; x < lm.width; x++) {
        if (lm.data[y * lm.width + x] === true) {
          data[(oy + y) * width + (dx + x)] = true;
        }
      }
    }
    oy += GLYPH_HEIGHT + LINE_GAP;
  }
  return { data, width, height };
}

/** Fill the role grid (pw × ph pixels) for the scaled, centered text with shadow/outline/fill. */
function composeRoles(
  roles: number[],
  pw: number,
  ph: number,
  text: string,
  style: BannerStyle,
): void {
  const mask = blockMask(text.split("\n"));
  if (mask.width === 0) return;

  const maxHeight = Math.max(
    1,
    Math.floor(ph * (style.heightFraction ?? 0.85)),
  );
  const scale = Math.min(maxHeight / mask.height, pw / mask.width);
  const tw = Math.max(1, Math.round(mask.width * scale));
  const th = Math.max(1, Math.round(mask.height * scale));
  const ox = Math.floor((pw - tw) / 2);
  const oy = Math.floor((ph - th) / 2);
  const offset = style.shadowOffset ?? Math.max(1, Math.round(th * 0.08));

  // Nearest-neighbor upscale the mask into a pw×ph fill grid, centered.
  const fill = new Array<boolean>(pw * ph).fill(false);
  for (let y = 0; y < th; y++) {
    const sy = Math.floor((y * mask.height) / th);
    for (let x = 0; x < tw; x++) {
      const sx = Math.floor((x * mask.width) / tw);
      if (mask.data[sy * mask.width + sx] === true) {
        fill[(oy + y) * pw + (ox + x)] = true;
      }
    }
  }

  // Bottom layer: drop-shadow (fill shape, offset down-right).
  if (style.shadow !== undefined) {
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        if (fill[py * pw + px] !== true) continue;
        const sx = px + offset;
        const sy = py + offset;
        if (sx < pw && sy < ph) roles[sy * pw + sx] = SHADOW;
      }
    }
  }

  // Middle layer: outline (1-pixel ring around, but not on, the fill).
  if (style.outline !== undefined) {
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        if (fill[py * pw + px] !== true) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) continue;
            if (fill[ny * pw + nx] === true) continue;
            roles[ny * pw + nx] = OUTLINE;
          }
        }
      }
    }
  }

  // Top layer: the fill itself.
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      if (fill[py * pw + px] === true) roles[py * pw + px] = FILL;
    }
  }
}

/** Composite a text banner onto an existing surface. Empty cells are left untouched. */
export function drawBanner(
  surface: Surface,
  text: string,
  style: BannerStyle,
): void {
  const pw = surface.width;
  const ph = surface.height * 2;
  const roles = new Array<number>(pw * ph).fill(EMPTY);
  composeRoles(roles, pw, ph, text, style);

  const colorOf = (role: number): ColorValue => {
    switch (role) {
      case FILL:
        return style.fill;
      case OUTLINE:
        return style.outline as ColorValue;
      case SHADOW:
        return style.shadow as ColorValue;
      default:
        return style.background;
    }
  };

  for (let cy = 0; cy < surface.height; cy++) {
    for (let x = 0; x < pw; x++) {
      const top = roles[cy * 2 * pw + x] as number;
      const bottom = roles[(cy * 2 + 1) * pw + x] as number;
      if (top === EMPTY && bottom === EMPTY) continue;
      surface.set(x, cy, {
        char: HALF_BLOCK,
        fg: colorOf(top),
        bg: colorOf(bottom),
        bold: true,
      });
    }
  }
}

/** Create a background-filled surface and draw the banner onto it. */
export function renderBanner(
  width: number,
  height: number,
  text: string,
  style: BannerStyle,
): Surface {
  const surface = Surface.create(width, height, {
    char: " ",
    fg: style.background,
    bg: style.background,
    bold: false,
  });
  drawBanner(surface, text, style);
  return surface;
}
