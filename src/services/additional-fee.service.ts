/**
 * Additional (optional) service fee shown after the shipping company is
 * chosen. Exactly ONE option is active at a time; the default is "بدون رسوم"
 * (no fee). Amounts are always in USD -- the operator enters custom fees in
 * dollars and every preset is a dollar amount.
 *
 * This module only defines the options and formats the summary line. Where
 * the fee is added to the quote total lives in pricing.service.ts; nothing
 * here touches shipping, customs, VAT, discount or commission.
 */
import type { AdditionalFeeType } from "../types/quote.js";

export interface AdditionalFeeOption {
  type: AdditionalFeeType;
  /** Fixed USD amount for presets; 0 for "none" and for the custom placeholder. */
  amount: number;
  /** Label on the selection keyboard, without the amount suffix. */
  buttonLabel: string;
  /** Label used in the final-quote line ("" for "none", which shows no line). */
  summaryLabel: string;
  /** Presets carry a fixed amount; custom is entered by the operator. */
  fixed: boolean;
}

export const DEFAULT_ADDITIONAL_FEE_TYPE: AdditionalFeeType = "none";

export const ADDITIONAL_FEE_OPTIONS: readonly AdditionalFeeOption[] = [
  { type: "none",      amount: 0,  buttonLabel: "🚫 بدون رسوم",              summaryLabel: "",                       fixed: true },
  { type: "packaging", amount: 10, buttonLabel: "📦 تغليف آمن",            summaryLabel: "📦 تغليف آمن",           fixed: true },
  { type: "flammable", amount: 30, buttonLabel: "🔥 مواد قابلة للاشتعال",  summaryLabel: "🔥 مواد قابلة للاشتعال", fixed: true },
  { type: "perfume",   amount: 9,  buttonLabel: "🌸 عطور",                 summaryLabel: "🌸 عطور",                fixed: true },
  { type: "custom",    amount: 0,  buttonLabel: "✏️ رسوم مخصصة",           summaryLabel: "✏️ رسوم إضافية",         fixed: false },
];

export function getFeeOption(type: AdditionalFeeType): AdditionalFeeOption {
  return ADDITIONAL_FEE_OPTIONS.find((option) => option.type === type) ?? ADDITIONAL_FEE_OPTIONS[0]!;
}

/** Fixed USD amount for a preset; custom returns 0 (its value is entered separately). */
export function presetFeeAmount(type: AdditionalFeeType): number {
  return getFeeOption(type).amount;
}

/**
 * The optional fee line for the final quote, e.g. "📦 تغليف آمن: 10$".
 * Returns null for "بدون رسوم" or any zero/absent amount, so no line appears.
 */
export function additionalFeeLine(
  type: AdditionalFeeType | undefined,
  amount: number | undefined
): string | null {
  const feeType = type ?? DEFAULT_ADDITIONAL_FEE_TYPE;
  const value = amount ?? 0;
  if (feeType === "none" || value <= 0) return null;
  return `${getFeeOption(feeType).summaryLabel}: ${value}$`;
}
