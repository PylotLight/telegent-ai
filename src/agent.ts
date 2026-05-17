import OpenAI from "openai";
import { Bot, InlineKeyboard } from "grammy";
import crypto from "node:crypto";
import { OPENROUTER_API_KEY } from "./config";
import { State } from "./state";
import { AGENT_TOOLS, executeToolLocally } from "./tools";
import { DB } from "./db";
import { withRetry } from "./resilience";
import { escape } from "telegram-markdown-v2";

const CONTEXT_TOKEN_LIMIT = 100000;

function approximateTokenCount(messages: any[]): number {
  return messages.reduce((acc, msg) => acc + (msg.content?.length || 0) / 4, 0);
}

function formatAgentResponse(content: string): string {
  // Convert basic ** to *
  let txt = content.replace(/\*\*(.*?)\*\*/g, '*$1*');
  // Telegram Markdown V2 demands escaping of specific characters outside of codeblocks.
  // A safe regex that avoids breaking codeblocks entirely is complex, so we rely on 
  // the model's instructions in config.ts, but we forcefully escape common breaking characters
  // like [ ] ( ) ~ > # + - = | { } . !
  // For production, using parse_mode: "HTML" and an MD->HTML parser is usually 100x more stable,
  // but to adhere to the MarkdownV2 constraint safely:
  txt = txt.replace(/(?<!\\)([>#\+\-\|{}\.!])/g, '\\$1');
  return txt;
}


function getOpenRouterClient() {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY,
    timeout: 60000
  });
}

// HELPER: Safely edit message and ignore "message is not modified" errors
async function safeEditMessage(bot: Bot, chatId: number, messageId: number, text: string, options: any = {}) {
  try {
    await bot.api.editMessageText(chatId, messageId, text, options);
  } catch (e: any) {
    if (e.description?.includes("message is not modified")) {
      // This is fine, just means content is identical
      return;
    }
    DB.log("ERROR", `safeEditMessage failed: ${e.message}`);
    console.error(`[safeEditMessage Error]: ${e.message}`);
  }
}

export async function runAgent(bot: Bot, threadKey: number, chatId: number, statusMsgId: number) {
  DB.log("INFO", `Starting runAgent for thread ${threadKey}`);
  let history = DB.getMessages(threadKey);

  if (approximateTokenCount(history) > CONTEXT_TOKEN_LIMIT) {
    const systemPrompt = history[0]?.role === "system" ? history[0] : null;
    const otherMessages = history.filter(m => m.role !== "system" || (systemPrompt && history.indexOf(m) !== 0));
    while (approximateTokenCount([systemPrompt, ...otherMessages]) > CONTEXT_TOKEN_LIMIT && otherMessages.length > 0) {
      otherMessages.shift();
    }
    history = systemPrompt ? [systemPrompt, ...otherMessages] : otherMessages;
    DB.clearMessages(threadKey);
    history.forEach(msg => DB.addMessage(threadKey, { role: msg.role, content: msg.content, toolCallId: msg.tool_call_id }));
  }

  const thread = DB.getThread(threadKey);
  const model = thread?.model_id || State.currentAiModel;
  const openai = getOpenRouterClient();

  try {
    for (let i = 0; i < 5; i++) {
      let completion: any;

      const messagesForAPI = history.map((msg, index) => {
        const isSystem = index === 0 && msg.role === "system";
        const isRecentUser = msg.role === "user" && (index === history.length - 1 || index === history.length - 3);
        if (isSystem || isRecentUser) {
          if (typeof msg.content === "string" && msg.content) {
            return { ...msg, content: [{ type: "text", text: msg.content, cache_control: { type: "ephemeral" } }] };
          }
        }
        return msg;
      });

      // Define a retryable error checker
      const isRetryableError = (error: any): boolean => {
        const errorMsg = error.message || "";
        const isAborted = error.name === "AbortError" || errorMsg.includes("aborted");
        if (isAborted) return true;

        const status = error.status || error.response?.status;
        if (status && [429, 500, 502, 503, 504].includes(status)) return true;

        // Also check for specific error messages that indicate transient failures
        if (errorMsg.includes("rate limit") || errorMsg.includes("429") ||
          errorMsg.includes("502") || errorMsg.includes("503") || errorMsg.includes("504")) {
          return true;
        }

        return false;
      };

      try {
        DB.log("INFO", `Sending request to model ${model} with ${messagesForAPI.length} messages`);
        completion = await withRetry(async () => {
          const result = await openai.chat.completions.create({
            model: model,
            messages: messagesForAPI as any,
            tools: AGENT_TOOLS as any,
          });
          if (result && result.error) throw new Error(result.error.message || JSON.stringify(result.error));
          if (!result || !result.choices || result.choices.length === 0) {
            throw new Error(`Model returned an empty or invalid response.`);
          }
          return result;
        }, `Model ${model} request`, isRetryableError);
      } catch (error: any) {
        // If we've exhausted all retries for this model, try fallback models
        const errorMsg = error.message || "Unknown Error";
        const isAborted = error.name === "AbortError" || errorMsg.includes("aborted");
        const level = isAborted ? "WARN" : "ERROR";

        DB.log(level, `OpenRouter API Error [${error.name || 'N/A'}]: ${errorMsg}`);
        console.error(`[API ERROR] ${error.name}: ${errorMsg}`);

        // Check if this is a fatal error (like 401, 400, 404) that shouldn't be retried
        const status = error.status || error.response?.status;
        const isFatal = status && [400, 401, 404].includes(status);

        if (isFatal) {
          // For fatal errors, we don't retry or fallback
          await safeEditMessage(bot, chatId, statusMsgId, `❌ <b>AI Model API Error (fatal):</b>\n<pre><code>${error.message}</code></pre>`, { parse_mode: "HTML" });
          return;
        }

        // Try fallback models
        const fallbackModels = (await import("./resilience")).FALLBACK_MODELS;
        let fallbackAttempted = false;
        for (const fallbackModel of fallbackModels) {
          if (fallbackModel === model) continue; // Skip the current model

          DB.log("WARN", `Switching to fallback model: ${fallbackModel}`);
          await safeEditMessage(bot, chatId, statusMsgId, `🔄 *Model error. Retrying with fallback...*`, { parse_mode: "Markdown" });

          try {
            // Use the same retry logic with the fallback model
            completion = await withRetry(async () => {
              const result = await openai.chat.completions.create({
                model: fallbackModel,
                messages: messagesForAPI as any,
                tools: AGENT_TOOLS as any,
              });
              if (result && result.error) throw new Error(result.error.message || JSON.stringify(result.error));
              if (!result || !result.choices || result.choices.length === 0) {
                throw new Error(`Model returned an empty or invalid response.`);
              }
              return result;
            }, `Fallback model ${fallbackModel} request`, isRetryableError);

            // Success with fallback model
            DB.log("INFO", `Successfully completed request with fallback model ${fallbackModel}`);
            fallbackAttempted = true;
            break;
          } catch (fallbackError: any) {
            const fbErrorMsg = fallbackError.message || "Unknown Error";
            DB.log("ERROR", `Fallback model ${fallbackModel} failed: ${fbErrorMsg}`);
            console.error(`[Fallback Error] ${fallbackModel}: ${fbErrorMsg}`);
            // Continue to next fallback model
          }
        }

        // If we've tried all fallback models and still failed, show the error
        if (!fallbackAttempted) {
          await safeEditMessage(bot, chatId, statusMsgId, `❌ <b>All models failed:</b>\n<pre><code>${error.message}</code></pre>`, { parse_mode: "HTML" });
          return;
        }
      }

      if (completion.usage) {
        const cachedTokens = completion.usage.prompt_tokens_details?.cached_tokens || 0;
        DB.upsertStats(threadKey, {
          requests: 1,
          promptTokens: completion.usage.prompt_tokens || 0,
          completionTokens: completion.usage.completion_tokens || 0, // BUG FIXED HERE
          cachedTokens: cachedTokens,
          lastContextSize: completion.usage.prompt_tokens || 0
        });
      }

      const msg = completion.choices[0].message;
      DB.addMessage(threadKey, { role: msg.role, content: msg.content || "", toolCallId: msg.tool_calls?.[0]?.id });
      history.push(msg);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const formattedText = formatAgentResponse(msg.content || "Done\\.");
        await safeEditMessage(bot, chatId, statusMsgId, formattedText, { parse_mode: "MarkdownV2" });
        return;
      }

      let pendingShellTool: any = null;
      let pendingShellCommand: string = "";
      const toolResults: { tool_call_id: string, content: string }[] = [];
      const runningTools: string[] = [];

      DB.log("INFO", `Processing ${msg.tool_calls.length} tool calls`);
      let executedToolsInLoop: string[] = [];

      for (const tool of msg.tool_calls) {
        runningTools.push(tool.function.name);
        let args: any;
        try {
          args = JSON.parse(tool.function.arguments || "{}");
        } catch (e: any) {
          DB.log("WARN", `Tool JSON Error: ${e.message}`);
          toolResults.push({ tool_call_id: tool.id, content: `System Error: Invalid JSON in arguments: ${e.message}` });
          continue;
        }

        if (tool.function.name === "execute_shell_command") {
          pendingShellTool = tool;
          pendingShellCommand = args.command || "echo 'No command provided'";
          toolResults.push({ tool_call_id: tool.id, content: "Pending user approval." });
          DB.log("INFO", `Tool ${tool.function.name} is pending user approval`);
          break; // break out of the loop because we need approval
        } else {
          DB.log("INFO", `Executing tool: ${tool.function.name}`);
          const result = await executeToolLocally(tool.function.name, args);
          toolResults.push({ tool_call_id: tool.id, content: result });
          executedToolsInLoop.push(tool.function.name);
          DB.log("INFO", `Tool ${tool.function.name} completed with result: ${(result || "").substring(0, 100)}`); // truncate to 100 chars
          // Update chat with progress
          const toolList = executedToolsInLoop.join(", ");
          await safeEditMessage(bot, chatId, statusMsgId, `🔧 <i>Executed tools: <code>${toolList}</code></i>`, { parse_mode: "HTML" });
        }
      }

      // If we have executed any non-shell tools, update the chat to show we are done with tool execution
      if (!pendingShellTool && executedToolsInLoop.length > 0) {
        await safeEditMessage(bot, chatId, statusMsgId, `💭 <i>Finished executing tools. Thinking...</i>`, { parse_mode: "HTML" });
      }

      toolResults.forEach(res => {
        if (!pendingShellTool || res.tool_call_id !== pendingShellTool.id) {
          DB.addMessage(threadKey, { role: "tool", content: res.content, toolCallId: res.tool_call_id });
          history.push({ role: "tool", tool_call_id: res.tool_call_id, content: res.content });
        }
      });

      if (pendingShellTool) {
        const cmdId = crypto.randomUUID().slice(0, 8);
        DB.setPendingAction(cmdId, { threadKey, chatId, statusMsgId, toolCallId: pendingShellTool.id, command: pendingShellCommand });
        const kb = new InlineKeyboard().text("✅ Approve", `approve:${cmdId}`).text("❌ Reject", `reject:${cmdId}`);
        await safeEditMessage(bot, chatId, statusMsgId, `🛠️ <b>Requires Approval:</b>\n<pre><code>${pendingShellCommand}</code></pre>`, { parse_mode: "HTML", reply_markup: kb });
        return;
      }

      // ENHANCED VISIBILITY: List the tools that were just run
      const toolList = runningTools.join(", ");
      await safeEditMessage(bot, chatId, statusMsgId, `🔄 <i>Executed: <code>${toolList}</code>. Continuing thought...</i>`, { parse_mode: "HTML" });
    }
    // If loop finishes without return
    await safeEditMessage(bot, chatId, statusMsgId, `⚠️ <i>Agent hit maximum thought loops (5).</i>`, { parse_mode: "HTML" });
  } catch (globalError: any) {
    DB.log("CRITICAL", `runAgent Global Error: ${globalError.message}`);
    await safeEditMessage(bot, chatId, statusMsgId, `❌ <b>Internal Agent Error:</b>\n<pre><code>${globalError.message}</code></pre>`, { parse_mode: "HTML" });
  }
}
