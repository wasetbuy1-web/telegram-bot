import { CALLBACK_ACTIONS } from "../constants/callback.actions.js";
import { layoutKeyboard } from "./layout.js";

export const quoteKeyboard = layoutKeyboard([
  { text: "🛍️ طلب من موقع واحد", data: CALLBACK_ACTIONS.QUOTE_SINGLE },
  { text: "🛒 طلب من عدة مواقع", data: CALLBACK_ACTIONS.QUOTE_MULTI },
  { text: "⬅️ رجوع", data: CALLBACK_ACTIONS.HOME },
]);
