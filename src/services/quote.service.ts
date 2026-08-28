import { randomUUID } from "crypto";
import type { SessionData } from "../session/session.js";
import { cleanDiscount } from "./discount.service.js";
import { presetFeeAmount } from "./additional-fee.service.js";
import { validateUrl } from "../utils/url.js";
import type { AdditionalFeeType, Currency, Product, QuoteStep, QuoteType } from "../types/quote.js";

export interface ServiceSuccess {
  success: true;
}

export interface ServiceFailure {
  success: false;
  errorMessage: string;
}

export type ServiceResult = ServiceSuccess | ServiceFailure;

const DEFAULT_CURRENCY: Currency = "USD";
const DEFAULT_QUANTITY = 1;

function getActiveProduct(session: SessionData): Product | undefined {
  return session.draft.products.find((product) => product.id === session.draft.activeProductId);
}

function getLastProduct(session: SessionData): Product | undefined {
  return session.draft.products[session.draft.products.length - 1];
}

export function setQuoteType(session: SessionData, quoteType: QuoteType): void {
  session.quoteType = quoteType;
  session.draft.products = [];
  session.draft.activeProductId = undefined;
  session.draft.currentStep = undefined;
  session.draft.lastPromptMessageId = undefined;
  session.draft.shippingMethod = undefined;
  session.draft.internationalShippingCost = undefined;
  session.draft.indirectWeight = undefined;
  session.draft.shippingDiscount = undefined;
  session.draft.warehouseId = undefined;
  session.draft.warehouseName = undefined;
  session.draft.carrierId = undefined;
  session.draft.shippingCompany = undefined;
  session.draft.shippingPrice = undefined;
  session.draft.shippingCurrency = undefined;
  session.draft.additionalFeeType = undefined;
  session.draft.additionalFee = undefined;
}

export function beginProductEntry(session: SessionData): void {
  session.draft.activeProductId = randomUUID();
  session.draft.currentStep = "url";
}

export function cancelCurrentProductEntry(session: SessionData): void {
  if (!session.draft.activeProductId) {
    session.draft.currentStep = undefined;
    return;
  }

  session.draft.products = session.draft.products.filter(
    (product) => product.id !== session.draft.activeProductId
  );
  session.draft.activeProductId = undefined;
  session.draft.currentStep = undefined;
}

export function submitProductUrl(session: SessionData, rawUrl: string): ServiceResult {
  const validation = validateUrl(rawUrl);
  if (!validation.valid) {
    return {
      success: false,
      errorMessage: validation.errorMessage,
    };
  }

  const product: Product = {
    id: session.draft.activeProductId ?? randomUUID(),
    url: validation.url,
    website: validation.website,
    name: undefined,
    price: undefined,
    currency: DEFAULT_CURRENCY,
    quantity: DEFAULT_QUANTITY,
    localShipping: 0,
    category: undefined,
  };

  const lastProduct = getLastProduct(session);
  if (session.quoteType === "single" && lastProduct) {
    product.currency = lastProduct.currency ?? DEFAULT_CURRENCY;
    product.quantity = lastProduct.quantity ?? DEFAULT_QUANTITY;
    product.localShipping = lastProduct.localShipping ?? 0;
  }

  const existingIndex = session.draft.products.findIndex(
    (item) => item.id === product.id
  );

  if (existingIndex >= 0) {
    session.draft.products[existingIndex] = product;
  } else {
    session.draft.products.push(product);
  }

  session.draft.currentStep = "name";
  return { success: true };
}

export function submitProductName(session: SessionData, name: string): ServiceResult {
  const product = getActiveProduct(session);
  if (!product) {
    return { success: false, errorMessage: "خطأ داخلي: لم يتم العثور على المنتج." };
  }

  if (!name.trim()) {
    return { success: false, errorMessage: "اسم المنتج لا يمكن أن يكون فارغاً." };
  }

  product.name = name.trim();
  session.draft.currentStep = "price";
  return { success: true };
}

export function submitProductPrice(session: SessionData, rawPrice: string): ServiceResult {
  const product = getActiveProduct(session);
  if (!product) {
    return { success: false, errorMessage: "خطأ داخلي: لم يتم العثور على المنتج." };
  }

  const parsed = Number(rawPrice.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      success: false,
      errorMessage: "السعر غير صالح. أرسل رقماً أكبر من صفر.",
    };
  }

  product.price = parsed;
  session.draft.currentStep = "currency";
  return { success: true };
}

