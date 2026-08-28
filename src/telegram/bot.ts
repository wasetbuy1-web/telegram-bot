import { Bot, session, type Context, type SessionFlavor } from "grammy";
import { env } from "../config/env.js";
import type { SessionData } from "../session/session.js";
import { initialSession } from "../session/session.js";

export const bot = new Bot<Context & SessionFlavor<SessionData>>(env.BOT_TOKEN);

bot.use(
  session({
    initial: initialSession,
  })
);

bot.catch((err) => {
  console.error("Unhandled bot error:", err);
});