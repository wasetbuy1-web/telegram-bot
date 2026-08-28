/**
 * Quote totals for the customer message.
 *
 * Scope note: the website remains the source of truth for the order it
 * finally stores. These figures exist so the operator can hand the customer
 * a complete quote inside Telegram without waiting for the website, and they
 * follow the same rules the website applies.
 *
 * Every value here is SAR.
 */
import { convertToSar } from "../shipping/shipping.calculator.js";
import type { Draft, Product } from "../types/quote.js";
import { roundUpToNearestTen } from "../utils/money.js";

/** Below this combined products+shipping value the commission is the lower flat fee. */
const COMMISSION_THRESHOLD_SAR = 2000;
const COMMISSION_UNDER_THRESHOLD_SAR = 50;
const COMMISSION_AT_OR_OVER_THRESHOLD_SAR = 100;

const CUSTOMS_DUTY_RATE = 0.05;
const CUSTOMS_SERVICE_FEE_RATE = 0.0015;
const CUSTOMS_SERVICE_FEE_MIN_SAR = 15;
const CUSTOMS_SERVICE_FEE_MAX_SAR = 500;
const VAT_RATE = 0.15;

/** Customs and VAT the customer pays to the carrier on delivery -- never part of the quote's final total. */
export interface EstimatedTax {
  customsDuty: number;
  serviceFee: number;
  vat: number;
  total: number;
}

export interface QuoteTotals {
  productsTotal: number;
  shippingTotal: number;
  productsPlusShipping: number;
  commission: number;
  /** Optional additional service fee, converted to SAR (0 when none selected). */
  additionalFee: number;
  estimatedTax: EstimatedTax;
  /** Products + shipping + commission + additional fee. Excludes customs and VAT by design. */
  finalTotal: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Assessed on the product value alone -- shipping and commission are
 * excluded, because customs values the goods, not the service around them.
 *
 * 1000 SAR -> duty 50 + fee 15 (the 1.5 raw fee lifted to its floor)
 *          -> VAT (1000 + 50 + 15) x 15% = 159.75
 *          -> 224.75 total
 */
export function calculateEstimatedTax(productValue: number): EstimatedTax {
  const customsDuty = productValue * CUSTOMS_DUTY_RATE;
  const serviceFee = clamp(
    productValue * CUSTOMS_SERVICE_FEE_RATE,
    CUSTOMS_SERVICE_FEE_MIN_SAR,
    CUSTOMS_SERVICE_FEE_MAX_SAR
  );
  const vat = (productValue + customsDuty + serviceFee) * VAT_RATE;

  return { customsDuty, serviceFee, vat, total: customsDuty + serviceFee + vat };
}

/** Flat fee, stepped at 2000 SAR of products + shipping. */
export function calculateCommission(productsAndShipping: number): number {
  return productsAndShipping < COMMISSION_THRESHOLD_SAR
    ? COMMISSION_UNDER_THRESHOLD_SAR
    : COMMISSION_AT_OR_OVER_THRESHOLD_SAR;
}

/** Line total is price x quantity plus the product's local shipping, converted to SAR. */
export function calculateProductsTotalSar(products: Product[]): number {
  return products.reduce((total, product) => {
    if (product.price == null) return total;

    const quantity = product.quantity ?? 1;
    const line = product.price * quantity + (product.localShipping ?? 0);
    return total + convertToSar(line, product.currency ?? "USD");
  }, 0);
}

/**
 * Direct shipping is entered by the operator and is already SAR, so it is
 * never converted. Indirect shipping comes from `shipping_rates` and is
 * charged at the same rounded-up figure the customer is shown.
 */
export function calculateShippingTotalSar(draft: Draft): number {
  if (draft.shippingMethod === "direct") {
    return draft.internationalShippingCost ?? 0;
  }

  return draft.shippingPrice != null ? roundUpToNearestTen(draft.shippingPrice) : 0;
}

/**
 * The optional additional service fee, converted from its stored USD value to
 * SAR with the same rate products use. Zero when no fee is selected, so a
 * quote without a fee is byte-identical to before this feature existed.
 */
export function calculateAdditionalFeeSar(draft: Draft): number {
  return convertToSar(draft.additionalFee ?? 0, "USD");
}

/**
 * One calculation for both shipping methods. They differ only in where the
 * shipping figure comes from (see calculateShippingTotalSar); commission,
 * tax and the final total are identical.
 *
 * The additional fee is added ONCE, on top of the existing total. It does not
 * feed the commission threshold (kept on products+shipping) or the estimated
 * tax (kept on product value), so those calculations are unchanged.
 */
export function calculateQuoteTotals(draft: Draft): QuoteTotals {
  const productsTotal = calculateProductsTotalSar(draft.products);
  const shippingTotal = calculateShippingTotalSar(draft);
  const productsPlusShipping = productsTotal + shippingTotal;
  const commission = calculateCommission(productsPlusShipping);
  const additionalFee = calculateAdditionalFeeSar(draft);

  return {
    productsTotal,
    shippingTotal,
    productsPlusShipping,
    commission,
    additionalFee,
    estimatedTax: calculateEstimatedTax(productsTotal),
    finalTotal: productsPlusShipping + commission + additionalFee,
  };
}