export function submitProductCurrency(session: SessionData, currency: string): ServiceResult {
  const product = getActiveProduct(session);
  if (!product) {
    return { success: false, errorMessage: "خطأ داخلي: لم يتم العثور على المنتج." };
  }

  const normalized = currency.trim().toUpperCase();
  const validCurrencies: Currency[] = [
    "USD",
    "SAR",
    "EUR",
    "GBP",
    "AUD",
    "CAD",
    "SGD",
  ];

  if (!validCurrencies.includes(normalized as Currency)) {
    return {
      success: false,
      errorMessage: "رمز العملة غير صالح. اختر واحداً من USD، SAR، EUR، GBP، AUD، CAD، SGD.",
    };
  }

  product.currency = normalized as Currency;
  return { success: true };
}

export function submitProductQuantity(session: SessionData, rawQuantity: string): ServiceResult {
  const product = getActiveProduct(session);
  if (!product) {
    return { success: false, errorMessage: "خطأ داخلي: لم يتم العثور على المنتج." };
  }

  const quantity = Number(rawQuantity.trim());
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      success: false,
      errorMessage: "الكمية غير صالحة. أرسل رقماً صحيحاً أكبر من صفر.",
    };
  }

  product.quantity = quantity;
  return { success: true };
}

export function submitProductLocalShipping(session: SessionData, rawValue: string): ServiceResult {
  const product = getActiveProduct(session);
  if (!product) {
    return { success: false, errorMessage: "خطأ داخلي: لم يتم العثور على المنتج." };
  }

  const trimmed = rawValue.trim();
  if (!trimmed || trimmed === "مجاني") {
    product.localShipping = 0;
    session.draft.currentStep = "category";
    return { success: true };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      success: false,
      errorMessage: "قيمة الشحن غير صالحة. أرسل رقماً أو اكتب 'مجاني'.",
    };
  }

  product.localShipping = parsed;
  session.draft.currentStep = "category";
  return { success: true };
}

export function submitProductCategory(session: SessionData, category: string): ServiceResult {
  const product = getActiveProduct(session);
  if (!product) {
    return { success: false, errorMessage: "خطأ داخلي: لم يتم العثور على المنتج." };
  }

  product.category = category.trim() || undefined;
  session.draft.currentStep = undefined;
  session.draft.activeProductId = undefined;
  return { success: true };
}

export function skipProductCategory(session: SessionData): ServiceResult {
  const product = getActiveProduct(session);
  if (!product) {
    return { success: false, errorMessage: "خطأ داخلي: لم يتم العثور على المنتج." };
  }

  product.category = undefined;
  session.draft.currentStep = undefined;
  session.draft.activeProductId = undefined;
  return { success: true };
}

export function beginShippingMethodSelection(session: SessionData): void {
  session.draft.shippingMethod = undefined;
  session.draft.internationalShippingCost = undefined;
  session.draft.indirectWeight = undefined;
  session.draft.shippingDiscount = undefined;
  session.draft.warehouseId = undefined;
  session.draft.warehouseName = undefined;
  session.draft.carrierId = undefined;
  session.draft.shippingCompany = undefined;
  session.draft.shippingPrice = undefined;
  session.draft.shippingCurrency = undefined;
  session.draft.additionalFeeType = undefined;
  session.draft.additionalFee = undefined;
  session.draft.currentStep = "shipping_method";
}

export function setShippingMethodDirect(session: SessionData): ServiceResult {
  session.draft.shippingMethod = "direct";
  session.draft.internationalShippingCost = undefined;
  session.draft.indirectWeight = undefined;
  session.draft.currentStep = "direct_shipping_cost";
  return { success: true };
}

export function setShippingMethodIndirect(session: SessionData): ServiceResult {
  session.draft.shippingMethod = "indirect";
  session.draft.indirectWeight = undefined;
  session.draft.internationalShippingCost = undefined;
  session.draft.currentStep = "indirect_shipping_weight";
  return { success: true };
}

export function submitInternationalShippingCost(session: SessionData, rawValue: string): ServiceResult {
  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      success: false,
      errorMessage: "قيمة الشحن الدولي غير صالحة. أرسل رقماً أكبر من صفر.",
    };
  }

  // Always SAR: the operator enters this figure in riyals, so it is stored
  // and displayed as entered, never converted.
  session.draft.internationalShippingCost = parsed;
  // Direct shipping needs no warehouse and no carrier -- the quote is ready.
  session.draft.currentStep = "customer_quote";
  return { success: true };
}

