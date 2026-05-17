import { Bot, InlineKeyboard } from "grammy";
import { State } from "./state";
import { getSystemPrompt, agentConfig } from "./config";
import { runAgent } from "./agent";
import { DB } from "./db";

export function setupCommands(bot: Bot) {
  bot.command("start", (ctx) => ctx.reply("👋 Agent online. Use /ai to force trigger. /model to switch AI. /status for info. /clear to reset."));

  bot.command("clear", (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    DB.clearMessages(threadKey);
    ctx.reply("🧹 Memory wiped. Context reset.", { message_thread_id: threadKey });
  });

  bot.command("status", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const history = DB.getMessages(threadKey) || [];
    const stats = DB.getStats(threadKey) || { requests: 0, prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, last_context_size: 0 };
    const thread = DB.getThread(threadKey);

    const total = stats.prompt_tokens + stats.completion_tokens;
    let warning = stats.last_context_size > agentConfig.maxTokenWarning
      ? `\n\n⚠️ <b>Warning: Context size is high!</b>` : "";
    const model = thread?.model_id || State.currentAiModel;

    const msg = `📊 <b>LLM Context Status</b>
<b>State:</b> 🟢 Listening
<b>Memory:</b> ${history.length} msgs
<b>Context:</b> ~${stats.last_context_size.toLocaleString()} tokens
<b>Model:</b> <code>${model}</code>

🪙 <b>Token Usage:</b>
<b>Prompt:</b> ${stats.prompt_tokens.toLocaleString()}
<b>Output:</b> ${stats.completion_tokens.toLocaleString()}
<b>Total:</b> ${total.toLocaleString()}
⚡ <b>Cached (Saved!):</b> ${stats.cached_tokens.toLocaleString()}${warning}`;

    return ctx.reply(msg, { parse_mode: "HTML", message_thread_id: threadKey });
  });

  bot.command("model", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const match = ctx.match.trim();
    const thread = DB.getThread(threadKey);
    const currentModel = thread?.model_id || State.currentAiModel;

    if (!match) {
      return ctx.reply(`🤖 <b>Current:</b> <code>${currentModel}</code>\n\n<b>Usage:</b>\nSet: <code>/model &lt;id&gt;</code>\nSearch: <code>/model search free</code>`, { parse_mode: "HTML", message_thread_id: threadKey });
    }

    if (match.toLowerCase().startsWith("search ")) {
      const query = match.substring(7).trim().toLowerCase();
      const statusMsg = await ctx.reply(`🔍 <i>Searching OpenRouter for "${query}"...</i>`, { parse_mode: "HTML", message_thread_id: threadKey });

      try {
        const response = await fetch("https://openrouter.ai/api/v1/models");
        const data = await response.json();
        let models = data.data as any[];

        if (query === "free") {
          models = models.filter(m => parseFloat(m.pricing?.prompt || "1") === 0 && parseFloat(m.pricing?.completion || "1") === 0);
        } else {
          models = models.filter(m => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query));
        }

        models = models.filter(m => m.id.length <= 60).slice(0, 10);

        if (models.length === 0) {
          return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ No models found matching "${query}".`, { parse_mode: "HTML" });
        }

        const kb = new InlineKeyboard();
        models.forEach(m => {
          kb.text(`🤖 ${m.name}`, `sm:${m.id}`).row();
        });

        return ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `🔍 <b>Results for "${query}"</b>:\n\n<i>Click a model below to switch to it instantly:</i>`,
          { parse_mode: "HTML", reply_markup: kb }
        );
      } catch (e: any) {
        return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ API Error: ${e.message}`, { parse_mode: "HTML" });
      }
    }

    DB.upsertThread(threadKey, { modelId: match });
    const systemPrompt = await getSystemPrompt(threadKey);
    DB.updateSystemPrompt(threadKey, systemPrompt);
    ctx.reply(`✅ Model set to:\n<code>${match}</code>`, { parse_mode: "HTML", message_thread_id: threadKey });
  });

  bot.command("ai", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    DB.upsertThread(threadKey, { lastActive: Date.now() });

    if (!ctx.match) {
      return ctx.reply("🤖 <b>Usage:</b> <code>/ai &lt;your message&gt;</code>\n\n<i>Note: You can also just reply directly to any of my messages, or DM me to chat without using commands!</i>", {
        parse_mode: "HTML",
        message_thread_id: threadKey
      });
    }

    await processUserMessage(bot, ctx.match, threadKey, ctx.chat.id);
  });
}

export async function processUserMessage(bot: Bot, prompt: string, threadKey: number, chatId: number) {
  const history = DB.getMessages(threadKey);
  if (history.length === 0) {
    const systemPrompt = await getSystemPrompt(threadKey);
    DB.updateSystemPrompt(threadKey, systemPrompt);
    DB.upsertStats(threadKey, { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, lastContextSize: 0 });
  }
  DB.addMessage(threadKey, { role: "user", content: prompt });
  const statusMsg = await bot.api.sendMessage(chatId, `🤔 <i>Thinking...</i>`, { parse_mode: "HTML", message_thread_id: threadKey });
  await runAgent(bot, threadKey, chatId, statusMsg.message_id);
}