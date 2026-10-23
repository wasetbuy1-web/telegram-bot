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
import type { Currency, Draft, Product, QuoteType } from "../types/quote.js";
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

// Website defaults, used for the customs base only so the existing quote
// totals and commission calculation remain unchanged.
const WEBSITE_CURRENCY_RATES: Record<Currency, number> = {
  USD: 3.75,
  SAR: 1,
  EUR: 4.05,
  GBP: 4.75,
  AUD: 2.45,
  CAD: 2.7,
  SGD: 2.8,
};

// Current website defaults for automatic MyUS restriction fees.
const MYUS_DANGEROUS_GOODS_MIN_SAR = 112;
const MYUS_DANGEROUS_GOODS_RATE = 0.08;
const MYUS_INSTALLED_LITHIUM_FEE_SAR = 30;
const MYUS_SPECIAL_PACKAGING_FEE_SAR = 90;

type MyusExtraFeeCode = "dangerousGoods" | "installedLithiumBattery" | "specialPackaging";

// Product rules that add MyUS fees on the website. Rules that only block a
// carrier do not change the customs/tax base.
const MYUS_EXTRA_FEE_RULES: readonly {
  codes: readonly MyusExtraFeeCode[];
  keywords: readonly string[];
}[] = [
  {
    codes: ["dangerousGoods"],
    keywords: [
      "perfume", "fragrance", "cologne", "eau de parfum", "eau de toilette",
      "alcohol based perfume", "acetone", "flammable liquid", "nail polish",
      "عطر", "عطور", "برفيوم", "كولونيا", "أسيتون", "اسيتون",
      "سائل قابل للاشتعال", "طلاء أظافر", "مناكير",
    ],
  },
  {
    codes: ["dangerousGoods"],
    keywords: [
      "glue", "adhesive", "silicone adhesive", "super glue", "epoxy",
      "غراء", "لاصق", "مواد لاصقة", "سيليكون", "إيبوكسي", "ايبوكسي",
    ],
  },
  {
    codes: ["dangerousGoods", "specialPackaging"],
    keywords: [
      "paint", "paint thinner", "thinner", "paint remover", "turpentine", "varnish", "stain",
      "دهان", "دهانات", "بوية", "تنر", "مزيل طلاء", "تربنتين", "ورنيش",
    ],
  },
  {
    codes: ["dangerousGoods"],
    keywords: [
      "aerosol", "spray", "hairspray", "hair spray", "spray sunscreen",
      "spray-on sunscreen", "spray tan", "spray-on tan", "deodorant spray",
      "بخاخ", "بخاخات", "سبراي", "مثبت شعر", "واقي شمس بخاخ", "بخاخ تسمير", "مزيل عرق بخاخ",
    ],
  },
  {
    codes: ["installedLithiumBattery"],
    keywords: [
      "lithium ion installed", "lithium battery installed", "built-in lithium battery",
      "contains lithium battery", "device with lithium battery", "بطارية ليثيوم مركبة",
      "بطارية مدمجة", "يحتوي على بطارية ليثيوم",
    ],
  },
  {
    codes: ["dangerousGoods"],
    keywords: [
      "loose lithium battery", "lithium battery", "lithium batteries", "power bank", "powerbank",
      "بطارية ليثيوم", "بطاريات ليثيوم", "بطارية منفصلة", "باور بانك", "شاحن متنقل",
    ],
  },
];

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

function websiteCurrencyRate(currency: Currency | undefined): number {
  return WEBSITE_CURRENCY_RATES[currency ?? "USD"];
}

function websiteProductValueSar(
  product: Product,
  index: number,
  products: Product[],
  quoteType: QuoteType
): number {
  const baseCurrency = products[0]?.currency ?? "USD";
  const currency = quoteType === "single" && index > 0
    ? baseCurrency
    : product.currency ?? "USD";
  const quantity = Math.max(1, product.quantity ?? 1);
  return (product.price ?? 0) * websiteCurrencyRate(currency) * quantity;
}

function customsProductsValueSar(products: Product[], quoteType: QuoteType): number {
  // The website excludes local shipping from customs and uses the first
  // product's exchange rate for remaining products in a single-site quote.
  return products.reduce(
    (sum, product, index) => sum + websiteProductValueSar(product, index, products, quoteType),
    0
  );
}

function normalizeRuleText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\/_.?&=#%+:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function automaticMyusExtraFeeSar(products: Product[], quoteType: QuoteType): number {
  return products.reduce((sum, product, index) => {
    // The website assesses only the first product for a single-site order.
    if (quoteType === "single" && index > 0) return sum;

    const productValue = websiteProductValueSar(product, index, products, quoteType);
    const text = normalizeRuleText(`${product.name ?? ""} ${product.url} ${product.category ?? ""}`);
    const feeCodes = new Set<MyusExtraFeeCode>();

    for (const rule of MYUS_EXTRA_FEE_RULES) {
      if (rule.keywords.some((keyword) => text.includes(normalizeRuleText(keyword)))) {
        rule.codes.forEach((code) => feeCodes.add(code));
      }
    }

    let productFee = 0;
    for (const feeCode of feeCodes) {
      if (feeCode === "dangerousGoods") {
        productFee += Math.max(MYUS_DANGEROUS_GOODS_MIN_SAR, productValue * MYUS_DANGEROUS_GOODS_RATE);
      } else if (feeCode === "installedLithiumBattery") {
        productFee += MYUS_INSTALLED_LITHIUM_FEE_SAR;
      } else {
        productFee += MYUS_SPECIAL_PACKAGING_FEE_SAR;
      }
    }

    return sum + productFee;
  }, 0);
}

