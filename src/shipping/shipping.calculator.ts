/**
 * Pure shipping-rate calculation engine. No Supabase, no Telegram, no
 * Node-specific APIs, no framework of any kind -- it operates only on a
 * plain rate table handed to it by a caller. This is the same lookup
 * semantics as the website's CalculatorEngine (round up to the next
 * available weight tier, or cap at the highest tier if the requested
 * weight exceeds every tier) plus the same USD -> SAR conversion rate,
 * ported to TypeScript so the Website, Telegram Bot, API, and Dashboard
 * can all depend on this one module instead of re-implementing the rules.
 */

export interface RateTableRow {
  price: number;
  currency: string;
  deliveryDays: string;
}

export type RateTable = Record<number, RateTableRow>;

export interface CalculatedRate {
  price: number;
  currency: string;
  deliveryDays: string;
  lb: number;
  capped: boolean;
  convertedPrice: number;
}

const USD_TO_SAR = 3.75;

export function convertToSar(price: number, currency: string): number {
  return currency === "USD" ? price * USD_TO_SAR : price;
}

/**
 * Given a rate table (weight -> row) and a desired weight, finds the
 * cheapest-fitting tier: the smallest available weight >= desired, or the
 * highest available tier if the desired weight exceeds every tier (marked
 * `capped`). Returns null if the table is empty.
 */
export function nearestAvailableWeight(
  table: RateTable,
  desiredWeight: number
): { weight: number; capped: boolean } | null {
  const keys = Object.keys(table)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (keys.length === 0) return null;

  const highest = keys[keys.length - 1];
  if (highest === undefined) return null;

  const next = keys.find((k) => k >= desiredWeight);
  const chosen = next ?? highest;
  return { weight: chosen, capped: desiredWeight > highest };
}

export const ShippingCalculator = Object.freeze({
  /**
   * @param table rate table for a single (warehouse, carrier) pair
   * @param weightLb requested weight in pounds
   */
  getRate(table: RateTable, weightLb: number): CalculatedRate | null {
    if (!(weightLb > 0)) return null;

    const lb = Math.ceil(weightLb);
    const match = nearestAvailableWeight(table, lb);
    if (!match) return null;

    const row = table[match.weight];
    if (!row) return null;

    return {
      price: row.price,
      currency: row.currency,
      deliveryDays: row.deliveryDays,
      lb: match.weight,
      capped: match.capped,
      convertedPrice: convertToSar(row.price, row.currency),
    };
  },
});
