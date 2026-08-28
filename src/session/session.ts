import type { Draft, QuoteType } from "../types/quote.js";

export interface SessionData {
  quoteType: QuoteType | undefined;
  draft: Draft;
}

export function initialSession(): SessionData {
  return {
    quoteType: undefined,
    draft: {
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
    },
  };
}
