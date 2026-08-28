/**
 * ShippingGateway: the ONLY module in the bot that queries Supabase for
 * shipping data (warehouses, carriers, shipping_rates). Every other module
 * -- including handlers, keyboards, and formatters -- must go through
 * ShippingService instead of importing this class directly.
 *
 * Fetches full rate tables (every weight tier for a pair), not just rows
 * above the requested weight, so ShippingCalculator can apply the weight
 * cap rule (fall back to the highest tier when the requested weight
 * exceeds all of them).
 */
import { supabase } from "../lib/supabase.js";
import type { RateTable } from "./shipping.calculator.js";
import type { Carrier, Warehouse } from "./shipping.types.js";

interface WarehouseRow {
  id: number;
  country_id: number;
  name: string;
}

interface CarrierRow {
  id: number;
  name: string;
}

interface ShippingRateRow {
  carrier_id: number;
  weight: number;
  price: number;
  currency: string;
  delivery_days: string | null;
  carriers: { name: string } | null;
}

export interface CarrierRateTable {
  carrierName: string;
  table: RateTable;
}

export class ShippingGateway {
  async fetchWarehouses(): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from("warehouses")
      .select("id, country_id, name")
      .order("name")
      .returns<WarehouseRow[]>();

    if (error) {
      throw new Error(`Failed to load warehouses: ${error.message}`);
    }

    return data.map((row) => ({
      id: row.id,
      countryId: row.country_id,
      name: row.name,
    }));
  }

  async fetchCarriers(): Promise<Carrier[]> {
    const { data, error } = await supabase
      .from("carriers")
      .select("id, name")
      .order("name")
      .returns<CarrierRow[]>();

    if (error) {
      throw new Error(`Failed to load carriers: ${error.message}`);
    }

    return data.map((row) => ({ id: row.id, name: row.name }));
  }

  /** Full rate tables (all weight tiers) for every carrier at a warehouse. */
  async fetchRateTablesByCarrier(warehouseId: number): Promise<Map<number, CarrierRateTable>> {
    const { data, error } = await supabase
      .from("shipping_rates")
      .select("carrier_id, weight, price, currency, delivery_days, carriers(name)")
      .eq("warehouse_id", warehouseId)
      .returns<ShippingRateRow[]>();

    if (error) {
      throw new Error(`Failed to load shipping rates: ${error.message}`);
    }

    const grouped = new Map<number, CarrierRateTable>();
    for (const row of data) {
      let entry = grouped.get(row.carrier_id);
      if (!entry) {
        entry = { carrierName: row.carriers?.name ?? "غير معروف", table: {} };
        grouped.set(row.carrier_id, entry);
      }
      entry.table[row.weight] = {
        price: row.price,
        currency: row.currency,
        deliveryDays: row.delivery_days ?? "",
      };
    }

    return grouped;
  }

  /** Full rate table (all weight tiers) for a single (warehouse, carrier) pair. */
  async fetchRateTableForCarrier(
    warehouseId: number,
    carrierId: number
  ): Promise<CarrierRateTable | undefined> {
    const { data, error } = await supabase
      .from("shipping_rates")
      .select("carrier_id, weight, price, currency, delivery_days, carriers(name)")
      .eq("warehouse_id", warehouseId)
      .eq("carrier_id", carrierId)
      .returns<ShippingRateRow[]>();

    if (error) {
      throw new Error(`Failed to load shipping rates: ${error.message}`);
    }

    if (data.length === 0) return undefined;

    const table: RateTable = {};
    for (const row of data) {
      table[row.weight] = {
        price: row.price,
        currency: row.currency,
        deliveryDays: row.delivery_days ?? "",
      };
    }

    return { carrierName: data[0]?.carriers?.name ?? "غير معروف", table };
  }
}

export const shippingGateway = new ShippingGateway();
