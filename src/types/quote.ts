export type QuoteType = "single" | "multi";

export type AdditionalFeeType = "none" | "packaging" | "flammable" | "perfume" | "custom";

export type Currency =
  | "USD"
  | "SAR"
  | "EUR"
  | "GBP"
  | "AUD"
  | "CAD"
  | "SGD";

export type QuoteStep =
  | "url"
  | "name"
  | "price"
  | "currency"
  | "quantity"
  | "localShipping"
  | "category"
  | "select_edit"
  | "select_delete"
  | "shipping_method"
  | "direct_shipping_cost"
  | "indirect_shipping_weight"
  | "show_estimate_prompt"
  | "select_shipping_discount"
  | "select_shipping_company"
  | "additional_fees"
  | "additional_fee_custom"
  | "quote_summary"
  | "customer_quote";

export interface Product {
  id: string;
  url: string;
  website: string;
  name: string | undefined;
  price: number | undefined;
  currency: Currency | undefined;
  quantity: number | undefined;
  localShipping: number | undefined;
  category: string | undefined;
}

export interface Draft {
  products: Product[];
  activeProductId: string | undefined;
  currentStep: QuoteStep | undefined;
  lastPromptMessageId: number | undefined;
  shippingMethod: "direct" | "indirect" | undefined;
  internationalShippingCost: number | undefined;
  indirectWeight: number | undefined;
  shippingDiscount: number | undefined;
  warehouseId: number | undefined;
  warehouseName: string | undefined;
  carrierId: number | undefined;
  shippingCompany: string | undefined;
  shippingPrice: number | undefined;
  shippingCurrency: string | undefined;
  /** Optional additional service fee. `additionalFee` is always in USD. */
  additionalFeeType: AdditionalFeeType | undefined;
  additionalFee: number | undefined;
}
