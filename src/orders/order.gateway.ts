/**
 * OrderGateway: the ONLY module in the bot that writes orders to Supabase.
 * It reuses the existing Supabase client and performs the exact same insert
 * the website does in `createOrder()`:
 *
 *   db.from('orders').insert([{ payload: order }])
 *
 * No new table, no schema change, no API. It reuses the existing Supabase
 * client (service_role) and performs the exact same insert the website does
 * in `createOrder()`. On failure the complete Supabase error is logged (as
 * the website does) and re-thrown for the caller to turn into a friendly
 * message.
 *
 * Requires `service_role` to hold table privileges on `public.orders` (it
 * bypasses RLS but not GRANTs). If insert returns 42501, run in Supabase:
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO service_role;
 */
import { supabase } from "../lib/supabase.js";
import type { WebsiteOrder } from "../types/order.js";

export async function insertOrder(order: WebsiteOrder): Promise<void> {
  const { error } = await supabase.from("orders").insert([{ payload: order }]);

  if (error) {
    console.error("Supabase order insert failed:", error);
    throw error;
  }
}
