/** The closed navigation/action vocabulary. Arcade movement reads `held`; discrete
 *  actions/menus read `edges`. */
export type Direction = "up" | "down" | "left" | "right";
export type Button = "select" | "back";
export type Key = Direction | Button;

/** A key-down transition that occurred during this tick. */
export type InputEdge =
  | { readonly kind: "dir"; readonly dir: Direction }
  | { readonly kind: "button"; readonly button: Button };

/** Text/numeric entry. First-class per ADR 0001 (no replay trace to protect). */
export type TextEdit =
  | { readonly kind: "insert"; readonly text: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "submit" };

/**
 * One tick of normalized input. `edges` = discrete presses (ordered); `held` = keys currently
 * down (continuous movement); `text` = entry events. Adapters normalize raw events into this.
 */
export interface InputFrame {
  readonly edges: readonly InputEdge[];
  readonly held: ReadonlySet<Key>;
  readonly text: readonly TextEdit[];
}

/** An inert frame — no presses, nothing held, no entry. */
export const EMPTY_INPUT: InputFrame = {
  edges: [],
  held: new Set<Key>(),
  text: [],
};

/** True if this frame carries any player activity (used to reset the inactivity watchdog). */
export function hasActivity(input: InputFrame): boolean {
  return input.edges.length > 0 || input.text.length > 0 || input.held.size > 0;
}
