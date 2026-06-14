import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { escapeMarkdownV2 } from "./utils";
import { TELEGRAM_TOKEN, MY_TELEGRAM_ID, ensureBrainDir, loadAgentConfig, initSecrets, getSystemPrompt, DEFAULT_MODEL } from "./config";
import { processUserMessage, setupCommands } from "./commands";
import { runAgent } from "./agent";
import { DB } from "./db";
import { initScheduler } from "./scheduler";
import { State } from "./state";

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
    if (!data) return;

    // Upgrades and Updates handling
    if (data === "upd:pull") {
      await ctx.answerCallbackQuery({ text: "Initiating hot-swap upgrade..." });
      if (ctx.chat && ctx.callbackQuery.message) {
        await bot.api.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          "⏳ *Pulling updates, typechecking, and hot-swapping. Stand by...*",
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
          "❌ *Upgrade cancelled.*",
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

    if (data.startsWith("cancel_run:") || data.startsWith("cancel_cmd:")) {
      const parts = data.split(":");
      const threadKey = parseInt(parts[1] || "", 10);
      if (!isNaN(threadKey)) {
        State.abortRun(threadKey);
        await ctx.answerCallbackQuery({ text: "Cancellation signal sent." });
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

    const updateMessage = async (text: string, options: any = {}) => bot.api.editMessageText(pending.chat_id, pending.status_msg_id, text, { parse_mode: "MarkdownV2", ...options });

    if (action === "reject") {
      DB.addMessage(pending.thread_key, { role: "tool", content: "User rejected execution.", toolCallId: pending.tool_call_id });
      DB.deletePendingAction(cmdId);
      await updateMessage(`❌ *Command Rejected:*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\``);
      await runAgent(bot, pending.thread_key, pending.chat_id, pending.status_msg_id);
      return;
    }

    if (action === "approve") {
      const kb = new InlineKeyboard().text("❌ Cancel Command", `cancel_cmd:${pending.thread_key}`);
      await updateMessage(`⏳ *Executing...*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\``, { reply_markup: kb });
      
      try {
        const promise = new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
          const child = exec(pending.command, (error, stdout, stderr) => {
            State.activeProcesses.delete(pending.thread_key);
            if (error) {
              reject(error);
            } else {
              resolve({ stdout, stderr });
            }
          });
          State.activeProcesses.set(pending.thread_key, child);
        });

        const { stdout, stderr } = await promise;
        DB.addMessage(pending.thread_key, { role: "tool", content: (stdout || stderr || "Done").slice(0, 4000), toolCallId: pending.tool_call_id });
        await updateMessage(`✅ *Executed:*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\`\n\n📄 *Result:*\n\`\`\`${escapeMarkdownV2((stdout || stderr || "Done").slice(0, 3000))}\n\`\`\``);
      } catch (error: any) {
        const isKilled = error.signal === "SIGKILL" || error.signal === "SIGTERM" || error.killed;
        const errorMsg = isKilled ? "Command execution was cancelled/terminated by the user." : error.message;

        DB.addMessage(pending.thread_key, { role: "tool", content: `Error: ${errorMsg}`, toolCallId: pending.tool_call_id });

        if (isKilled) {
          await updateMessage(`❌ *Cancelled:*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\``);
        } else {
          await updateMessage(`⚠️ *Failed:*\n\`\`\`${escapeMarkdownV2(pending.command)}\n\`\`\`\n\n*Error:*\n\`\`\`${escapeMarkdownV2(error.message)}\n\`\`\``);
        }
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

  // Replaced bottom startup lines:
  bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Authentication Successful!`);
      console.log(`🤖 Agent online! Logged in as @${botInfo.username}`);
      console.log(`🧠 Default Model: ${DEFAULT_MODEL}`);
    }
  }).catch((err) => {
    if (err.description === "Not Found" || err.error_code === 404) {
      console.error("\n❌ CRITICAL ERROR: Telegram returned '404 Not Found'.");
      console.error("👉 This means your TELEGRAM_TOKEN is invalid or incorrect.");
      console.error("👉 Please double-check your token in brain/secrets.json\n");
    } else {
      console.error("❌ CRITICAL ERROR: Failed to start bot:", err);
    }
    process.exit(1);
  });
}


start();
