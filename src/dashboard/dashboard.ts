/**
 * The Dashboard: the bot's primary surface.
 *
 * renderDashboard is a pure function of session state -- it performs no IO,
 * touches no Telegram API, and stores nothing. Every value it displays is
 * derived on the spot, which is what lets any change re-render instantly
 * without a "calculate" step.
 *
 * Sections are omitted entirely (not shown empty) until they carry meaning,
 * so an empty quote reads as simple and a complete one reads as complete.
 *
 * Commit 1 scope: Products and Shipping, rendered from the session shape
 * that already exists. Carriers and Totals arrive with the shipping and
 * pricing commits.
 */
import { InlineKeyboard } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";

import { CALLBACKS, withId } from "../constants/callbacks.js";
import type { SessionData } from "../session/session.js";
import type { Product } from "../types/quote.js";
import { escapeHtml } from "../utils/html.js";

export interface RenderedScreen {
  text: string;
  keyboard: InlineKeyboard;
}

const SEPARATOR = "━━━━━━━━━━━━━━━━━";
const CIRCLED_NUMERALS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

/** Above this many products, rows collapse to one line and drop the website. */
const COMPACT_THRESHOLD = 6;
/** Above this many products, per-row buttons give way to a single manage button. */
const MANAGE_THRESHOLD = 8;

export function renderDashboard(session: SessionData): RenderedScreen {
  return {
    text: buildText(session),
    keyboard: buildKeyboard(session),
  };
}

function buildText(session: SessionData): string {
  const sections = [
    headerSection(session),
    productsSection(session),
    shippingSection(session),
  ];

  return sections.filter((section): section is string => section !== undefined).join("\n\n");
}

function headerSection(session: SessionData): string {
  return session.draft.products.length === 0 ? "🧾 تسعيرة جديدة" : "🧾 تسعيرة · مسودة";
}

function productsSection(session: SessionData): string {
  const { products } = session.draft;

  if (products.length === 0) {
    return "لا توجد منتجات بعد\n\nأرسل رابط المنتج مباشرة\nأو اضغط ➕ إضافة منتج";
  }

  const compact = products.length > COMPACT_THRESHOLD;
  const rows = products.map((product, index) =>
    compact ? compactProductRow(product, index) : fullProductRow(product, index)
  );

  return [
    sectionTitle(`📦 المنتجات (${products.length})`),
    rows.join(compact ? "\n" : "\n\n"),
    `القيمة: ${formatTotalValue(products)}`,
  ].join("\n\n");
}

function shippingSection(session: SessionData): string | undefined {
  const { shippingMethod, warehouseName, indirectWeight, shippingCompany } = session.draft;

  if (session.draft.products.length === 0) return undefined;

  if (!shippingMethod) {
    return [sectionTitle("🚚 الشحن"), "لم يتم اختيار طريقة الشحن"].join("\n\n");
  }

  const lines = [
    `الطريقة: ${shippingMethod === "direct" ? "مباشر" : "غير مباشر"}`,
  ];

  if (warehouseName) {
    lines.push(`المستودع: ${escapeHtml(warehouseName)}`);
  }

  if (indirectWeight != null) {
    lines.push(`وزن الشحنة: ${formatAmount(indirectWeight)} lb`);
  }

  if (shippingCompany) {
    lines.push(`شركة الشحن: ${escapeHtml(shippingCompany)}`);
  }

  return [sectionTitle("🚚 الشحن"), lines.join("\n")].join("\n\n");
}

function sectionTitle(title: string): string {
  return `${SEPARATOR}\n${title}\n${SEPARATOR}`;
}

function fullProductRow(product: Product, index: number): string {
  const lines = [
    `${numeral(index)} ${escapeHtml(product.name ?? "بدون اسم")}`,
    `   ${formatUnitPrice(product)}`,
    `   ${escapeHtml(product.website)}`,
  ];

  return lines.join("\n");
}

function compactProductRow(product: Product, index: number): string {
  return `${numeral(index)} ${escapeHtml(product.name ?? "بدون اسم")} · ${formatUnitPrice(product)}`;
}

function numeral(index: number): string {
  return CIRCLED_NUMERALS[index] ?? `${index + 1}.`;
}

/** e.g. "249$ × 1" -- or a warning marker when the price is still missing. */
function formatUnitPrice(product: Product): string {
  if (product.price == null) {
    return "⚠️ السعر مطلوب";
  }

  const quantity = product.quantity ?? 1;
  return `${formatMoney(product.price, product.currency ?? "USD")} × ${quantity}`;
}

/**
 * Totals are grouped by currency rather than summed blindly: adding 249 USD
 * to 95 EUR would produce a number that means nothing. Conversion to a
 * single currency belongs to the pricing engine, not to display code.
 */
function formatTotalValue(products: Product[]): string {
  const totals = new Map<string, number>();

  for (const product of products) {
    if (product.price == null) continue;
    const currency = product.currency ?? "USD";
    const quantity = product.quantity ?? 1;
    totals.set(currency, (totals.get(currency) ?? 0) + product.price * quantity);
  }

  if (totals.size === 0) return "—";

  return [...totals.entries()]
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" + ");
}

function formatMoney(amount: number, currency: string): string {
  const formatted = formatAmount(amount);
  return currency === "USD" ? `${formatted}$` : `${formatted} ${currency}`;
}

function formatAmount(value: number): string {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(2));
  return rounded.toLocaleString("en-US");
}

/**
 * Rows are collected explicitly rather than chained with .row(), because a
 * trailing .row() makes grammY emit an empty final row.
 */
function buildKeyboard(session: SessionData): InlineKeyboard {
  const { products, shippingMethod } = session.draft;
  const rows: InlineKeyboardButton[][] = [];

  if (products.length > MANAGE_THRESHOLD) {
    rows.push([
      InlineKeyboard.text(`📦 إدارة المنتجات (${products.length})`, CALLBACKS.PRODUCT_MANAGE),
    ]);
  } else {
    for (const [index, product] of products.entries()) {
      rows.push([
        InlineKeyboard.text(`✏️ ${numeral(index)}`, withId(CALLBACKS.PRODUCT_EDIT, product.id)),
        InlineKeyboard.text(`🗑 ${numeral(index)}`, withId(CALLBACKS.PRODUCT_DELETE, product.id)),
      ]);
    }
  }

  rows.push([InlineKeyboard.text("➕ إضافة منتج", CALLBACKS.PRODUCT_ADD)]);

  if (products.length > 0 && !shippingMethod) {
    rows.push([
      InlineKeyboard.text("🚚 مباشر", CALLBACKS.SHIPPING_METHOD_DIRECT),
      InlineKeyboard.text("📦 غير مباشر", CALLBACKS.SHIPPING_METHOD_INDIRECT),
    ]);
  }

  rows.push([
    products.length > 0
      ? InlineKeyboard.text("❌ إلغاء التسعيرة", CALLBACKS.QUOTE_CANCEL)
      : InlineKeyboard.text("🏠 الرئيسية", CALLBACKS.NAV_HOME),
  ]);

  return InlineKeyboard.from(rows);
}
