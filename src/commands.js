"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCommands = setupCommands;
exports.processUserMessage = processUserMessage;
var grammy_1 = require("grammy");
var state_1 = require("./state");
var config_1 = require("./config");
var agent_1 = require("./agent");
var db_1 = require("./db");
var node_child_process_1 = require("node:child_process");
var node_util_1 = require("node:util");
var path = require("node:path");
var promises_1 = require("node:fs/promises");
var execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
function setupCommands(bot) {
    var _this = this;
    bot.command("start", function (ctx) { return ctx.reply("👋 Agent online. Use /ai to force trigger. /model to switch AI. /status for info. /clear to reset."); });
    bot.command("clear", function (ctx) {
        var _a;
        var threadKey = ((_a = ctx.message) === null || _a === void 0 ? void 0 : _a.message_thread_id) || ctx.chat.id;
        db_1.DB.clearMessages(threadKey);
        ctx.reply("🧹 Memory wiped. Context reset.", { message_thread_id: threadKey });
    });
    bot.command("status", function (ctx) { return __awaiter(_this, void 0, void 0, function () {
        var threadKey, history, stats, thread, total, warning, model, gitInfo, branch, commit, log, e_1, msg;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    threadKey = ((_a = ctx.message) === null || _a === void 0 ? void 0 : _a.message_thread_id) || ctx.chat.id;
                    history = db_1.DB.getMessages(threadKey) || [];
                    stats = db_1.DB.getStats(threadKey) || { requests: 0, prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, last_context_size: 0 };
                    thread = db_1.DB.getThread(threadKey);
                    total = stats.prompt_tokens + stats.completion_tokens;
                    warning = stats.last_context_size > config_1.agentConfig.maxTokenWarning
                        ? "\n\n\u26A0\uFE0F <b>Warning: Context size is high!</b>" : "";
                    model = (thread === null || thread === void 0 ? void 0 : thread.model_id) || state_1.State.currentAiModel;
                    gitInfo = "";
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, execAsync("git branch --show-current")];
                case 2:
                    branch = (_b.sent()).stdout;
                    return [4 /*yield*/, execAsync("git rev-parse --short HEAD")];
                case 3:
                    commit = (_b.sent()).stdout;
                    return [4 /*yield*/, execAsync("git log -1 --pretty=format:'%s'")];
                case 4:
                    log = (_b.sent()).stdout;
                    gitInfo = "\n\uD83C\uDF3F <b>Branch:</b> <code>".concat(branch.trim(), "</code>\n\uD83D\uDCCC <b>Commit:</b> <code>").concat(commit.trim(), "</code>\n\uD83D\uDCDD <b>Log:</b> <i>").concat(log.trim(), "</i>");
                    return [3 /*break*/, 6];
                case 5:
                    e_1 = _b.sent();
                    gitInfo = "\n\u26A0\uFE0F <b>Git Status:</b> ".concat(e_1.message);
                    return [3 /*break*/, 6];
                case 6:
                    msg = "\uD83D\uDCCA <b>LLM Context Status</b>\n<b>State:</b> \uD83D\uDFE2 Listening\n<b>Memory:</b> ".concat(history.length, " msgs\n<b>Context:</b> ~").concat(stats.last_context_size.toLocaleString(), " tokens\n<b>Model:</b> <code>").concat(model, "</code>\n").concat(gitInfo, "\n\n\uD83E\uDE99 <b>Token Usage:</b>\n<b>Prompt:</b> ").concat(stats.prompt_tokens.toLocaleString(), "\n<b>Output:</b> ").concat(stats.completion_tokens.toLocaleString(), "\n<b>Total:</b> ").concat(total.toLocaleString(), "\n\u26A1 <b>Cached (Saved!):</b> ").concat(stats.cached_tokens.toLocaleString()).concat(warning);
                    return [2 /*return*/, ctx.reply(msg, { parse_mode: "HTML", message_thread_id: threadKey })];
            }
        });
    }); });
    bot.command("branch", function (ctx) { return __awaiter(_this, void 0, void 0, function () {
        var threadKey, match, statusMsg_1, branchesOut, branches, branchList, e_2, statusMsg, _a, bootFile, bootData, fileContent, _b, e_3;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    threadKey = ((_c = ctx.message) === null || _c === void 0 ? void 0 : _c.message_thread_id) || ctx.chat.id;
                    match = ctx.match.trim();
                    if (!match) {
                        return [2 /*return*/, ctx.reply("\uD83E\uDD16 <b>Branch Management</b>\n\nSet branch: <code>/branch &lt;branch-name&gt;</code>\nList branches: <code>/branch list</code>", { parse_mode: "HTML", message_thread_id: threadKey })];
                    }
                    if (!(match.toLowerCase() === "list")) return [3 /*break*/, 6];
                    return [4 /*yield*/, ctx.reply("🔍 <i>Fetching branch list from remote...</i>", { parse_mode: "HTML", message_thread_id: threadKey })];
                case 1:
                    statusMsg_1 = _d.sent();
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, execAsync("git fetch --all")];
                case 3:
                    _d.sent();
                    return [4 /*yield*/, execAsync("git branch -a")];
                case 4:
                    branchesOut = (_d.sent()).stdout;
                    branches = branchesOut.split("\n")
                        .map(function (b) { return b.replace(/^\*/, "").trim(); })
                        .filter(function (b) { return b.length > 0 && !b.includes("HEAD"); });
                    branchList = branches.map(function (b) { return "\u2022 <code>".concat(b, "</code>"); }).join("\n");
                    return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg_1.message_id, "\uD83C\uDF3F <b>Available Git Branches:</b>\n\n".concat(branchList), { parse_mode: "HTML" })];
                case 5:
                    e_2 = _d.sent();
                    return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg_1.message_id, "\u26A0\uFE0F Error: ".concat(e_2.message), { parse_mode: "HTML" })];
                case 6: return [4 /*yield*/, ctx.reply("\uD83D\uDD0D <i>Verifying branch \"".concat(match, "\"...</i>"), { parse_mode: "HTML", message_thread_id: threadKey })];
                case 7:
                    statusMsg = _d.sent();
                    _d.label = 8;
                case 8:
                    _d.trys.push([8, 20, , 21]);
                    return [4 /*yield*/, execAsync("git fetch --all")];
                case 9:
                    _d.sent();
                    _d.label = 10;
                case 10:
                    _d.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, execAsync("git show-ref --verify refs/heads/".concat(match, " || git show-ref --verify refs/remotes/origin/").concat(match))];
                case 11:
                    _d.sent();
                    return [3 /*break*/, 13];
                case 12:
                    _a = _d.sent();
                    return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\u274C Branch <code>".concat(match, "</code> does not exist on remote or local repo."), { parse_mode: "HTML" })];
                case 13:
                    bootFile = path.join(process.cwd(), "brain", "boot.json");
                    bootData = {};
                    _d.label = 14;
                case 14:
                    _d.trys.push([14, 16, , 17]);
                    return [4 /*yield*/, promises_1.default.readFile(bootFile, "utf-8")];
                case 15:
                    fileContent = _d.sent();
                    bootData = JSON.parse(fileContent);
                    return [3 /*break*/, 17];
                case 16:
                    _b = _d.sent();
                    return [3 /*break*/, 17];
                case 17:
                    bootData.target_branch = match;
                    return [4 /*yield*/, promises_1.default.writeFile(bootFile, JSON.stringify(bootData, null, 2), "utf-8")];
                case 18:
                    _d.sent();
                    return [4 /*yield*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\uD83D\uDD04 <b>Switching target branch to:</b> <code>".concat(match, "</code>\n\n\u231B <i>Checking out, updating dependencies, typechecking, and restarting. Stand by...</i>"), { parse_mode: "HTML" })];
                case 19:
                    _d.sent();
                    setTimeout(function () {
                        process.exit(42);
                    }, 1000);
                    return [3 /*break*/, 21];
                case 20:
                    e_3 = _d.sent();
                    return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\u26A0\uFE0F Failed to switch branch: ".concat(e_3.message), { parse_mode: "HTML" })];
                case 21: return [2 /*return*/];
            }
        });
    }); });
    bot.command("update", function (ctx) { return __awaiter(_this, void 0, void 0, function () {
        var threadKey, statusMsg, branch, currentBranch, local, remote, localHash, remoteHash, log, kb, e_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    threadKey = ((_a = ctx.message) === null || _a === void 0 ? void 0 : _a.message_thread_id) || ctx.chat.id;
                    return [4 /*yield*/, ctx.reply("🔍 <i>Checking remote for updates on current branch...</i>", { parse_mode: "HTML", message_thread_id: threadKey })];
                case 1:
                    statusMsg = _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 8, , 9]);
                    return [4 /*yield*/, execAsync("git fetch --all")];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, execAsync("git branch --show-current")];
                case 4:
                    branch = (_b.sent()).stdout;
                    currentBranch = branch.trim();
                    return [4 /*yield*/, execAsync("git rev-parse HEAD")];
                case 5:
                    local = (_b.sent()).stdout;
                    return [4 /*yield*/, execAsync("git rev-parse origin/".concat(currentBranch))];
                case 6:
                    remote = (_b.sent()).stdout;
                    localHash = local.trim();
                    remoteHash = remote.trim();
                    if (localHash === remoteHash) {
                        return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\u2705 <b>Up to date!</b>\n\nBot is running the latest commit on branch <code>".concat(currentBranch, "</code>:\n<code>").concat(localHash.substring(0, 7), "</code>"), { parse_mode: "HTML" })];
                    }
                    return [4 /*yield*/, execAsync("git log HEAD..origin/".concat(currentBranch, " --oneline -n 5"))];
                case 7:
                    log = (_b.sent()).stdout;
                    kb = new grammy_1.InlineKeyboard()
                        .text("✅ Pull & Hot-Swap", "upd:pull")
                        .text("❌ Cancel", "upd:cancel");
                    return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\uD83D\uDD04 <b>Updates available on branch <code>".concat(currentBranch, "</code>!</b>\n\n\uD83D\uDCCC <b>Current Commit:</b> <code>").concat(localHash.substring(0, 7), "</code>\n\uD83D\uDCE1 <b>Remote Commit:</b> <code>").concat(remoteHash.substring(0, 7), "</code>\n\n\uD83D\uDCC4 <b>Changelog:</b>\n<pre><code>").concat(log.trim() || "No detailed log.", "</code></pre>"), { parse_mode: "HTML", reply_markup: kb })];
                case 8:
                    e_4 = _b.sent();
                    return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\u26A0\uFE0F Failed to check updates: ".concat(e_4.message), { parse_mode: "HTML" })];
                case 9: return [2 /*return*/];
            }
        });
    }); });
    bot.command("model", function (ctx) { return __awaiter(_this, void 0, void 0, function () {
        var threadKey, match, thread, currentModel, query_1, statusMsg, response, data, models, kb_1, e_5, systemPrompt;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    threadKey = ((_a = ctx.message) === null || _a === void 0 ? void 0 : _a.message_thread_id) || ctx.chat.id;
                    match = ctx.match.trim();
                    thread = db_1.DB.getThread(threadKey);
                    currentModel = (thread === null || thread === void 0 ? void 0 : thread.model_id) || state_1.State.currentAiModel;
                    if (!match) {
                        return [2 /*return*/, ctx.reply("\uD83E\uDD16 <b>Current:</b> <code>".concat(currentModel, "</code>\n\n<b>Usage:</b>\nSet: <code>/model &lt;id&gt;</code>\nSearch: <code>/model search free</code>"), { parse_mode: "HTML", message_thread_id: threadKey })];
                    }
                    if (!match.toLowerCase().startsWith("search ")) return [3 /*break*/, 6];
                    query_1 = match.substring(7).trim().toLowerCase();
                    return [4 /*yield*/, ctx.reply("\uD83D\uDD0D <i>Searching OpenRouter for \"".concat(query_1, "\"...</i>"), { parse_mode: "HTML", message_thread_id: threadKey })];
                case 1:
                    statusMsg = _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, fetch("https://openrouter.ai/api/v1/models")];
                case 3:
                    response = _b.sent();
                    return [4 /*yield*/, response.json()];
                case 4:
                    data = (_b.sent());
                    models = data.data;
                    if (query_1 === "free") {
                        models = models.filter(function (m) { var _a, _b; return parseFloat(((_a = m.pricing) === null || _a === void 0 ? void 0 : _a.prompt) || "1") === 0 && parseFloat(((_b = m.pricing) === null || _b === void 0 ? void 0 : _b.completion) || "1") === 0; });
                    }
                    else {
                        models = models.filter(function (m) { return m.id.toLowerCase().includes(query_1) || m.name.toLowerCase().includes(query_1); });
                    }
                    models = models.filter(function (m) { return m.id.length <= 60; }).slice(0, 10);
                    if (models.length === 0) {
                        return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\u274C No models found matching \"".concat(query_1, "\"."), { parse_mode: "HTML" })];
                    }
                    kb_1 = new grammy_1.InlineKeyboard();
                    models.forEach(function (m) {
                        kb_1.text("\uD83E\uDD16 ".concat(m.name), "sm:".concat(m.id)).row();
                    });
                    return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\uD83D\uDD0D <b>Results for \"".concat(query_1, "\"</b>:\n\n<i>Click a model below to switch to it instantly:</i>"), { parse_mode: "HTML", reply_markup: kb_1 })];
                case 5:
                    e_5 = _b.sent();
                    return [2 /*return*/, ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "\u26A0\uFE0F API Error: ".concat(e_5.message), { parse_mode: "HTML" })];
                case 6:
                    db_1.DB.upsertThread(threadKey, { modelId: match });
                    return [4 /*yield*/, (0, config_1.getSystemPrompt)(threadKey)];
                case 7:
                    systemPrompt = _b.sent();
                    db_1.DB.updateSystemPrompt(threadKey, systemPrompt);
                    ctx.reply("\u2705 Model set to:\n<code>".concat(match, "</code>"), { parse_mode: "HTML", message_thread_id: threadKey });
                    return [2 /*return*/];
            }
        });
    }); });
    bot.command("ai", function (ctx) { return __awaiter(_this, void 0, void 0, function () {
        var threadKey;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    threadKey = ((_a = ctx.message) === null || _a === void 0 ? void 0 : _a.message_thread_id) || ctx.chat.id;
                    db_1.DB.upsertThread(threadKey, { lastActive: Date.now() });
                    if (!ctx.match) {
                        return [2 /*return*/, ctx.reply("🤖 <b>Usage:</b> <code>/ai &lt;your message&gt;</code>\n\n<i>Note: You can also just reply directly to any of my messages, or DM me to chat without using commands!</i>", {
                                parse_mode: "HTML",
                                message_thread_id: threadKey
                            })];
                    }
                    return [4 /*yield*/, processUserMessage(bot, ctx.match, threadKey, ctx.chat.id)];
                case 1:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    }); });
}
function processUserMessage(bot, prompt, threadKey, chatId) {
    return __awaiter(this, void 0, void 0, function () {
        var history, systemPrompt, localTimeStr, timeAwarePrompt, statusMsg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    history = db_1.DB.getMessages(threadKey);
                    if (!(history.length === 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, config_1.getSystemPrompt)(threadKey)];
                case 1:
                    systemPrompt = _a.sent();
                    db_1.DB.updateSystemPrompt(threadKey, systemPrompt);
                    db_1.DB.upsertStats(threadKey, { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, lastContextSize: 0 });
                    _a.label = 2;
                case 2:
                    localTimeStr = (0, config_1.getLocalISOString)(config_1.agentConfig.timezone);
                    timeAwarePrompt = "".concat(prompt, "\n\n[Current Time: ").concat(localTimeStr, "]");
                    db_1.DB.addMessage(threadKey, { role: "user", content: timeAwarePrompt });
                    return [4 /*yield*/, bot.api.sendMessage(chatId, "\uD83E\uDD14 <i>Thinking...</i>", { parse_mode: "HTML", message_thread_id: threadKey })];
                case 3:
                    statusMsg = _a.sent();
                    return [4 /*yield*/, (0, agent_1.runAgent)(bot, threadKey, chatId, statusMsg.message_id)];
                case 4:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
