import {
  BORDERS,
  type BorderGlyphs,
  type ColorValue,
  type Rect,
  type Surface,
} from "@learn-engine/core";

/**
 * The box render-intent: a filled, framed panel — the primitive for dialogs, HUD panels, and
 * input fields. Optionally draws a second inset border (the nested-frame look) and a title
 * embedded in the top edge. Composited onto the surface; cells only.
 */
export interface BoxStyle {
  readonly border: ColorValue;
  readonly background: ColorValue;
  /** Border glyph set. Default BORDERS.bold. */
  readonly glyphs?: BorderGlyphs;
  /** Draw a second border inset by one cell (the nested-frame look). */
  readonly nested?: boolean;
  /** Optional label embedded in the top edge. */
  readonly title?: string;
  readonly titleColor?: ColorValue;
  readonly bold?: boolean;
}

export function drawBox(surface: Surface, rect: Rect, style: BoxStyle): void {
  const glyphs = style.glyphs ?? BORDERS.bold;
  const bold = style.bold ?? false;
  const borderStyle = { fg: style.border, bg: style.background, bold };

  surface.fillRect(rect, {
    char: " ",
    fg: style.background,
    bg: style.background,
    bold: false,
  });
  surface.drawBox(rect, glyphs, borderStyle);

  if (style.nested === true) {
    const inner: Rect = {
      x: rect.x + 1,
      y: rect.y + 1,
      width: rect.width - 2,
      height: rect.height - 2,
    };
    if (inner.width > 0 && inner.height > 0) {
      surface.drawBox(inner, glyphs, borderStyle);
    }
  }

  if (style.title !== undefined && style.title.length > 0) {
    surface.drawText(rect.x + 2, rect.y, ` ${style.title} `, {
      fg: style.titleColor ?? style.border,
      bg: style.background,
      bold,
    });
  }
}
