import { InlineKeyboard } from "grammy";
import { CALLBACK_ACTIONS } from "../constants/callback.actions.js";
import { layoutKeyboard, type KeyboardButton } from "./layout.js";

export function productListKeyboard(hasProducts: boolean): InlineKeyboard {
  const buttons: KeyboardButton[] = [];

  if (hasProducts) {
    buttons.push({ text: "➡️ متابعة", data: CALLBACK_ACTIONS.CONTINUE_QUOTE });
  }

  buttons.push(
    { text: "➕ إضافة منتج", data: CALLBACK_ACTIONS.ADD_PRODUCT },
    { text: "✏️ تعديل منتج", data: CALLBACK_ACTIONS.EDIT_PRODUCT },
    { text: "🗑 حذف منتج", data: CALLBACK_ACTIONS.DELETE_PRODUCT },
    { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_QUOTE_TYPE },
    { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL }
  );

  return layoutKeyboard(buttons);
}

export const productUrlKeyboard = layoutKeyboard([
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const productInputKeyboard = layoutKeyboard([
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const currencyKeyboard = layoutKeyboard([
  { text: "USD", data: CALLBACK_ACTIONS.SET_CURRENCY_USD },
  { text: "SAR", data: CALLBACK_ACTIONS.SET_CURRENCY_SAR },
  { text: "EUR", data: CALLBACK_ACTIONS.SET_CURRENCY_EUR },
  { text: "GBP", data: CALLBACK_ACTIONS.SET_CURRENCY_GBP },
  { text: "AUD", data: CALLBACK_ACTIONS.SET_CURRENCY_AUD },
  { text: "CAD", data: CALLBACK_ACTIONS.SET_CURRENCY_CAD },
  { text: "SGD", data: CALLBACK_ACTIONS.SET_CURRENCY_SGD },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const quantityKeyboard = layoutKeyboard([
  { text: "1", data: CALLBACK_ACTIONS.SELECT_QUANTITY_1 },
  { text: "2", data: CALLBACK_ACTIONS.SELECT_QUANTITY_2 },
  { text: "3", data: CALLBACK_ACTIONS.SELECT_QUANTITY_3 },
  { text: "4", data: CALLBACK_ACTIONS.SELECT_QUANTITY_4 },
  { text: "5", data: CALLBACK_ACTIONS.SELECT_QUANTITY_5 },
  { text: "➕ إدخال رقم", data: CALLBACK_ACTIONS.ENTER_CUSTOM_QUANTITY },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const currencyMainKeyboard = layoutKeyboard([
  { text: "➡️ متابعه", data: CALLBACK_ACTIONS.BACK_TO_PRODUCT_LIST },
  { text: "🔄 تغيير العملة", data: CALLBACK_ACTIONS.CHANGE_CURRENCY },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const currencyConfirmedKeyboard = layoutKeyboard([
  { text: "➡️ متابعة", data: CALLBACK_ACTIONS.CONTINUE_TO_QUANTITY },
  { text: "🔄 تغيير العملة", data: CALLBACK_ACTIONS.CHANGE_CURRENCY },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const quantityMainKeyboard = layoutKeyboard([
  { text: "➕ إدخال رقم", data: CALLBACK_ACTIONS.SHOW_QUANTITY_SELECTOR },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const quantityConfirmedKeyboard = layoutKeyboard([
  { text: "➡️ متابعة", data: CALLBACK_ACTIONS.CONTINUE_TO_LOCAL_SHIPPING },
  { text: "➕ إدخال رقم", data: CALLBACK_ACTIONS.SHOW_QUANTITY_SELECTOR },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.BACK_TO_PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const shippingKeyboard = layoutKeyboard([
  { text: "مجاني", data: CALLBACK_ACTIONS.SET_FREE_SHIPPING },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);

export const categoryKeyboard = layoutKeyboard([
  { text: "تخطي", data: CALLBACK_ACTIONS.SKIP_CATEGORY },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.PRODUCT_LIST },
  { text: "❌ إلغاء", data: CALLBACK_ACTIONS.CANCEL },
]);
