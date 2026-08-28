import { Context } from "grammy";
import { mainKeyboard } from "../keyboards/index.js";
import { title } from "../formatters/ui.js";

export async function startHandler(ctx: Context) {
  await ctx.reply(
    `${title("🏠", "القائمة الرئيسية")}\n\nاختر أحد الخيارات:`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard,
    }
  );
}