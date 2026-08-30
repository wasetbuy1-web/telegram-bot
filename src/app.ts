import "dotenv/config";
import { createServer } from "node:http";

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

const port = Number(process.env.PORT) || 10000;

createServer((req, res) => {
  res.writeHead(200);
  res.end("Telegram bot is running");
}).listen(port, "0.0.0.0", () => {
  console.log(`HTTP server running on port ${port}`);
});

bot.start();

console.log("✅ Bot is running...");