import { type Context, type SessionFlavor } from "grammy";
import type { SessionData } from "../session/session.js";
import { handleQuoteCallback } from "./callbacks/quote.callbacks.js";
import { handleCommonCallback } from "./callbacks/common.callbacks.js";

export async function callbackHandler(ctx: Context & SessionFlavor<SessionData>) {
  const action = ctx.callbackQuery?.data;
  if (!action) return;

  await ctx.answerCallbackQuery();

  if (await handleQuoteCallback(ctx, action)) {
    return;
  }

  await handleCommonCallback(ctx, action);
}
