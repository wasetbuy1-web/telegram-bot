import { InlineKeyboard } from "grammy";
import { CALLBACK_ACTIONS } from "../constants/callback.actions.js";
import type { CarrierRate } from "../types/shipping.js";
import type { AdditionalFeeType } from "../types/quote.js";
import { DEFAULT_DISCOUNT, DISCOUNT_OPTIONS } from "../services/discount.service.js";
import {
  ADDITIONAL_FEE_OPTIONS,
  DEFAULT_ADDITIONAL_FEE_TYPE,
} from "../services/additional-fee.service.js";
import { formatShippingPrice } from "../utils/money.js";
import { layoutKeyboard, type KeyboardButton } from "./layout.js";

export const shippingMethodKeyboard = layoutKeyboard([
  { text: "🚚 الشحن المباشر", data: CALLBACK_ACTIONS.SET_SHIPPING_METHOD_DIRECT },
  { text: "📦 الشحن غير المباشر", data: CALLBACK_ACTIONS.SET_SHIPPING_METHOD_INDIRECT },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const shippingInputKeyboard = layoutKeyboard([
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_SHIPPING_METHOD },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const indirectShippingKeyboard = layoutKeyboard([
  { text: "🤖 تقدير الوزن", data: CALLBACK_ACTIONS.ESTIMATE_WEIGHT },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_SHIPPING_METHOD },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const estimateWeightKeyboard = layoutKeyboard([
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_INDIRECT_WEIGHT },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

/** Shipping-discount screen: one button per option (FedEx/DHL only), the current one marked. */
export function shippingDiscountKeyboard(current: number | undefined): InlineKeyboard {
  const selected = current ?? DEFAULT_DISCOUNT;

  const buttons: KeyboardButton[] = DISCOUNT_OPTIONS.map((option) => ({
    text: option === selected ? `✅ ${option}%` : `${option}%`,
    data: `${CALLBACK_ACTIONS.SELECT_DISCOUNT_PREFIX}${option}`,
  }));

  buttons.push(
    { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_INDIRECT_WEIGHT },
    { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL }
  );

  return layoutKeyboard(buttons);
}

export function priceCarrierKeyboard(rates: CarrierRate[]): InlineKeyboard {
  const buttons: KeyboardButton[] = rates.map((rate) => ({
    text: `${rate.carrierName} - ${formatShippingPrice(rate.price, rate.currency)}`,
    data: `${CALLBACK_ACTIONS.SELECT_CARRIER_PREFIX}${rate.carrierId}`,
  }));

  buttons.push(
    { text: "📊 عرض جميع الأسعار", data: CALLBACK_ACTIONS.VIEW_ALL_PRICES },
    { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_SHIPPING_DISCOUNT },
    { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL }
  );

  return layoutKeyboard(buttons);
}

/**
 * Additional-fees screen. One option per row (labels are long) with the
 * currently-selected option marked, and -- per this screen's spec -- the
 * navigation buttons kept at the BOTTOM (متابعة then رجوع). This is the one
 * screen that intentionally does not hoist Continue to the top, so it is
 * built directly instead of via layoutKeyboard.
 */
export function additionalFeesKeyboard(
  currentType: AdditionalFeeType | undefined,
  customAmount: number | undefined
): InlineKeyboard {
  const selected = currentType ?? DEFAULT_ADDITIONAL_FEE_TYPE;
  const keyboard = new InlineKeyboard();

  for (const option of ADDITIONAL_FEE_OPTIONS) {
    let label = option.buttonLabel;
    if (option.fixed && option.amount > 0) {
      label += ` (+${option.amount}$)`;
    } else if (option.type === "custom" && selected === "custom" && customAmount != null && customAmount > 0) {
      label += ` (+${customAmount}$)`;
    }
    if (selected === option.type) label = `✅ ${label}`;
    keyboard.text(label, `${CALLBACK_ACTIONS.SELECT_ADDITIONAL_FEE_PREFIX}${option.type}`).row();
  }

  return keyboard
    .text("➡️ متابعة", CALLBACK_ACTIONS.CONTINUE_ADDITIONAL_FEES)
    .row()
    .text("⬅️ رجوع", CALLBACK_ACTIONS.BACK_TO_SHIPPING_COMPANY);
}

export const customFeeInputKeyboard = layoutKeyboard([
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_ADDITIONAL_FEES },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const quoteSummaryKeyboard = layoutKeyboard([
  { text: "📝 إنشاء رسالة العميل", data: CALLBACK_ACTIONS.GENERATE_CUSTOMER_QUOTE },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_ADDITIONAL_FEES },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const customerQuoteKeyboard = layoutKeyboard([
  { text: "📦 إرسال إلى الموقع", data: CALLBACK_ACTIONS.SEND_TO_WEBSITE },
  { text: "✏️ تعديل التسعيرة", data: CALLBACK_ACTIONS.EDIT_QUOTE },
  { text: "🧾 تسعيرة جديدة", data: CALLBACK_ACTIONS.NEW_QUOTE },
]);
