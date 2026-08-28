import { CALLBACK_ACTIONS } from "../constants/callback.actions.js";
import { layoutKeyboard } from "./layout.js";

export const mainKeyboard = layoutKeyboard([
  { text: "🧾 إنشاء تسعيرة", data: CALLBACK_ACTIONS.CREATE_QUOTE },
  { text: "📦 إدارة الطلبات", data: CALLBACK_ACTIONS.ORDERS },
  { text: "⚙️ الإعدادات", data: CALLBACK_ACTIONS.SETTINGS },
]);
