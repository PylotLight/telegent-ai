import { Bot, InlineKeyboard } from "grammy";
import { md } from "telegram-markdown-v2"; // Using the template tag from the package
import { State } from "./state";
import { getSystemPrompt, agentConfig } from "./config";
import { runAgent } from "./agent";
import { DB } from "./db";

export function setupCommands(bot: Bot) {
  bot.command("start", (ctx) => ctx.reply("👋 Agent online\\. Use /ai to wake me\\. /model to switch AI\\. /status for info\\. /clear to reset\\.", { parse_mode: "MarkdownV2" }));

  bot.command("clear", (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    DB.clearMessages(threadKey);
    DB.upsertThread(threadKey, { lastActive: 0 }); 
    ctx.reply("🧹 Memory wiped, AI is now sleeping in this thread\\.", { message_thread_id: threadKey, parse_mode: "MarkdownV2" });
  });

  bot.command("status", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const history = DB.getMessages(threadKey) || [];
    const stats = DB.getStats(threadKey) || { requests: 0, prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, last_context_size: 0 };
    const thread = DB.getThread(threadKey);
    
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const isActive = (thread && thread.last_active > oneHourAgo) ? "🟢 Listening" : "🔴 Sleeping";
    const total = stats.prompt_tokens + stats.completion_tokens;
    const model = thread?.model_id || State.currentAiModel;

    // Using the 'md' template tag safely escapes variables injected while parsing intended markdown characters!
    const msg = md`📊 *LLM Context Status*
*State:* ${isActive}
*Memory:* ${history.length} msgs
*Context:* ~${stats.last_context_size.toLocaleString()} tokens
*Model:* \`${model}\`

🪙 *Token Usage:*
*Prompt:* ${stats.prompt_tokens.toLocaleString()}
*Output:* ${stats.completion_tokens.toLocaleString()}
*Total:* ${total.toLocaleString()}
⚡ *Cached (Saved!):* ${stats.cached_tokens.toLocaleString()}`;

    let warning = stats.last_context_size > agentConfig.maxTokenWarning
      ? md`\n\n⚠️ *Warning: Context size is high!*` : "";

    return ctx.reply(msg + warning, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
  });

  bot.command("model", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const match = ctx.match.trim();
    const thread = DB.getThread(threadKey);
    const currentModel = thread?.model_id || State.currentAiModel;

    if (!match) {
      return ctx.reply(md`🤖 *Current:* \`${currentModel}\`\n\n*Usage:*\nSet: \`/model <id>\`\nSearch: \`/model search free\``, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
    }

    if (match.toLowerCase().startsWith("search ")) {
      const query = match.substring(7).trim().toLowerCase();
      const statusMsg = await ctx.reply(md`🔍 _Searching OpenRouter for "${query}"..._`, { parse_mode: "MarkdownV2", message_thread_id: threadKey });

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
          return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, md`❌ No models found matching "${query}"\\.`, { parse_mode: "MarkdownV2" });
        }

        const kb = new InlineKeyboard();
        models.forEach(m => {
          kb.text(`🤖 ${m.name}`, `sm:${m.id}`).row();
        });

        return ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          md`🔍 *Results for "${query}"*:\n\n_Click a model below to switch to it instantly:_`,
          { parse_mode: "MarkdownV2", reply_markup: kb }
        );
      } catch (e: any) {
        return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, md`⚠️ API Error: ${e.message}`, { parse_mode: "MarkdownV2" });
      }
    }

    DB.upsertThread(threadKey, { modelId: match });
    const systemPrompt = await getSystemPrompt(threadKey);
    DB.updateSystemPrompt(threadKey, systemPrompt);
    ctx.reply(md`✅ Model set to:\n\`${match}\``, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
  });

  bot.command("ai", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    DB.upsertThread(threadKey, { lastActive: Date.now() });
    if (!ctx.match) return ctx.reply("🟢 AI is awake\\!", { parse_mode: "MarkdownV2", message_thread_id: threadKey });
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
  const statusMsg = await bot.api.sendMessage(chatId, `🤔 _Thinking\\.\\.\\._`, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
  await runAgent(bot, threadKey, chatId, statusMsg.message_id);
}