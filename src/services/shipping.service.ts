/**
 * ShippingService: the single entry point for shipping data in the bot.
 *
 * It composes ShippingGateway (Supabase reads of `warehouses`, `carriers`
 * and `shipping_rates`) with ShippingCalculator (pure weight/price math),
 * and is the only shipping symbol handlers, keyboards and formatters may
 * import.
 *
 * No price is ever invented here: every figure originates in the
 * `shipping_rates` table. The service only selects the matching weight tier
 * and converts the stored currency to SAR, exactly as the website does.
 */
import { env } from "../config/env.js";
import { ShippingCalculator } from "../shipping/shipping.calculator.js";
import { ShippingGateway, shippingGateway } from "../shipping/shipping.gateway.js";
import type { Carrier, CarrierRate, ShippingQuote, Warehouse } from "../types/shipping.js";

export class ShippingService {
  constructor(private readonly gateway: ShippingGateway = shippingGateway) {}

  async listWarehouses(): Promise<Warehouse[]> {
    return this.gateway.fetchWarehouses();
  }

  async listCarriers(): Promise<Carrier[]> {
    return this.gateway.fetchCarriers();
  }

  /**
   * The warehouse used for every indirect lookup. The operator is not asked
   * to choose one; `env.DEFAULT_WAREHOUSE_ID` decides.
   */
  async getDefaultWarehouse(): Promise<Warehouse | undefined> {
    const warehouses = await this.gateway.fetchWarehouses();
    return warehouses.find((warehouse) => warehouse.id === env.DEFAULT_WAREHOUSE_ID);
  }

  /**
   * Rates for every carrier that actually serves this warehouse at this
   * weight, cheapest first. Carriers with no rate table for the warehouse,
   * or whose table yields no tier, are omitted rather than shown priceless.
   */
  async getRatesForWeight(warehouseId: number, weight: number): Promise<CarrierRate[]> {
    const grouped = await this.gateway.fetchRateTablesByCarrier(warehouseId);

    const rates: CarrierRate[] = [];
    for (const [carrierId, { carrierName, table }] of grouped) {
      const calculated = ShippingCalculator.getRate(table, weight);
      if (!calculated) continue;

      rates.push({
        carrierId,
        carrierName,
        price: calculated.convertedPrice,
        currency: "SAR",
        deliveryDays: calculated.deliveryDays || undefined,
      });
    }

    return rates.sort((a, b) => a.price - b.price);
  }

  async getRateForCarrier(
    warehouseId: number,
    carrierId: number,
    weight: number
  ): Promise<CarrierRate | undefined> {
    const entry = await this.gateway.fetchRateTableForCarrier(warehouseId, carrierId);
    if (!entry) return undefined;

    const calculated = ShippingCalculator.getRate(entry.table, weight);
    if (!calculated) return undefined;

    return {
      carrierId,
      carrierName: entry.carrierName,
      price: calculated.convertedPrice,
      currency: "SAR",
      deliveryDays: calculated.deliveryDays || undefined,
    };
  }

  /** Standardized quote for a specific warehouse/carrier/weight -- the shape future features (orders, estimates) should build on. */
  async calculateQuote(
    warehouse: Warehouse,
    carrier: Carrier,
    weight: number
  ): Promise<ShippingQuote | undefined> {
    const entry = await this.gateway.fetchRateTableForCarrier(warehouse.id, carrier.id);
    if (!entry) return undefined;

    const calculated = ShippingCalculator.getRate(entry.table, weight);
    if (!calculated) return undefined;

    return {
      warehouse,
      carrier,
      weight,
      price: calculated.price,
      currency: calculated.currency,
      deliveryDays: calculated.deliveryDays,
      convertedPrice: calculated.convertedPrice,
      capped: calculated.capped,
    };
  }
}

export const shippingService = new ShippingService();
