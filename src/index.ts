import { Bot, GrammyError, HttpError } from "grammy";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { TELEGRAM_TOKEN, MY_TELEGRAM_ID, ensureBrainDir, loadAgentConfig, initSecrets, getSystemPrompt } from "./config";
import { State } from "./state";
import { processUserMessage, setupCommands } from "./commands";
import { runAgent } from "./agent";
import { DB } from "./db";

const execAsync = promisify(exec);

async function start() {
  // 1. Run CLI/Secret Initialization
  await ensureBrainDir(); 
  await initSecrets();
  await loadAgentConfig();

  // 2. Initialize Bot
  const bot = new Bot(TELEGRAM_TOKEN);

  // Auth Middleware
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== MY_TELEGRAM_ID) return;
    await next();
  });

  setupCommands(bot);

  // Listen for conversational text
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    
    // Auto-sleep logic removed. Always awake.
    DB.upsertThread(threadKey, { lastActive: Date.now() });
    await processUserMessage(bot, ctx.message.text, threadKey, ctx.chat.id);
  });

  // Handle Inline Button Clicks
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

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
          `✅ <b>Model set to:</b>\n<code>${modelId}</code>`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // Shell Command Approval
    const [action, cmdId] = data.split(":");
    const pending = DB.getPendingAction(cmdId);

    if (!pending) return ctx.answerCallbackQuery("Expired");
    const history = DB.getMessages(pending.thread_key);
    if (!history || history.length === 0) return ctx.answerCallbackQuery("Memory lost");

    const updateMessage = async (text: string) => bot.api.editMessageText(pending.chat_id, pending.status_msg_id, text, { parse_mode: "HTML" });

    if (action === "reject") {
      DB.addMessage(pending.thread_key, { role: "tool", content: "User rejected execution.", toolCallId: pending.tool_call_id });
      DB.deletePendingAction(cmdId);
      await updateMessage(`❌ <b>Command Rejected:</b>\n<pre><code>${pending.command}</code></pre>`);
      await runAgent(bot, pending.thread_key, pending.chat_id, pending.status_msg_id);
      return;
    }

    if (action === "approve") {
      await updateMessage(`⏳ <b>Executing...</b>\n<pre><code>${pending.command}</code></pre>`);
      try {
        const { stdout, stderr } = await execAsync(pending.command);
        DB.addMessage(pending.thread_key, { role: "tool", content: (stdout || stderr || "Done").slice(0, 4000), toolCallId: pending.tool_call_id });
        await updateMessage(`✅ <b>Executed:</b>\n<pre><code>${pending.command}</code></pre>\n\n📄 <b>Result:</b>\n<pre><code>${(stdout || stderr || "Done").slice(0, 3000)}</code></pre>`);
      } catch (error: any) {
        DB.addMessage(pending.thread_key, { role: "tool", content: `Error: ${error.message}`, toolCallId: pending.tool_call_id });
        await updateMessage(`⚠️ <b>Failed:</b>\n<pre><code>${pending.command}</code></pre>\n\n<b>Error:</b>\n<pre><code>${error.message}</code></pre>`);
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

  bot.start();
  console.log(`🤖 Agent architecture initialized. Default Model: ${State.currentAiModel}`);
}

start();
