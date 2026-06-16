import { Bot, GrammyError, HttpError } from "grammy";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { escapeMarkdownV2 } from "./utils";
import { TELEGRAM_TOKEN, MY_TELEGRAM_ID, ensureBrainDir, loadAgentConfig, initSecrets, getSystemPrompt, DEFAULT_MODEL } from "./config";
import { processUserMessage, setupCommands } from "./commands";
import { runAgent } from "./agent";
import { DB } from "./db";
import { initScheduler } from "./scheduler";

const execAsync = promisify(exec);

async function start() {
  // 1. Run CLI/Secret Initialization
  await ensureBrainDir();
  await initSecrets();
  await loadAgentConfig();

  // 2. Initialize Bot
  const bot = new Bot(TELEGRAM_TOKEN);
  initScheduler(bot);
  // Auth Middleware
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== MY_TELEGRAM_ID) return;
    await next();
  });

  setupCommands(bot);

  // Listen for conversational text
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;

    const isPrivate = ctx.chat.type === "private";
    const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;

    // If we are in a group/channel and the bot wasn't explicitly replied to, 
    // ignore it so it doesn't interrupt other apps/updates.
    if (!isPrivate && !isReplyToBot) {
      return;
    }

    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    DB.upsertThread(threadKey, { lastActive: Date.now() });
    await processUserMessage(bot, ctx.message.text, threadKey, ctx.chat.id);
  });

  // Handle Inline Button Clicks
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Upgrades and Updates handling
    if (data === "upd:pull") {
      await ctx.answerCallbackQuery({ text: "Initiating hot-swap upgrade..." });
      if (ctx.chat && ctx.callbackQuery.message) {
        await bot.api.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          "⏳ *Pulling updates, typechecking, and hot\-swapping\. Stand by\.\.\.*",
          { parse_mode: "MarkdownV2" }
        );
      }
      setTimeout(() => {
        process.exit(42);
      }, 1000);
      return;
    }

    if (data === "upd:cancel") {
      await ctx.answerCallbackQuery({ text: "Upgrade cancelled." });
      if (ctx.chat && ctx.callbackQuery.message) {
        await bot.api.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          "❌ *Upgrade cancelled\.*",
          { parse_mode: "MarkdownV2" }
        );
      }
      return;
    }

    // Model Selection
    if (data.startsWith("sm:")) {
      const modelId = data.substring(3);
      const threadKey = ctx.callbackQuery.message?.message_thread_id || ctx.chat?.id;

      if (!threadKey) return ctx.answerCallbackQuery("Error: Session lost.");

      DB.upsertThread(threadKey, { modelId });
      const systemPrompt = await getSystemPrompt(threadKey);
      DB.updateSystemPrompt(threadKey, systemPrompt);

      await ctx.answerCallbackQuery({ text: `Model changed to ${modelId}` });

      if (ctx.chat && ctx.callbackQuery.message) {
        await bot.api.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          `✅ *Model set to:*\n\`${escapeMarkdownV2(modelId)}\``,
          { parse_mode: "MarkdownV2" }
        );
      }
      return;
    }

    // Shell Command Approval
    const [action, cmdId] = data.split(":");
    if (!action || !cmdId) return;
    const pending = DB.getPendingAction(cmdId);

    if (!pending) return ctx.answerCallbackQuery("Expired");
    const history = DB.getMessages(pending.thread_key);
    if (!history || history.length === 0) return ctx.answerCallbackQuery("Memory lost");

    const updateMessage = async (text: string) => bot.api.editMessageText(pending.chat_id, pending.status_msg_id, text, { parse_mode: "MarkdownV2" });

    if (action === "reject") {
      DB.addMessage(pending.thread_key, { role: "tool", content: "User rejected execution.", toolCallId: pending.tool_call_id });
      DB.deletePendingAction(cmdId);
      await updateMessage(`❌ *Command Rejected:*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\``);
      await runAgent(bot, pending.thread_key, pending.chat_id, pending.status_msg_id);
      return;
    }

    if (action === "approve") {
      await updateMessage(`⏳ *Executing...*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\``);
      try {
        const { stdout, stderr } = await execAsync(pending.command);
        DB.addMessage(pending.thread_key, { role: "tool", content: (stdout || stderr || "Done").slice(0, 4000), toolCallId: pending.tool_call_id });
        await updateMessage(`✅ *Executed:*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\`\n\n📄 *Result:*\n\`\`\`${escapeMarkdownV2((stdout || stderr || "Done").slice(0, 3000))}\n\`\`\``);
      } catch (error: any) {
        DB.addMessage(pending.thread_key, { role: "tool", content: `Error: ${error.message}`, toolCallId: pending.tool_call_id });
        await updateMessage(`⚠️ *Failed:*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\`\n\n*Error:*\n\`\`\`${escapeMarkdownV2(error.message)}\n\`\`\``);
      }
      DB.deletePendingAction(cmdId);
      await runAgent(bot, pending.thread_key, pending.chat_id, pending.status_msg_id);
    }
  });

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Telegram Error] while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
      console.error("Could not contact Telegram:", e);
    } else {
      console.error("Unknown error:", e);
    }
  });

  // Graceful shutdown
  const stopBot = async () => {
    console.log("\n🛑 Shutting down gracefully...");
    try {
      await bot.stop();
      console.log("✅ Bot polling stopped.");
    } catch (err) {
      console.error("❌ Error during bot stop:", err);
    }
    process.exit(0);
  };

  process.on("SIGTERM", stopBot);
  process.on("SIGINT", stopBot);

  // Start bot with retry logic for 409 Conflict
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      await bot.start({
        onStart: (botInfo) => {
          console.log(`✅ Authentication Successful!`);
          console.log(`🤖 Agent online! Logged in as @${botInfo.username}`);
          console.log(`🧠 Default Model: ${DEFAULT_MODEL}`);
        }
      });
      break; // Success, exit loop
    } catch (err: any) {
      attempts++;
      if (err.error_code === 409 && attempts < maxAttempts) {
        const delay = attempts * 2000;
        console.log(`⚠️ Bot conflict (409). Another instance is running. Retrying in ${delay / 1000}s... (${attempts}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        if (err.description === "Not Found" || err.error_code === 404) {
          console.error("\n❌ CRITICAL ERROR: Telegram returned '404 Not Found'.");
          console.error("👉 This means your TELEGRAM_TOKEN is invalid or incorrect.");
          console.error("👉 Please double-check your token in brain/secrets.json\n");
        } else {
          console.error("❌ CRITICAL ERROR: Failed to start bot:", err);
        }
        process.exit(1);
      }
    }
  }
}


start();
