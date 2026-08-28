/**
 * Carrier discount -- mirrors the website's model exactly.
 *
 * A single global percentage (not per-product, not per-carrier) applied to
 * the carrier rate only. It affects the eligible express carriers (FedEx and
 * DHL) and leaves Budget, Aramex and Shop & Ship untouched, matching the
 * website's `discountedPrice = price * (1 - discount/100)` rule.
 *
 * Pure functions -- no Supabase, no Telegram. This does not touch carrier
 * lookup; it only transforms the rates that lookup returns.
 */
import type { CarrierRate } from "../types/shipping.js";

/** Selectable discount percentages, same set as the website. */
export const DISCOUNT_OPTIONS = [0, 10, 15, 20, 25] as const;

/** Applied by default, same as the website. */
export const DEFAULT_DISCOUNT = 15;

/**
 * Coerces any value to a valid option, exactly like the website's
 * `cleanCarrierDiscount`: anything not in the allowed set becomes 0.
 */
export function cleanDiscount(value: number): number {
  return (DISCOUNT_OPTIONS as readonly number[]).includes(value) ? value : 0;
}

/**
 * Only the express carriers are discounted. Matched by name because that is
 * what carrier lookup already returns -- no schema or query change needed.
 */
export function isDiscountEligible(carrierName: string): boolean {
  const name = carrierName.toLowerCase();
  return name.includes("fedex") || name.includes("dhl");
}

/** Returns the rate with the discount applied to its price when eligible; otherwise unchanged. */
export function discountedCarrierRate(rate: CarrierRate, discountPercent: number): CarrierRate {
  if (discountPercent <= 0 || !isDiscountEligible(rate.carrierName)) {
    return rate;
  }

  return { ...rate, price: rate.price * (1 - discountPercent / 100) };
}

/** Applies the discount across a list of rates, preserving order. */
export function applyCarrierDiscount(
  rates: CarrierRate[],
  discountPercent: number
): CarrierRate[] {
  return rates.map((rate) => discountedCarrierRate(rate, discountPercent));
}
