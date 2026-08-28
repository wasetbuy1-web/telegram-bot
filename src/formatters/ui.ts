/**
 * Reusable presentation helpers so every screen renders Arabic consistently
 * and right-to-left. Telegram already right-aligns a paragraph whose first
 * strong character is Arabic, but a line that starts with an emoji (a
 * direction-neutral glyph) can render inconsistently; prefixing an explicit
 * Right-to-Left Mark anchors the whole line to RTL regardless.
 *
 * Text only -- these change presentation, never wording or flow.
 */

/** Right-to-Left Mark: zero-width, forces the line's paragraph direction to RTL. */
export const RLM = "‏";

/** Anchors a line (or block) to RTL so it stays right-aligned even when it starts with an emoji. */
export function rtl(text: string): string {
  return `${RLM}${text}`;
}

/**
 * One consistent title format for every screen: RTL-anchored, emoji first,
 * the label in bold. Use this instead of hand-writing `emoji *text*` so all
 * titles share the same spacing and weight.
 */
export function title(emoji: string, text: string): string {
  return `${RLM}${emoji} *${text}*`;
}
