import type { QuoteSubmissionModel } from "../types/quote-api.js";
import { submitQuote } from "../api/quote.client.js";
import { buildQuotePayload } from "./quote.mapper.js";
import type { ServiceResult } from "./quote.service.js";

export async function sendQuoteToWebsite(session: QuoteSubmissionModel): Promise<ServiceResult> {
  if (session.draft.products.length === 0) {
    return {
      success: false,
      errorMessage: "لا يمكن إرسال طلب بدون منتجات. أضف منتجاً واحداً على الأقل.",
    };
  }

  const payload = buildQuotePayload(session);
  const result = await submitQuote(payload);

  if (!result.success) {
    return {
      success: false,
      errorMessage: result.errorMessage,
    };
  }

  return { success: true };
}
