/**
 * TEMPORARY MOUNT (commit 1).
 *
 * Sends the Dashboard as an ordinary reply so the layout can be reviewed
 * before any message-ownership machinery exists. This means every /dashboard
 * call adds a message to the chat -- expected at this stage. The Surface
 * commit replaces this body with a single edited message, and the Dashboard
 * renderer itself will not need to change when that happens.
 */
import { type Context, type SessionFlavor } from "grammy";

import { renderDashboard } from "../dashboard/dashboard.js";
import type { SessionData } from "../session/session.js";

export async function dashboardHandler(ctx: Context & SessionFlavor<SessionData>): Promise<void> {
  const { text, keyboard } = renderDashboard(ctx.session);

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
