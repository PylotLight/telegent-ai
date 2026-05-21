import { Bot, InlineKeyboard } from "grammy";
import { State } from "./state";
import { getSystemPrompt, agentConfig, getLocalISOString } from "./config";
import { runAgent } from "./agent";
import { DB } from "./db";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import fs from "node:fs/promises";

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
      ? `\n\n⚠️ <b>Warning: Context size is high!</b>` : "";
    const model = thread?.model_id || State.currentAiModel;

    let gitInfo = "";
    try {
      const { stdout: branch } = await execAsync("git branch --show-current");
      const { stdout: commit } = await execAsync("git rev-parse --short HEAD");
      const { stdout: log } = await execAsync("git log -1 --pretty=format:'%s'");
      gitInfo = `\n🌿 <b>Branch:</b> <code>${branch.trim()}</code>\n📌 <b>Commit:</b> <code>${commit.trim()}</code>\n📝 <b>Log:</b> <i>${log.trim()}</i>`;
    } catch (e: any) {
      gitInfo = `\n⚠️ <b>Git Status:</b> ${e.message}`;
    }

    const msg = `📊 <b>LLM Context Status</b>
<b>State:</b> 🟢 Listening
<b>Memory:</b> ${history.length} msgs
<b>Context:</b> ~${stats.last_context_size.toLocaleString()} tokens
<b>Model:</b> <code>${model}</code>
${gitInfo}

🪙 <b>Token Usage:</b>
<b>Prompt:</b> ${stats.prompt_tokens.toLocaleString()}
<b>Output:</b> ${stats.completion_tokens.toLocaleString()}
<b>Total:</b> ${total.toLocaleString()}
⚡ <b>Cached (Saved!):</b> ${stats.cached_tokens.toLocaleString()}${warning}`;

    return ctx.reply(msg, { parse_mode: "HTML", message_thread_id: threadKey });
  });

  bot.command("branch", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const match = ctx.match.trim();

    if (!match) {
      return ctx.reply(`🤖 <b>Branch Management</b>\n\nSet branch: <code>/branch &lt;branch-name&gt;</code>\nList branches: <code>/branch list</code>`, { parse_mode: "HTML", message_thread_id: threadKey });
    }

    if (match.toLowerCase() === "list") {
      const statusMsg = await ctx.reply("🔍 <i>Fetching branch list from remote...</i>", { parse_mode: "HTML", message_thread_id: threadKey });
      try {
        await execAsync("git fetch --all");
        const { stdout: branchesOut } = await execAsync("git branch -a");
        const branches = branchesOut.split("\n")
          .map(b => b.replace(/^\*/, "").trim())
          .filter(b => b.length > 0 && !b.includes("HEAD"));
        
        const branchList = branches.map(b => `• <code>${b}</code>`).join("\n");
        return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `🌿 <b>Available Git Branches:</b>\n\n${branchList}`, { parse_mode: "HTML" });
      } catch (e: any) {
        return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ Error: ${e.message}`, { parse_mode: "HTML" });
      }
    }

    const statusMsg = await ctx.reply(`🔍 <i>Verifying branch "${match}"...</i>`, { parse_mode: "HTML", message_thread_id: threadKey });
    try {
      await execAsync("git fetch --all");
      try {
        await execAsync(`git show-ref --verify refs/heads/${match} || git show-ref --verify refs/remotes/origin/${match}`);
      } catch {
        return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Branch <code>${match}</code> does not exist on remote or local repo.`, { parse_mode: "HTML" });
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

      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `🔄 <b>Switching target branch to:</b> <code>${match}</code>\n\n⌛ <i>Checking out, updating dependencies, typechecking, and restarting. Stand by...</i>`, { parse_mode: "HTML" });
      
      setTimeout(() => {
        process.exit(42);
      }, 1000);
    } catch (e: any) {
      return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ Failed to switch branch: ${e.message}`, { parse_mode: "HTML" });
    }
  });

  bot.command("update", async (ctx) => {
    const threadKey = ctx.message?.message_thread_id || ctx.chat.id;
    const statusMsg = await ctx.reply("🔍 <i>Checking remote for updates on current branch...</i>", { parse_mode: "HTML", message_thread_id: threadKey });
    
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
          `✅ <b>Up to date!</b>\n\nBot is running the latest commit on branch <code>${currentBranch}</code>:\n<code>${localHash.substring(0, 7)}</code>`,
          { parse_mode: "HTML" }
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
        `🔄 <b>Updates available on branch <code>${currentBranch}</code>!</b>\n\n📌 <b>Current Commit:</b> <code>${localHash.substring(0, 7)}</code>\n📡 <b>Remote Commit:</b> <code>${remoteHash.substring(0, 7)}</code>\n\n📄 <b>Changelog:</b>\n<pre><code>${log.trim() || "No detailed log."}</code></pre>`,
        { parse_mode: "HTML", reply_markup: kb }
      );
    } catch (e: any) {
      return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ Failed to check updates: ${e.message}`, { parse_mode: "HTML" });
    }
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
        const data = (await response.json()) as any;
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

  // Inject current time transparently into the user message content stored in DB.
  // This keeps the system prompt static for perfect caching, but gives real-time awareness!
  const localTimeStr = getLocalISOString(agentConfig.timezone);
  const timeAwarePrompt = `${prompt}\n\n[Current Time: ${localTimeStr}]`;

  DB.addMessage(threadKey, { role: "user", content: timeAwarePrompt });
  const statusMsg = await bot.api.sendMessage(chatId, `🤔 <i>Thinking...</i>`, { parse_mode: "HTML", message_thread_id: threadKey });
  await runAgent(bot, threadKey, chatId, statusMsg.message_id);
}