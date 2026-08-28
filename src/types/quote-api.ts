import type { Draft, QuoteType } from "./quote.js";

export interface QuotePayload {
  quoteType: "single" | "multi";
  products: Array<{
    name: string | null;
    url: string;
    website: string;
    price: number | null;
    currency: string;
    quantity: number | null;
    localShipping: number | null;
    category: string | null;
  }>;
  shipping: {
    method: "direct" | "indirect" | null;
    company: string | null;
    /** `carriers.id` -- the stable key behind `company`, so the website resolves the carrier by id rather than by display name. */
    carrierId: number | null;
    internationalShippingCost: number | null;
    shipmentWeight: number | null;
    warehouse: string | null;
    /** `warehouses.id` -- the stable key behind `warehouse`; names are not unique across origin countries. */
    warehouseId: number | null;
    price: number | null;
    currency: string | null;
  };
}

export interface QuoteClientSuccess {
  success: true;
  status: number;
  data: unknown;
}

export interface QuoteClientFailure {
  success: false;
  errorMessage: string;
}

export type QuoteClientResult = QuoteClientSuccess | QuoteClientFailure;

export interface QuoteSubmissionModel {
  quoteType: QuoteType | undefined;
  draft: Draft;
}
