export interface Warehouse {
  id: number;
  countryId: number;
  name: string;
}

export interface Carrier {
  id: number;
  name: string;
}

export interface CarrierRate {
  carrierId: number;
  carrierName: string;
  price: number;
  currency: string;
  deliveryDays: string | undefined;
}

/**
 * Standardized shipping quote returned by ShippingService.
 * `price`/`currency` are the raw rate as stored (e.g. USD); `convertedPrice`
 * is always expressed in SAR, matching the website's display rule.
 */
export interface ShippingQuote {
  warehouse: Warehouse;
  carrier: Carrier;
  weight: number;
  price: number;
  currency: string;
  deliveryDays: string;
  convertedPrice: number;
  capped: boolean;
}
