import "dotenv/config";
import { bot } from "./telegram/bot.js";
import { startHandler } from "./handlers/start.handler.js";
import { callbackHandler } from "./handlers/callback.handler.js";
import { messageHandler } from "./handlers/message.handler.js";
import { dashboardHandler } from "./handlers/dashboard.handler.js";

bot.command("start", startHandler);
bot.command("dashboard", dashboardHandler);

bot.on("callback_query:data", callbackHandler);
bot.on("message:text", messageHandler);

bot.catch((err) => {
  console.error("Bot error:", err);
});

bot.start();

console.log("✅ Bot is running...");