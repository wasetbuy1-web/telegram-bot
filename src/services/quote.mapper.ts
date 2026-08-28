import type { QuotePayload, QuoteSubmissionModel } from "../types/quote-api.js";

export function buildQuotePayload(model: QuoteSubmissionModel): QuotePayload {
  return {
    quoteType: model.quoteType ?? "single",
    products: model.draft.products.map((product) => ({
      name: product.name ?? null,
      url: product.url,
      website: product.website,
      price: product.price ?? null,
      currency: product.currency ?? "USD",
      quantity: product.quantity ?? null,
      localShipping: product.localShipping ?? null,
      category: product.category ?? null,
    })),
    shipping: {
      method: model.draft.shippingMethod ?? null,
      company: model.draft.shippingCompany ?? null,
      carrierId: model.draft.carrierId ?? null,
      internationalShippingCost:
        model.draft.shippingMethod === "direct"
          ? model.draft.internationalShippingCost ?? null
          : null,
      shipmentWeight:
        model.draft.shippingMethod === "indirect"
          ? model.draft.indirectWeight ?? null
          : null,
      warehouse: model.draft.warehouseName ?? null,
      warehouseId: model.draft.warehouseId ?? null,
      price: model.draft.shippingPrice ?? null,
      // Direct shipping is entered by the operator in riyals and never converted.
      currency:
        model.draft.shippingMethod === "direct"
          ? "SAR"
          : model.draft.shippingCurrency ?? null,
    },
  };
}
