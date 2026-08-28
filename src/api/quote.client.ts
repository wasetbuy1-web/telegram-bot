import axios from "axios";
import { env } from "../config/env.js";
import type { QuoteClientResult, QuotePayload } from "../types/quote-api.js";

export async function submitQuote(payload: QuotePayload): Promise<QuoteClientResult> {
  if (!env.API_BASE_URL) {
    return {
      success: false,
      errorMessage: "لم يتم تكوين رابط الخادم (API_BASE_URL).",
    };
  }

  try {
    const response = await axios.post(`${env.API_BASE_URL}/quotes`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطأ غير معروف";
    return {
      success: false,
      errorMessage: `فشل إرسال التسعيرة: ${message}`,
    };
  }
}
