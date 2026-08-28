/**
 * Escaping for Telegram's HTML parse mode.
 *
 * The Dashboard renders with parse_mode "HTML" rather than legacy Markdown
 * because product names and URLs routinely contain `_`, `*` and `[`, which
 * make Markdown parsing throw and the whole render fail. Every value that
 * originates from user input must pass through escapeHtml before being
 * placed into rendered text.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
