/**
 * The single, content-adaptive layout engine for every inline keyboard in
 * the bot. Callers supply an ordered list of buttons (text + callback); this
 * decides ONLY the row breaks -- it never changes a button's text, callback,
 * or order.
 *
 * There is no fixed "2 per row" or "3 per row". The rule is a hard
 * no-truncation guarantee: Telegram splits a row's width EQUALLY among its
 * buttons, so N buttons each get 1/N of the row. A group of buttons may
 * share a row only when the WIDEST label among them still fits inside a
 * 1/N-width column. The moment a button would be squeezed too narrow, it is
 * pushed to a new (wider, up to full) row instead. The effect:
 *
 *   - short labels  (e.g. "USD", "15%")        -> up to 3 per row
 *   - medium labels (e.g. "🔄 تغيير العملة")     -> up to 2 per row
 *   - long labels   (e.g. "FedEx Priority - 350 SAR") -> a full-width row
 *
 * Readability always wins: a long label is never crammed into a narrow
 * column where Telegram would clip it to "FedEx Econ…". Density only applies
 * to the leftover space that genuinely fits.
 *
 * A "Continue" button (identified by the ➡️ marker) is always lifted onto
 * its own first row, since it is the screen's primary progression action.
 */
import { InlineKeyboard } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";

export interface KeyboardButton {
  text: string;
  data: string;
}

/**
 * Visual width (in the units of `visualWidth`) that a single full-width
 * button can display before Telegram truncates. A row of N buttons gives
 * each a column of ROW_WIDTH_UNITS / N; a label must fit that column.
 * Deliberately conservative -- when unsure, the engine gives more room.
 */
const ROW_WIDTH_UNITS = 28;
/** Never exceed three buttons in a row, however short the labels. */
const MAX_BUTTONS_PER_ROW = 3;

const CONTINUE_MARKER = "➡️";

function isContinue(button: KeyboardButton): boolean {
  return button.text.trimStart().startsWith(CONTINUE_MARKER);
}

/**
 * Approximate on-screen width of a label. Latin letters, digits, spaces and
 * Arabic letters count as one; pictographic emoji and arrow/symbol glyphs
 * render roughly twice as wide; zero-width joiners and variation selectors
 * add nothing. Good enough to rank labels as short / medium / long.
 */
function visualWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) {
      continue; // ZWJ / variation selectors
    }
    const isWideSymbol =
      (cp >= 0x1f000 && cp <= 0x1faff) || // emoji & pictographs
      (cp >= 0x2600 && cp <= 0x27bf) || // misc symbols & dingbats (✅ 📋 …)
      (cp >= 0x2b00 && cp <= 0x2bff); // arrows & shapes (⬅️ …)
    width += isWideSymbol ? 2 : 1;
  }
  return width;
}

/**
 * A group of buttons fits one row only if, when the row is split equally
 * among them, the widest label still fits its column: count * widest <=
 * ROW_WIDTH_UNITS. A single button always "fits" its own row -- even an
 * over-long label gets the full width, the most room possible.
 */
function fitsRow(buttons: KeyboardButton[]): boolean {
  if (buttons.length <= 1) return true;
  if (buttons.length > MAX_BUTTONS_PER_ROW) return false;
  const widest = Math.max(...buttons.map((button) => visualWidth(button.text)));
  return buttons.length * widest <= ROW_WIDTH_UNITS;
}

/**
 * Greedy row packing that preserves order. A button joins the current row
 * only while the whole row still fits without truncation; otherwise it
 * starts a new row.
 */
function packRows(buttons: KeyboardButton[]): KeyboardButton[][] {
  const rows: KeyboardButton[][] = [];
  let current: KeyboardButton[] = [];

  for (const button of buttons) {
    if (current.length > 0 && !fitsRow([...current, button])) {
      rows.push(current);
      current = [];
    }
    current.push(button);
  }

  if (current.length > 0) rows.push(current);
  return rows;
}

export function layoutKeyboard(buttons: KeyboardButton[]): InlineKeyboard {
  const continueButton = buttons.find(isContinue);

  const rows: KeyboardButton[][] = continueButton
    ? [[continueButton], ...packRows(buttons.filter((button) => button !== continueButton))]
    : packRows(buttons);

  // Build via InlineKeyboard.from so no trailing empty row is ever emitted.
  const rendered: InlineKeyboardButton[][] = rows.map((row) =>
    row.map((button) => InlineKeyboard.text(button.text, button.data))
  );

  return InlineKeyboard.from(rendered);
}
