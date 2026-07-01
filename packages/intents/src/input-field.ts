import type { ColorValue, Rect, Surface } from "@learn-engine/core";
import { drawBox } from "./box.js";

/**
 * The input-field render-intent: a framed, labeled text-entry field with a tick-blinking cursor.
 * Composes the box intent for its frame; composited onto the surface; cells only. The cursor is a
 * pure function of the tick, so it blinks deterministically under the pull-based runtime.
 */
export interface InputFieldStyle {
  readonly border: ColorValue;
  readonly background: ColorValue;
  readonly label: ColorValue;
  readonly value: ColorValue;
  readonly cursor: ColorValue;
  readonly bold?: boolean;
  readonly nested?: boolean;
  /** Cursor blink half-period in ticks. Default 30. */
  readonly blinkTicks?: number;
}

export interface InputFieldContent {
  readonly label: string;
  readonly value: string;
  readonly tick: number;
}

const CURSOR = "█";

export function drawInputField(
  surface: Surface,
  rect: Rect,
  content: InputFieldContent,
  style: InputFieldStyle,
): void {
  const bold = style.bold ?? false;
  const nested = style.nested ?? false;

  drawBox(surface, rect, {
    border: style.border,
    background: style.background,
    nested,
    bold,
  });

  const pad = nested ? 2 : 1;
  const cx = rect.x + pad + 1;
  const cy = rect.y + Math.floor(rect.height / 2);
  surface.drawText(cx, cy, content.label, {
    fg: style.label,
    bg: style.background,
    bold,
  });

  const valueX = cx + content.label.length + 2;
  surface.drawText(valueX, cy, content.value, {
    fg: style.value,
    bg: style.background,
    bold,
  });

  const blink = style.blinkTicks ?? 30;
  if (Math.floor(content.tick / blink) % 2 === 0) {
    surface.set(valueX + content.value.length, cy, {
      char: CURSOR,
      fg: style.cursor,
      bg: style.background,
      bold: true,
    });
  }
}
