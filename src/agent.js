"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgent = runAgent;
var openai_1 = require("openai");
var grammy_1 = require("grammy");
var node_crypto_1 = require("node:crypto");
var config_1 = require("./config");
var state_1 = require("./state");
var tools_1 = require("./tools");
var db_1 = require("./db");
var resilience_1 = require("./resilience");
var CONTEXT_TOKEN_LIMIT = 100000;
function approximateTokenCount(messages) {
    return messages.reduce(function (acc, msg) { var _a; return acc + (((_a = msg.content) === null || _a === void 0 ? void 0 : _a.length) || 0) / 4; }, 0);
}
function mdToHTML(text) {
    if (!text)
        return text;
    // 1. Protect code blocks (Markdown) to avoid escaping their content as markdown
    var codeBlocks = [];
    var processed = text.replace(/```(?:[a-z]+)?\s*([\s\S]*?)```/g, function (match, content) {
        var id = "__CODE_BLOCK_".concat(codeBlocks.length, "__");
        var escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push("<pre><code>".concat(escaped, "</code></pre>"));
        return id;
    });
    // 2. Escape HTML, but allow specific tags that the LLM might use for formatting (like <pre> for tables)
    processed = processed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 3. Convert Markdown to HTML
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); // Bold
    processed = processed.replace(/\*(.*?)\*/g, '<i>$1</i>'); // Italic
    processed = processed.replace(/_(.*?)_/g, '<i>$1</i>'); // Italic
    processed = processed.replace(/`(.*?)`/g, '<code>$1</code>'); // Inline code
    processed = processed.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>'); // Links & Tagging
    // 4. Restore code blocks
    codeBlocks.forEach(function (block, i) {
        processed = processed.replace("__CODE_BLOCK_".concat(i, "__"), block);
    });
    return processed;
}
function getOpenRouterClient() {
    return new openai_1.default({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: config_1.OPENROUTER_API_KEY,
        timeout: 60000
    });
}
// HELPER: Safely edit message and ignore "message is not modified" errors
function safeEditMessage(bot_1, chatId_1, messageId_1, text_1) {
    return __awaiter(this, arguments, void 0, function (bot, chatId, messageId, text, options) {
        var e_1;
        var _a;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, bot.api.editMessageText(chatId, messageId, text, options)];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    e_1 = _b.sent();
                    if ((_a = e_1.description) === null || _a === void 0 ? void 0 : _a.includes("message is not modified")) {
                        // This is fine, just means content is identical
                        return [2 /*return*/];
                    }
                    db_1.DB.log("ERROR", "safeEditMessage failed: ".concat(e_1.message));
                    console.error("[safeEditMessage Error]: ".concat(e_1.message));
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function runAgent(bot, threadKey, chatId, statusMsgId) {
    return __awaiter(this, void 0, void 0, function () {
        var updatedPrompt, history, systemPrompt_1, otherMessages, thread, model, openai, _loop_1, i, state_2, globalError_1;
        var _this = this;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    db_1.DB.log("INFO", "Starting runAgent for thread ".concat(threadKey));
                    // Reload config and refresh system prompt dynamically (keeps it sorted at index 0 with created_at = 0)
                    return [4 /*yield*/, (0, config_1.loadAgentConfig)()];
                case 1:
                    // Reload config and refresh system prompt dynamically (keeps it sorted at index 0 with created_at = 0)
                    _f.sent();
                    return [4 /*yield*/, (0, config_1.getSystemPrompt)(threadKey)];
                case 2:
                    updatedPrompt = _f.sent();
                    db_1.DB.updateSystemPrompt(threadKey, updatedPrompt);
                    history = db_1.DB.getMessages(threadKey);
                    if (approximateTokenCount(history) > CONTEXT_TOKEN_LIMIT) {
                        systemPrompt_1 = ((_a = history[0]) === null || _a === void 0 ? void 0 : _a.role) === "system" ? history[0] : null;
                        otherMessages = history.filter(function (m) { return m.role !== "system" || (systemPrompt_1 && history.indexOf(m) !== 0); });
                        while (approximateTokenCount(__spreadArray([systemPrompt_1], otherMessages, true)) > CONTEXT_TOKEN_LIMIT && otherMessages.length > 0) {
                            otherMessages.shift();
                        }
                        history = systemPrompt_1 ? __spreadArray([systemPrompt_1], otherMessages, true) : otherMessages;
                        db_1.DB.clearMessages(threadKey);
                        history.forEach(function (msg) { return db_1.DB.addMessage(threadKey, { role: msg.role, content: msg.content, toolCallId: msg.tool_call_id }); });
                    }
                    thread = db_1.DB.getThread(threadKey);
                    model = (thread === null || thread === void 0 ? void 0 : thread.model_id) || state_1.State.currentAiModel;
                    openai = getOpenRouterClient();
                    _f.label = 3;
                case 3:
                    _f.trys.push([3, 9, , 11]);
                    _loop_1 = function (i) {
                        var completion, messagesForAPI, isRetryableError, error_1, errorMsg, isAborted, level, status_1, isFatal, fallbackModels, fallbackAttempted, _loop_2, _i, fallbackModels_1, fallbackModel, state_3, cachedTokens, msg, finalHtml, pendingShellTool, pendingShellCommand, toolResults, runningTools, executedToolsInLoop, _g, _h, tool, args, result, toolList_1, cmdId, kb, toolList;
                        return __generator(this, function (_j) {
                            switch (_j.label) {
                                case 0:
                                    completion = void 0;
                                    messagesForAPI = history.map(function (msg, index) {
                                        var isSystem = index === 0 && msg.role === "system";
                                        var isRecentUser = msg.role === "user" && (index === history.length - 1 || index === history.length - 3);
                                        if (isSystem || isRecentUser) {
                                            if (typeof msg.content === "string" && msg.content) {
                                                return __assign(__assign({}, msg), { content: [{ type: "text", text: msg.content, cache_control: { type: "ephemeral" } }] });
                                            }
                                        }
                                        return msg;
                                    });
                                    isRetryableError = function (error) {
                                        var _a;
                                        var errorMsg = error.message || "";
                                        var isAborted = error.name === "AbortError" || errorMsg.includes("aborted");
                                        if (isAborted)
                                            return true;
                                        var status = error.status || ((_a = error.response) === null || _a === void 0 ? void 0 : _a.status);
                                        if (status && [429, 500, 502, 503, 504].includes(status))
                                            return true;
                                        // Also check for specific error messages that indicate transient failures
                                        if (errorMsg.includes("rate limit") || errorMsg.includes("429") ||
                                            errorMsg.includes("502") || errorMsg.includes("503") || errorMsg.includes("504")) {
                                            return true;
                                        }
                                        return false;
                                    };
                                    _j.label = 1;
                                case 1:
                                    _j.trys.push([1, 3, , 13]);
                                    db_1.DB.log("INFO", "Sending request to model ".concat(model, " with ").concat(messagesForAPI.length, " messages"));
                                    return [4 /*yield*/, (0, resilience_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                            var stream, fullContent, toolCalls, lastEditTime, finalUsage, _a, stream_1, stream_1_1, chunk, delta, now, display, _i, _b, tc, idx, e_2_1, validToolCalls;
                                            var _c, e_2, _d, _e;
                                            var _f, _g, _h, _j, _k;
                                            return __generator(this, function (_l) {
                                                switch (_l.label) {
                                                    case 0: return [4 /*yield*/, openai.chat.completions.create({
                                                            model: model,
                                                            messages: messagesForAPI,
                                                            tools: tools_1.AGENT_TOOLS,
                                                            stream: true,
                                                            stream_options: { include_usage: true } // Request usage on final chunk
                                                        })];
                                                    case 1:
                                                        stream = _l.sent();
                                                        fullContent = "";
                                                        toolCalls = [];
                                                        lastEditTime = Date.now();
                                                        finalUsage = null;
                                                        _l.label = 2;
                                                    case 2:
                                                        _l.trys.push([2, 7, 8, 13]);
                                                        _a = true, stream_1 = __asyncValues(stream);
                                                        _l.label = 3;
                                                    case 3: return [4 /*yield*/, stream_1.next()];
                                                    case 4:
                                                        if (!(stream_1_1 = _l.sent(), _c = stream_1_1.done, !_c)) return [3 /*break*/, 6];
                                                        _e = stream_1_1.value;
                                                        _a = false;
                                                        chunk = _e;
                                                        if (chunk.usage)
                                                            finalUsage = chunk.usage;
                                                        delta = (_g = (_f = chunk.choices) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.delta;
                                                        if (!delta)
                                                            return [3 /*break*/, 5];
                                                        // Stream Text Chunk
                                                        if (delta.content) {
                                                            fullContent += delta.content;
                                                            now = Date.now();
                                                            // Batch updates to avoid Telegram 429 API rate limits (1.5 seconds)
                                                            if (now - lastEditTime > 1500) {
                                                                display = fullContent.length > 4000 ? fullContent.slice(-4000) : fullContent;
                                                                // No parse_mode while streaming to prevent half-baked tags from crashing API
                                                                safeEditMessage(bot, chatId, statusMsgId, "💭 " + display).catch(function () { });
                                                                lastEditTime = now;
                                                            }
                                                        }
                                                        // Stream Tool Calls Chunk
                                                        if (delta.tool_calls) {
                                                            for (_i = 0, _b = delta.tool_calls; _i < _b.length; _i++) {
                                                                tc = _b[_i];
                                                                idx = tc.index;
                                                                if (!toolCalls[idx]) {
                                                                    toolCalls[idx] = { id: tc.id, type: "function", function: { name: ((_h = tc.function) === null || _h === void 0 ? void 0 : _h.name) || "", arguments: "" } };
                                                                }
                                                                else {
                                                                    if ((_j = tc.function) === null || _j === void 0 ? void 0 : _j.name)
                                                                        toolCalls[idx].function.name += tc.function.name;
                                                                    if ((_k = tc.function) === null || _k === void 0 ? void 0 : _k.arguments)
                                                                        toolCalls[idx].function.arguments += tc.function.arguments;
                                                                }
                                                            }
                                                        }
                                                        _l.label = 5;
                                                    case 5:
                                                        _a = true;
                                                        return [3 /*break*/, 3];
                                                    case 6: return [3 /*break*/, 13];
                                                    case 7:
                                                        e_2_1 = _l.sent();
                                                        e_2 = { error: e_2_1 };
                                                        return [3 /*break*/, 13];
                                                    case 8:
                                                        _l.trys.push([8, , 11, 12]);
                                                        if (!(!_a && !_c && (_d = stream_1.return))) return [3 /*break*/, 10];
                                                        return [4 /*yield*/, _d.call(stream_1)];
                                                    case 9:
                                                        _l.sent();
                                                        _l.label = 10;
                                                    case 10: return [3 /*break*/, 12];
                                                    case 11:
                                                        if (e_2) throw e_2.error;
                                                        return [7 /*endfinally*/];
                                                    case 12: return [7 /*endfinally*/];
                                                    case 13:
                                                        validToolCalls = toolCalls.filter(Boolean);
                                                        return [2 /*return*/, {
                                                                usage: finalUsage,
                                                                choices: [{
                                                                        message: {
                                                                            role: "assistant",
                                                                            content: fullContent,
                                                                            tool_calls: validToolCalls.length > 0 ? validToolCalls : undefined
                                                                        }
                                                                    }]
                                                            }];
                                                }
                                            });
                                        }); }, "Model ".concat(model, " request"), isRetryableError)];
                                case 2:
                                    completion = _j.sent();
                                    return [3 /*break*/, 13];
                                case 3:
                                    error_1 = _j.sent();
                                    errorMsg = error_1.message || "Unknown Error";
                                    isAborted = error_1.name === "AbortError" || errorMsg.includes("aborted");
                                    level = isAborted ? "WARN" : "ERROR";
                                    db_1.DB.log(level, "OpenRouter API Error [".concat(error_1.name || 'N/A', "]: ").concat(errorMsg));
                                    console.error("[API ERROR] ".concat(error_1.name, ": ").concat(errorMsg));
                                    status_1 = error_1.status || ((_b = error_1.response) === null || _b === void 0 ? void 0 : _b.status);
                                    isFatal = status_1 && [400, 401, 404].includes(status_1);
                                    if (!isFatal) return [3 /*break*/, 5];
                                    // For fatal errors, we don't retry or fallback
                                    return [4 /*yield*/, safeEditMessage(bot, chatId, statusMsgId, "\u274C <b>AI Model API Error (fatal):</b>\n<pre><code>".concat(error_1.message, "</code></pre>"), { parse_mode: "HTML" })];
                                case 4:
                                    // For fatal errors, we don't retry or fallback
                                    _j.sent();
                                    return [2 /*return*/, { value: void 0 }];
                                case 5: return [4 /*yield*/, Promise.resolve().then(function () { return require("./resilience"); })];
                                case 6:
                                    fallbackModels = (_j.sent()).FALLBACK_MODELS;
                                    fallbackAttempted = false;
                                    _loop_2 = function (fallbackModel) {
                                        var fallbackError_1, fbErrorMsg;
                                        return __generator(this, function (_k) {
                                            switch (_k.label) {
                                                case 0:
                                                    if (fallbackModel === model)
                                                        return [2 /*return*/, "continue"]; // Skip the current model
                                                    db_1.DB.log("WARN", "Switching to fallback model: ".concat(fallbackModel));
                                                    return [4 /*yield*/, safeEditMessage(bot, chatId, statusMsgId, "\uD83D\uDD04 <i>Model error. Retrying with fallback...</i>", { parse_mode: "HTML" })];
                                                case 1:
                                                    _k.sent();
                                                    _k.label = 2;
                                                case 2:
                                                    _k.trys.push([2, 4, , 5]);
                                                    return [4 /*yield*/, (0, resilience_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                                            var result;
                                                            return __generator(this, function (_a) {
                                                                switch (_a.label) {
                                                                    case 0: return [4 /*yield*/, openai.chat.completions.create({
                                                                            model: fallbackModel,
                                                                            messages: messagesForAPI,
                                                                            tools: tools_1.AGENT_TOOLS,
                                                                        })];
                                                                    case 1:
                                                                        result = _a.sent();
                                                                        if (result && result.error)
                                                                            throw new Error(result.error.message || JSON.stringify(result.error));
                                                                        if (!result || !result.choices || result.choices.length === 0) {
                                                                            throw new Error("Model returned an empty or invalid response.");
                                                                        }
                                                                        return [2 /*return*/, result];
                                                                }
                                                            });
                                                        }); }, "Fallback model ".concat(fallbackModel, " request"), isRetryableError)];
                                                case 3:
                                                    // Use the same retry logic with the fallback model
                                                    completion = _k.sent();
                                                    // Success with fallback model
                                                    db_1.DB.log("INFO", "Successfully completed request with fallback model ".concat(fallbackModel));
                                                    fallbackAttempted = true;
                                                    return [2 /*return*/, "break"];
                                                case 4:
                                                    fallbackError_1 = _k.sent();
                                                    fbErrorMsg = fallbackError_1.message || "Unknown Error";
                                                    db_1.DB.log("ERROR", "Fallback model ".concat(fallbackModel, " failed: ").concat(fbErrorMsg));
                                                    console.error("[Fallback Error] ".concat(fallbackModel, ": ").concat(fbErrorMsg));
                                                    return [3 /*break*/, 5];
                                                case 5: return [2 /*return*/];
                                            }
                                        });
                                    };
                                    _i = 0, fallbackModels_1 = fallbackModels;
                                    _j.label = 7;
                                case 7:
                                    if (!(_i < fallbackModels_1.length)) return [3 /*break*/, 10];
                                    fallbackModel = fallbackModels_1[_i];
                                    return [5 /*yield**/, _loop_2(fallbackModel)];
                                case 8:
                                    state_3 = _j.sent();
                                    if (state_3 === "break")
                                        return [3 /*break*/, 10];
                                    _j.label = 9;
                                case 9:
                                    _i++;
                                    return [3 /*break*/, 7];
                                case 10:
                                    if (!!fallbackAttempted) return [3 /*break*/, 12];
                                    return [4 /*yield*/, safeEditMessage(bot, chatId, statusMsgId, "\u274C <b>All models failed:</b>\n<pre><code>".concat(error_1.message, "</code></pre>"), { parse_mode: "HTML" })];
                                case 11:
                                    _j.sent();
                                    return [2 /*return*/, { value: void 0 }];
                                case 12: return [3 /*break*/, 13];
                                case 13:
                                    if (completion.usage) {
                                        cachedTokens = ((_c = completion.usage.prompt_tokens_details) === null || _c === void 0 ? void 0 : _c.cached_tokens) || 0;
                                        db_1.DB.upsertStats(threadKey, {
                                            requests: 1,
                                            promptTokens: completion.usage.prompt_tokens || 0,
                                            completionTokens: completion.usage.completion_tokens || 0, // BUG FIXED HERE
                                            cachedTokens: cachedTokens,
                                            lastContextSize: completion.usage.prompt_tokens || 0
                                        });
                                    }
                                    msg = completion.choices[0].message;
                                    db_1.DB.addMessage(threadKey, { role: msg.role, content: msg.content || "", toolCallId: (_e = (_d = msg.tool_calls) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.id });
                                    history.push(msg);
                                    if (!(!msg.tool_calls || msg.tool_calls.length === 0)) return [3 /*break*/, 15];
                                    finalHtml = mdToHTML(msg.content || "Done.");
                                    return [4 /*yield*/, bot.api.sendMessage(chatId, finalHtml, { parse_mode: "HTML" })];
                                case 14:
                                    _j.sent();
                                    return [2 /*return*/, { value: void 0 }];
                                case 15:
                                    pendingShellTool = null;
                                    pendingShellCommand = "";
                                    toolResults = [];
                                    runningTools = [];
                                    db_1.DB.log("INFO", "Processing ".concat(msg.tool_calls.length, " tool calls"));
                                    executedToolsInLoop = [];
                                    _g = 0, _h = msg.tool_calls;
                                    _j.label = 16;
                                case 16:
                                    if (!(_g < _h.length)) return [3 /*break*/, 21];
                                    tool = _h[_g];
                                    runningTools.push(tool.function.name);
                                    args = void 0;
                                    try {
                                        args = JSON.parse(tool.function.arguments || "{}");
                                    }
                                    catch (e) {
                                        db_1.DB.log("WARN", "Tool JSON Error: ".concat(e.message));
                                        toolResults.push({ tool_call_id: tool.id, content: "System Error: Invalid JSON in arguments: ".concat(e.message) });
                                        return [3 /*break*/, 20];
                                    }
                                    if (!(tool.function.name === "execute_shell_command")) return [3 /*break*/, 17];
                                    pendingShellTool = tool;
                                    pendingShellCommand = args.command || "echo 'No command provided'";
                                    toolResults.push({ tool_call_id: tool.id, content: "Pending user approval." });
                                    db_1.DB.log("INFO", "Tool ".concat(tool.function.name, " is pending user approval"));
                                    return [3 /*break*/, 21]; // break out of the loop because we need approval
                                case 17:
                                    db_1.DB.log("INFO", "Executing tool: ".concat(tool.function.name));
                                    return [4 /*yield*/, (0, tools_1.executeToolLocally)(tool.function.name, args, { threadKey: threadKey, chatId: chatId })];
                                case 18:
                                    result = _j.sent();
                                    toolResults.push({ tool_call_id: tool.id, content: result });
                                    executedToolsInLoop.push(tool.function.name);
                                    db_1.DB.log("INFO", "Tool ".concat(tool.function.name, " completed with result: ").concat((result || "").substring(0, 100))); // truncate to 100 chars
                                    toolList_1 = executedToolsInLoop.join(", ");
                                    return [4 /*yield*/, bot.api.sendMessage(chatId, "\uD83D\uDD27 <b>Tool Executed:</b> <code>".concat(tool.function.name, "</code>\n\n\uD83D\uDCC4 <b>Result:</b>\n<pre><code>").concat((result || "").slice(0, 2000), "</code></pre>"), { parse_mode: "HTML" })];
                                case 19:
                                    _j.sent();
                                    _j.label = 20;
                                case 20:
                                    _g++;
                                    return [3 /*break*/, 16];
                                case 21:
                                    if (!(!pendingShellTool && executedToolsInLoop.length > 0)) return [3 /*break*/, 23];
                                    return [4 /*yield*/, safeEditMessage(bot, chatId, statusMsgId, "\uD83D\uDCAD <i>Finished executing tools. Thinking...</i>", { parse_mode: "HTML" })];
                                case 22:
                                    _j.sent();
                                    _j.label = 23;
                                case 23:
                                    toolResults.forEach(function (res) {
                                        if (!pendingShellTool || res.tool_call_id !== pendingShellTool.id) {
                                            db_1.DB.addMessage(threadKey, { role: "tool", content: res.content, toolCallId: res.tool_call_id });
                                            history.push({ role: "tool", tool_call_id: res.tool_call_id, content: res.content });
                                        }
                                    });
                                    if (!pendingShellTool) return [3 /*break*/, 25];
                                    cmdId = node_crypto_1.default.randomUUID().slice(0, 8);
                                    db_1.DB.setPendingAction(cmdId, { threadKey: threadKey, chatId: chatId, statusMsgId: statusMsgId, toolCallId: pendingShellTool.id, command: pendingShellCommand });
                                    kb = new grammy_1.InlineKeyboard().text("✅ Approve", "approve:".concat(cmdId)).text("❌ Reject", "reject:".concat(cmdId));
                                    return [4 /*yield*/, bot.api.sendMessage(chatId, "\uD83D\uDEE0\uFE0F <b>Requires Approval:</b>\n<pre><code>".concat(pendingShellCommand, "</code></pre>"), { parse_mode: "HTML", reply_markup: kb })];
                                case 24:
                                    _j.sent();
                                    return [2 /*return*/, { value: void 0 }];
                                case 25:
                                    toolList = runningTools.join(", ");
                                    return [4 /*yield*/, bot.api.sendMessage(chatId, "\uD83D\uDD04 <i>Executed: <code>".concat(toolList, "</code>. Continuing thought...</i>"), { parse_mode: "HTML" })];
                                case 26:
                                    _j.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _f.label = 4;
                case 4:
                    if (!(i < 5)) return [3 /*break*/, 7];
                    return [5 /*yield**/, _loop_1(i)];
                case 5:
                    state_2 = _f.sent();
                    if (typeof state_2 === "object")
                        return [2 /*return*/, state_2.value];
                    _f.label = 6;
                case 6:
                    i++;
                    return [3 /*break*/, 4];
                case 7: 
                // If loop finishes without return
                return [4 /*yield*/, bot.api.sendMessage(chatId, "\u26A0\uFE0F <i>Agent hit maximum thought loops (5).</i>", { parse_mode: "HTML" })];
                case 8:
                    // If loop finishes without return
                    _f.sent();
                    return [3 /*break*/, 11];
                case 9:
                    globalError_1 = _f.sent();
                    db_1.DB.log("CRITICAL", "runAgent Global Error: ".concat(globalError_1.message));
                    return [4 /*yield*/, bot.api.sendMessage(chatId, "\u274C <b>Internal Agent Error:</b>\n<pre><code>".concat(globalError_1.message, "</code></pre>"), { parse_mode: "HTML" })];
                case 10:
                    _f.sent();
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/];
            }
        });
    });
}
