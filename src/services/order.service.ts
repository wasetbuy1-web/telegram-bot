/**
 * Sends the current quote into the website's Supabase `orders` table -- the
 * job of the "📦 إرسال إلى الموقع" button. It builds the website order object
 * (order.mapper) and inserts it through the orders gateway. The website reads
 * that same table, so the order appears on the Orders page immediately.
 */
import type { SessionData } from "../session/session.js";
import type { ServiceResult } from "./quote.service.js";
import { buildWebsiteOrder } from "./order.mapper.js";
import { insertOrder } from "../orders/order.gateway.js";

export async function submitOrderToWebsite(session: SessionData): Promise<ServiceResult> {
  if (session.draft.products.length === 0) {
    return {
      success: false,
      errorMessage: "لا يمكن إرسال طلب بدون منتجات. أضف منتجاً واحداً على الأقل.",
    };
  }

  try {
    const order = buildWebsiteOrder(session);
    await insertOrder(order);
    return { success: true };
  } catch (error) {
    // The complete Supabase error is already logged in the gateway; log the
    // orchestration context too, then surface a friendly Arabic message.
    console.error("Failed to submit order to website:", error);
    return {
      success: false,
      errorMessage: "تعذر حفظ الطلب في قاعدة البيانات. حاول مرة أخرى لاحقاً.",
    };
  }
}