type CarrierTaxSource = "myus" | "shopship" | "other";

function carrierTaxSource(draft: Draft): CarrierTaxSource {
  const text = normalizeRuleText(
    `${draft.shippingCompany ?? ""} ${draft.warehouseName ?? ""}`.replace(/&/g, " and ")
  );

  if (/shop\s*(?:and\s*)?ship|shopandship|shopship|شوب\s*اند\s*شيب/.test(text)) return "shopship";
  if (text.includes("myus")) return "myus";
  return "other";
}

function customsIncludesInternationalShipping(draft: Draft, source: CarrierTaxSource): boolean {
  if (source === "shopship") return true;
  if (source !== "myus") return false;

  const carrierName = (draft.shippingCompany ?? "").toLowerCase();
  return carrierName.includes("dhl") || carrierName.includes("aramex");
}

function customsServiceFee(amount: number): number {
  if (amount <= 0) return 0;
  return clamp(
    amount * CUSTOMS_SERVICE_FEE_RATE,
    CUSTOMS_SERVICE_FEE_MIN_SAR,
    CUSTOMS_SERVICE_FEE_MAX_SAR
  );
}

function shopshipServiceFee(amount: number): number {
  if (amount <= 0) return 0;
  return amount < 1000 ? 3.75 : 35;
}

function customsTaxInputs(draft: Draft, quoteType: QuoteType): { amount: number; serviceFee: number } {
  const productsValue = customsProductsValueSar(draft.products, quoteType);
  const source = carrierTaxSource(draft);
  const isIndirectShipping = draft.shippingMethod === "indirect";
  const internationalShipping = isIndirectShipping ? draft.shippingPrice ?? 0 : 0;
  const shopshipTaxableValue = source === "shopship" && isIndirectShipping
    ? productsValue + internationalShipping
    : 0;

  let customsValueAddition = 0;
  if (isIndirectShipping && customsIncludesInternationalShipping(draft, source)) {
    customsValueAddition += internationalShipping;
  }

  if (isIndirectShipping && source === "myus") {
    // The manually selected fee remains unchanged in the quote; it enters the
    // customs base only for MyUS, as it does on the website.
    const feeCurrency = draft.products[0]?.currency ?? "USD";
    customsValueAddition += (draft.additionalFee ?? 0) * websiteCurrencyRate(feeCurrency);
    customsValueAddition += automaticMyusExtraFeeSar(draft.products, quoteType);
  }

  const taxableAmount = Math.max(0, productsValue + customsValueAddition);
  const nonShopshipTaxableAmount = Math.max(0, taxableAmount - shopshipTaxableValue);
  return {
    amount: taxableAmount,
    serviceFee: customsServiceFee(nonShopshipTaxableAmount) + shopshipServiceFee(shopshipTaxableValue),
  };
}

/**
 * Mirrors the website's customs basis and service-fee branch. The optional
 * override lets Shop & Ship use its shipment threshold instead of the
 * standard percentage-based customs service fee.
 */
export function calculateEstimatedTax(taxableAmount: number, serviceFee: number | null = null): EstimatedTax {
  if (taxableAmount <= 0) return { customsDuty: 0, serviceFee: 0, vat: 0, total: 0 };

  const customsDuty = taxableAmount * CUSTOMS_DUTY_RATE;
  const appliedServiceFee = serviceFee ?? customsServiceFee(taxableAmount);
  const vat = (taxableAmount + customsDuty + appliedServiceFee) * VAT_RATE;

  return {
    customsDuty,
    serviceFee: appliedServiceFee,
    vat,
    total: customsDuty + appliedServiceFee + vat,
  };
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
 * tax calculation other than the MyUS tax-base inclusion applied below.
 */
export function calculateQuoteTotals(draft: Draft, quoteType: QuoteType = "single"): QuoteTotals {
  const productsTotal = calculateProductsTotalSar(draft.products);
  const shippingTotal = calculateShippingTotalSar(draft);
  const productsPlusShipping = productsTotal + shippingTotal;
  const commission = calculateCommission(productsPlusShipping);
  const additionalFee = calculateAdditionalFeeSar(draft);
  const taxInputs = customsTaxInputs(draft, quoteType);

  return {
    productsTotal,
    shippingTotal,
    productsPlusShipping,
    commission,
    additionalFee,
    estimatedTax: calculateEstimatedTax(taxInputs.amount, taxInputs.serviceFee),
    finalTotal: productsPlusShipping + commission + additionalFee,
  };
}
