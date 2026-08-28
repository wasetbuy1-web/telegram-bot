import { type Context, type SessionFlavor } from "grammy";
import { CALLBACK_ACTIONS } from "../../constants/callback.actions.js";
import { mainKeyboard, backKeyboard } from "../../keyboards/index.js";
import type { SessionData } from "../../session/session.js";
import { resetQuoteSession } from "../../services/quote.service.js";
import { title } from "../../formatters/ui.js";

export async function handleCommonCallback(
  ctx: Context & SessionFlavor<SessionData>,
  action: string
): Promise<void> {
  switch (action) {
    case CALLBACK_ACTIONS.CANCEL:
      resetQuoteSession(ctx.session);
      await ctx.editMessageText(`${title("🏠", "القائمة الرئيسية")}\n\nاختر أحد الخيارات:`, {
        parse_mode: "Markdown",
        reply_markup: mainKeyboard,
      });
      break;

    case CALLBACK_ACTIONS.ORDERS:
      await ctx.editMessageText(title("📦", "إدارة الطلبات"), {
        parse_mode: "Markdown",
        reply_markup: backKeyboard,
      });
      break;

    case CALLBACK_ACTIONS.SETTINGS:
      await ctx.editMessageText(title("⚙️", "الإعدادات"), {
        parse_mode: "Markdown",
        reply_markup: backKeyboard,
      });
      break;

    case CALLBACK_ACTIONS.HOME:
      await ctx.editMessageText(`${title("🏠", "القائمة الرئيسية")}\n\nاختر أحد الخيارات:`, {
        parse_mode: "Markdown",
        reply_markup: mainKeyboard,
      });
      break;

    default:
      break;
  }
}
