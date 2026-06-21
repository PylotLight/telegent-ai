import { Bot, InlineKeyboard } from "grammy";
import { State } from "./state";
import { getSystemPrompt, agentConfig, getLocalISOString } from "./config";
import { runAgent } from "./agent";
import { DB } from "./db";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import fs from "node:fs/promises";
import { escapeMarkdownV2 } from "./utils";

const execAsync = promisify(exec);

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
      ? `\n\n⚠️ *Warning: Context size is high\!*` : "";
    const model = thread?.model_id || State.currentAiModel;

    let gitInfo = "";
    try {
      const { stdout: branch } = await execAsync("git branch --show-current");
      const { stdout: commit } = await execAsync("git rev-parse --short HEAD");
      const { stdout: log } = await execAsync("git log -1 --pretty=format:'%s'");
      gitInfo = `\n🌿 *Branch:* \`${escapeMarkdownV2(branch.trim())}\`\n📌 *Commit:* \`${escapeMarkdownV2(commit.trim())}\`\n📝 *Log:* _${escapeMarkdownV2(log.trim())}_`;
    } catch (e: any) {
      gitInfo = `\n⚠️ *Git Status:* ${escapeMarkdownV2(e.message)}`;
    }

    const msg = `📊 *LLM Context Status*
*State:* 🟢 Listening
*Memory:* ${history.length} msgs
*Context:* \~${escapeMarkdownV2(stats.last_context_size.toLocaleString())} tokens
*Model:* \`${escapeMarkdownV2(model)}\`
${gitInfo}

🪙 *Token Usage:*
*Prompt:* ${stats.prompt_tokens.toLocaleString()}
*Output:* ${stats.completion_tokens.toLocaleString()}
*Total:* ${total.toLocaleString()}
⚡ *Cached (Saved\!):* ${stats.cached_tokens.toLocaleString()}${warning}`;

    return ctx.reply(msg, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
  });

  bot.command("branch", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const match = ctx.match.trim();

    if (!match) {
      return ctx.reply(`🤖 *Branch Management*\n\nSet branch: \`/branch <branch\-name>\`\nList branches: \`/branch list\``, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
    }

    if (match.toLowerCase() === "list") {
       const statusMsg = await ctx.reply("🔍 _Fetching branch list from remote\\.\\.\\._",{ parse_mode: "MarkdownV2", message_thread_id: threadKey });
      try {
        await execAsync("git fetch --all");
        const { stdout: branchesOut } = await execAsync("git branch -a");
        const branches = branchesOut.split("\n")
          .map(b => b.replace(/^\*/, "").trim())
          .filter(b => b.length > 0 && !b.includes("HEAD"));
         const branchList = branches.map(b => `• \`${escapeMarkdownV2(b)}\``).join("\n");
         return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `🌿 *Available Git Branches:*\n\n${branchList}`, { parse_mode: "MarkdownV2" });
      } catch (e: any) {
         return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ Error: ${escapeMarkdownV2(e.message)}`, { parse_mode: "MarkdownV2" });
      }
    }
     const statusMsg = await ctx.reply(`🔍 _Verifying branch "${escapeMarkdownV2(match)}"\\.\\.\\._`, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
    try {
      await execAsync("git fetch --all");
      try {
        await execAsync(`git show-ref --verify refs/heads/${match} || git show-ref --verify refs/remotes/origin/${match}`);
      } catch {
         return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Branch \`${escapeMarkdownV2(match)}\` does not exist on remote or local repo\.`, { parse_mode: "MarkdownV2" });
      }

      // Write to boot.json
      const bootFile = path.join(process.cwd(), "brain", "boot.json");
      let bootData: any = {};
      try {
        const fileContent = await fs.readFile(bootFile, "utf-8");
        bootData = JSON.parse(fileContent);
      } catch {}
      bootData.target_branch = match;
      await fs.writeFile(bootFile, JSON.stringify(bootData, null, 2), "utf-8");
       await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `🔄 *Switching target branch to:* \`${escapeMarkdownV2(match)}\`\n\n⌛ _Checking out, updating dependencies, typechecking, and restarting\\. Stand by\\.\\.\\._`, { parse_mode: "MarkdownV2" });
      
      setTimeout(() => {
        process.exit(42);
      }, 1000);
    } catch (e: any) {
       return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ Failed to switch branch: ${escapeMarkdownV2(e.message)}`, { parse_mode: "MarkdownV2" });
    }
  });

  bot.command("update", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const statusMsg = await ctx.reply("🔍 _Checking remote for updates on current branch\\.\\.\\._", { parse_mode: "MarkdownV2", message_thread_id: threadKey });
    
    try {
      await execAsync("git fetch --all");
      const { stdout: branch } = await execAsync("git branch --show-current");
      const currentBranch = branch.trim();

      const { stdout: local } = await execAsync("git rev-parse HEAD");
      const { stdout: remote } = await execAsync(`git rev-parse origin/${currentBranch}`);

      const localHash = local.trim();
      const remoteHash = remote.trim();

      if (localHash === remoteHash) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `✅ *Up to date\\!*\n\nBot is running the latest commit on branch \`${escapeMarkdownV2(currentBranch)}\`:\n\`${escapeMarkdownV2(localHash.substring(0, 7))}\``,
          { parse_mode: "MarkdownV2" }
        );
      }

      // Get change log
      const { stdout: log } = await execAsync(`git log HEAD..origin/${currentBranch} --oneline -n 5`);
      
      const kb = new InlineKeyboard()
        .text("✅ Pull & Hot-Swap", "upd:pull")
        .text("❌ Cancel", "upd:cancel");

      return ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `🔄 *Updates available on branch \`${escapeMarkdownV2(currentBranch)}\`\!*\n\n📌 *Current Commit:* \`${escapeMarkdownV2(localHash.substring(0, 7))}\`\n📡 *Remote Commit:* \`${escapeMarkdownV2(remoteHash.substring(0, 7))}\`\n\n📄 *Changelog:*\n\`\`\`\n${escapeMarkdownV2(log.trim() || "No detailed log.")}\n\`\`\``,
        { parse_mode: "MarkdownV2", reply_markup: kb }
      );
    } catch (e: any) {
      return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ Failed to check updates: ${escapeMarkdownV2(e.message)}`, { parse_mode: "MarkdownV2" });
    }
  });

  bot.command("model", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const match = ctx.match.trim();
    const thread = DB.getThread(threadKey);
    const currentModel = thread?.model_id || State.currentAiModel;

    if (!match) {
      return ctx.reply(`🤖 *Current:* \`${escapeMarkdownV2(currentModel)}\`\n\n*Usage:*\nSet: \`/model <id>\`\nSearch: \`/model search free\``, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
    }

    if (match.toLowerCase().startsWith("search ")) {
      const query = match.substring(7).trim().toLowerCase();
      const statusMsg = await ctx.reply(`🔍 _Searching OpenRouter for "${escapeMarkdownV2(query)}"\\.\\.\\._`, { parse_mode: "MarkdownV2", message_thread_id: threadKey });

      try {
        const response = await fetch("https://openrouter.ai/api/v1/models");
        const data = (await response.json()) as any;
        let models = data.data as any[];

        if (query === "free") {
          models = models.filter(m => parseFloat(m.pricing?.prompt || "1") === 0 && parseFloat(m.pricing?.completion || "1") === 0);
        } else {
          models = models.filter(m => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query));
        }

        models = models.filter(m => m.id.length <= 60).slice(0, 10);

        if (models.length === 0) {
          return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ No models found matching "${escapeMarkdownV2(query)}"\.`, { parse_mode: "MarkdownV2" });
        }

        const kb = new InlineKeyboard();
        models.forEach(m => {
          kb.text(`🤖 ${m.name}`, `sm:${m.id}`).row();
        });

        return ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `🔍 *Results for "${escapeMarkdownV2(query)}"*:\n\n_Click a model below to switch to it instantly:_`,
          { parse_mode: "MarkdownV2", reply_markup: kb }
        );
      } catch (e: any) {
        return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ API Error: ${escapeMarkdownV2(e.message)}`, { parse_mode: "MarkdownV2" });
      }
    }

    DB.upsertThread(threadKey, { modelId: match });
    const systemPrompt = await getSystemPrompt(threadKey);
    DB.updateSystemPrompt(threadKey, systemPrompt);
    ctx.reply(`✅ Model set to:\n\`${escapeMarkdownV2(match)}\``, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
  });

  bot.command("ai", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    DB.upsertThread(threadKey, { lastActive: Date.now() });

    if (!ctx.match) {
      return ctx.reply("🤖 *Usage:* \`/ai <your message>\`\n\n_Note: You can also just reply directly to any of my messages, or DM me to chat without using commands\!_", {
        parse_mode: "MarkdownV2",
        message_thread_id: threadKey
      });
    }

    await processUserMessage(bot, ctx.match, threadKey, ctx.chat.id);
  });

  bot.command("cancel", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const hasActiveProcess = State.activeProcesses.has(threadKey);
    const hasActiveAI = State.activeAbortControllers.has(threadKey);

    if (!hasActiveProcess && !hasActiveAI) {
      return ctx.reply("❌ No active command or AI run to cancel\\.", { message_thread_id: threadKey });
    }

    State.abortRun(threadKey);
    return ctx.reply("🛑 Active execution/thinking cancelled\\.", { message_thread_id: threadKey });
  });
}

export async function processUserMessage(bot: Bot, prompt: string, threadKey: number, chatId: number) {
  const history = DB.getMessages(threadKey);
  if (history.length === 0) {
    const systemPrompt = await getSystemPrompt(threadKey);
    DB.updateSystemPrompt(threadKey, systemPrompt);
    DB.upsertStats(threadKey, { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, lastContextSize: 0 });
  }

  // Inject current time transparently into the user message content stored in DB.
  // This keeps the system prompt static for perfect caching, but gives real-time awareness!
  const localTimeStr = getLocalISOString(agentConfig.timezone);
  const timeAwarePrompt = `${prompt}\n\n[Current Time: ${localTimeStr}]`;

  DB.addMessage(threadKey, { role: "user", content: timeAwarePrompt });
  const cancelKb = new InlineKeyboard().text("❌ Cancel", `cancel_run:${threadKey}`);
  const statusMsg = await bot.api.sendMessage(chatId, `🤔 _Thinking\\.\\.\\._`, { parse_mode: "MarkdownV2", message_thread_id: threadKey, reply_markup: cancelKb });
  await runAgent(bot, threadKey, chatId, statusMsg.message_id);
}