export function submitIndirectShippingWeight(session: SessionData, rawValue: string): ServiceResult {
  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      success: false,
      errorMessage: "الوزن غير صالح. أرسل رقماً أكبر من صفر.",
    };
  }

  session.draft.indirectWeight = parsed;
  // Weight is followed by the shipping-discount screen; carriers come after.
  session.draft.currentStep = "select_shipping_discount";
  return { success: true };
}

export function selectShippingDiscount(session: SessionData, discount: number): ServiceResult {
  session.draft.shippingDiscount = cleanDiscount(discount);
  session.draft.currentStep = "select_shipping_company";
  return { success: true };
}

export function selectWarehouse(
  session: SessionData,
  warehouseId: number,
  warehouseName: string
): ServiceResult {
  session.draft.warehouseId = warehouseId;
  session.draft.warehouseName = warehouseName;
  session.draft.currentStep = "select_shipping_company";
  return { success: true };
}

export function setShowEstimatePrompt(session: SessionData): ServiceResult {
  session.draft.currentStep = "show_estimate_prompt";
  return { success: true };
}

export function setShippingCompany(
  session: SessionData,
  carrierId: number,
  company: string,
  price?: number,
  currency?: string
): ServiceResult {
  session.draft.carrierId = carrierId;
  session.draft.shippingCompany = company;
  session.draft.shippingPrice = price;
  session.draft.shippingCurrency = currency;
  // Selecting the shipping company leads into the additional-fees screen.
  session.draft.currentStep = "additional_fees";
  return { success: true };
}

/** Selects a preset additional fee (none/packaging/flammable/perfume) -- custom goes through beginCustomFeeInput. */
export function selectAdditionalFee(session: SessionData, type: AdditionalFeeType): ServiceResult {
  session.draft.additionalFeeType = type;
  session.draft.additionalFee = presetFeeAmount(type);
  return { success: true };
}

export function beginCustomFeeInput(session: SessionData): ServiceResult {
  session.draft.currentStep = "additional_fee_custom";
  return { success: true };
}

export function submitCustomFee(session: SessionData, rawValue: string): ServiceResult {
  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { success: false, errorMessage: "قيمة الرسوم غير صالحة. أرسل رقماً أكبر من صفر." };
  }

  session.draft.additionalFeeType = "custom";
  session.draft.additionalFee = parsed;
  session.draft.currentStep = "additional_fees";
  return { success: true };
}

export function continueFromAdditionalFees(session: SessionData): ServiceResult {
  session.draft.currentStep = "quote_summary";
  return { success: true };
}

export function backToAdditionalFees(session: SessionData): ServiceResult {
  session.draft.currentStep = "additional_fees";
  return { success: true };
}

export function beginCustomerQuote(session: SessionData): ServiceResult {
  session.draft.currentStep = "customer_quote";
  return { success: true };
}

export function setQuoteSummaryStep(session: SessionData): ServiceResult {
  session.draft.currentStep = "quote_summary";
  return { success: true };
}

export function setSessionForNewQuote(session: SessionData): void {
  resetQuoteSession(session);
}

export function setProductToEdit(session: SessionData, index: number): ServiceResult {
  const product = session.draft.products[index];
  if (!product) {
    return { success: false, errorMessage: "المنتج غير موجود." };
  }

  session.draft.activeProductId = product.id;
  session.draft.currentStep = "url";
  return { success: true };
}

export function deleteProductByIndex(session: SessionData, index: number): ServiceResult {
  if (index < 0 || index >= session.draft.products.length) {
    return { success: false, errorMessage: "المنتج غير موجود." };
  }

  session.draft.products.splice(index, 1);
  session.draft.currentStep = undefined;
  session.draft.activeProductId = undefined;
  return { success: true };
}

export function resetQuoteSession(session: SessionData): void {
  session.quoteType = undefined;
  session.draft = {
    products: [],
    activeProductId: undefined,
    currentStep: undefined,
    lastPromptMessageId: undefined,
    shippingMethod: undefined,
    internationalShippingCost: undefined,
    indirectWeight: undefined,
    shippingDiscount: undefined,
    warehouseId: undefined,
    warehouseName: undefined,
    carrierId: undefined,
    shippingCompany: undefined,
    shippingPrice: undefined,
    shippingCurrency: undefined,
    additionalFeeType: undefined,
    additionalFee: undefined,
  };
}
