import OpenAI from "openai";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import crypto from "node:crypto";
import * as fs from "node:fs";
import fsp from "node:fs/promises";
import { OPENROUTER_API_KEY, getSystemPrompt, loadAgentConfig } from "./config";
import { State } from "./state";
import { AGENT_TOOLS, TTS_TOOL, executeToolLocally } from "./tools";
import { DB } from "./db";
import { escapeMarkdownV2 } from "./utils";
import { withRetry } from "./resilience";

const CONTEXT_TOKEN_LIMIT = 100000;

function approximateTokenCount(messages: any[]): number {
  return messages.reduce((acc, msg) => acc + (msg.content?.length || 0) / 4, 0);
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
  // Abort any existing run for this thread first
  State.abortRun(threadKey);

  const controller = new AbortController();
  const signal = controller.signal;
  State.activeAbortControllers.set(threadKey, controller);

  const cancelKb = new InlineKeyboard().text("❌ Cancel", `cancel_run:${threadKey}`);

  DB.log("INFO", `Starting runAgent for thread ${threadKey}`);

  // Reload config and refresh system prompt dynamically (keeps it sorted at index 0 with created_at = 0)
  try {
    await loadAgentConfig();
    const updatedPrompt = await getSystemPrompt(threadKey);
    DB.updateSystemPrompt(threadKey, updatedPrompt);

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

    for (let i = 0; i < 5; i++) {
      if (signal.aborted) throw new Error("Aborted");

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
          if (signal.aborted) throw new Error("Aborted");

          // LIVE STREAMING REQUEST
          const stream = await openai.chat.completions.create({
            model: model,
            messages: messagesForAPI as any,
            tools: [...AGENT_TOOLS, TTS_TOOL] as any,
            stream: true,
            stream_options: { include_usage: true } // Request usage on final chunk
          }, { signal });

          let fullContent = "";
          let toolCalls: any[] = [];
          let lastEditTime = Date.now();
          let finalUsage: any = null;

          for await (const chunk of stream) {
            if (signal.aborted) throw new Error("Aborted");
            if ((chunk as any).usage) finalUsage = (chunk as any).usage;

            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            // Stream Text Chunk
            if (delta.content) {
              fullContent += delta.content;
              const now = Date.now();
              // Batch updates to avoid Telegram 429 API rate limits (1.5 seconds)
              if (now - lastEditTime > 1500) {
                const display = fullContent.length > 4000 ? fullContent.slice(-4000) : fullContent;
                // No parse_mode while streaming to prevent half-baked tags from crashing API
                safeEditMessage(bot, chatId, statusMsgId, "💭 " + display, { reply_markup: cancelKb }).catch(() => { });
                lastEditTime = now;
              }
            }

            // Stream Tool Calls Chunk
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: tc.id, type: "function", function: { name: tc.function?.name || "", arguments: "" } };
                } else {
                  if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                  if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                }
              }
            }
          }

          const validToolCalls = toolCalls.filter(Boolean);

          return {
            usage: finalUsage,
            choices: [{
              message: {
                role: "assistant",
                content: fullContent,
                tool_calls: validToolCalls.length > 0 ? validToolCalls : undefined
              }
            }]
          };
        }, `Model ${model} request`, isRetryableError);
      } catch (error: any) {
        if (signal.aborted || error.message === "Aborted") throw new Error("Aborted");

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
          await safeEditMessage(bot, chatId, statusMsgId, `❌ *AI Model API Error (fatal):*\n\`\`\`\n${escapeMarkdownV2(error.message)}\n\`\`\``, { parse_mode: "MarkdownV2" });
          return;
        }

        // Try fallback models
        const fallbackModels = (await import("./resilience")).FALLBACK_MODELS;
        let fallbackAttempted = false;
        for (const fallbackModel of fallbackModels) {
          if (fallbackModel === model) continue; // Skip the current model
          DB.log("WARN", `Switching to fallback model: ${fallbackModel}`);
          await safeEditMessage(bot, chatId, statusMsgId, `🔄 _Model error. Retrying with fallback..._`, { parse_mode: "MarkdownV2", reply_markup: cancelKb });

          try {
            // Use the same retry logic with the fallback model
            completion = await withRetry(async () => {
              if (signal.aborted) throw new Error("Aborted");
              const result = await openai.chat.completions.create({
                model: fallbackModel,
                messages: messagesForAPI as any,
                tools: [...AGENT_TOOLS, TTS_TOOL] as any,
              }, { signal });
              if (result && (result as any).error) throw new Error((result as any).error.message || JSON.stringify((result as any).error));
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
            if (signal.aborted || fallbackError.message === "Aborted") throw new Error("Aborted");
            const fbErrorMsg = fallbackError.message || "Unknown Error";
            DB.log("ERROR", `Fallback model ${fallbackModel} failed: ${fbErrorMsg}`);
            console.error(`[Fallback Error] ${fallbackModel}: ${fbErrorMsg}`);
            // Continue to next fallback model
          }
        }

        // If we've tried all fallback models and still failed, show the error
        if (!fallbackAttempted) {
          await safeEditMessage(bot, chatId, statusMsgId, `❌ *All models failed:*\n\`\`\`\n${escapeMarkdownV2(error.message)}\n\`\`\``, { parse_mode: "MarkdownV2" });
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

      const allTools = [...AGENT_TOOLS, TTS_TOOL];

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const finalText = msg.content || "Done.";
        await bot.api.sendMessage(chatId, finalText, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
        return;
      }

      let pendingShellTool: any = null;
      let pendingShellCommand: string = "";
      const toolResults: { tool_call_id: string, content: string }[] = [];
      const runningTools: string[] = [];

      DB.log("INFO", `Processing ${msg.tool_calls.length} tool calls`);
      let executedToolsInLoop: string[] = [];

      for (const tool of msg.tool_calls) {
        if (signal.aborted) throw new Error("Aborted");
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
          const result = await executeToolLocally(tool.function.name, args, { threadKey, chatId }) as any;
          toolResults.push({ tool_call_id: tool.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
          executedToolsInLoop.push(tool.function.name);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          DB.log("INFO", `Tool ${tool.function.name} completed with result: ${typeof result === 'string' ? result.substring(0, 100) : "Object"}`);
          // Update chat with progress
          
          if (typeof result === "object" && result.audio_file) {
            await bot.api.sendAudio(chatId, new InputFile(fs.createReadStream(result.audio_file)));
            await bot.api.sendMessage(chatId, `🔊 _Audio response sent._`, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
            await fsp.unlink(result.audio_file).catch(() => { });
          } else {
            await bot.api.sendMessage(chatId, `🔧 *Tool Executed:* \`${tool.function.name}\`\n\n📄 *Result:*\n\`\`\`\n${(result || "").slice(0, 2000)}\n\`\`\``, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
          }
        }
      }
      // If we have executed any non-shell tools, update the chat to show we are done with tool execution
      if (!pendingShellTool && executedToolsInLoop.length > 0) {
        await safeEditMessage(bot, chatId, statusMsgId, `💭 _Finished executing tools. Thinking..._`, { parse_mode: "MarkdownV2", reply_markup: cancelKb });
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
        await bot.api.sendMessage(chatId, `🛠️ *Requires Approval:*\n\`\`\`\n${pendingShellCommand}\n\`\`\``, { parse_mode: "MarkdownV2", reply_markup: kb, message_thread_id: threadKey });
        return;
      }

      // ENHANCED VISIBILITY: List the tools that were just run
      const toolList = runningTools.join(", ");
      await bot.api.sendMessage(chatId, `🔄 _Executed: \`${toolList}\`. Continuing thought..._`, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
    }
    // If loop finishes without return
    await bot.api.sendMessage(chatId, `⚠️ _Agent hit maximum thought loops (5)._`, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
  } catch (globalError: any) {
    if (signal.aborted || globalError.message === "Aborted") {
      DB.log("INFO", `runAgent execution for thread ${threadKey} was aborted.`);
      await safeEditMessage(bot, chatId, statusMsgId, `❌ *Thinking Cancelled.*`, { parse_mode: "MarkdownV2" });
      return;
    }
    DB.log("CRITICAL", `runAgent Global Error: ${globalError.message}`);
    await bot.api.sendMessage(chatId, `❌ *Internal Agent Error:*\n\`\`\`\n${escapeMarkdownV2(globalError.message)}\n\`\`\``, { parse_mode: "MarkdownV2", message_thread_id: threadKey });
  } finally {
    if (State.activeAbortControllers.get(threadKey) === controller) {
      State.activeAbortControllers.delete(threadKey);
    }
  }
}
