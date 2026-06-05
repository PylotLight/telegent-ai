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
var grammy_1 = require("grammy");
var node_child_process_1 = require("node:child_process");
var node_util_1 = require("node:util");
var config_1 = require("./config");
var commands_1 = require("./commands");
var agent_1 = require("./agent");
var db_1 = require("./db");
var scheduler_1 = require("./scheduler");
var execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
function start() {
    return __awaiter(this, void 0, void 0, function () {
        var bot;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // 1. Run CLI/Secret Initialization
                return [4 /*yield*/, (0, config_1.ensureBrainDir)()];
                case 1:
                    // 1. Run CLI/Secret Initialization
                    _a.sent();
                    return [4 /*yield*/, (0, config_1.initSecrets)()];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, (0, config_1.loadAgentConfig)()];
                case 3:
                    _a.sent();
                    bot = new grammy_1.Bot(config_1.TELEGRAM_TOKEN);
                    (0, scheduler_1.initScheduler)(bot);
                    // Auth Middleware
                    bot.use(function (ctx, next) { return __awaiter(_this, void 0, void 0, function () {
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (((_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id) !== config_1.MY_TELEGRAM_ID)
                                        return [2 /*return*/];
                                    return [4 /*yield*/, next()];
                                case 1:
                                    _b.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    (0, commands_1.setupCommands)(bot);
                    // Listen for conversational text
                    bot.on("message:text", function (ctx) { return __awaiter(_this, void 0, void 0, function () {
                        var isPrivate, isReplyToBot, threadKey;
                        var _a, _b, _c;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    if (ctx.message.text.startsWith("/"))
                                        return [2 /*return*/];
                                    isPrivate = ctx.chat.type === "private";
                                    isReplyToBot = ((_b = (_a = ctx.message.reply_to_message) === null || _a === void 0 ? void 0 : _a.from) === null || _b === void 0 ? void 0 : _b.id) === ctx.me.id;
                                    // If we are in a group/channel and the bot wasn't explicitly replied to, 
                                    // ignore it so it doesn't interrupt other apps/updates.
                                    if (!isPrivate && !isReplyToBot) {
                                        return [2 /*return*/];
                                    }
                                    threadKey = ((_c = ctx.message) === null || _c === void 0 ? void 0 : _c.message_thread_id) || ctx.chat.id;
                                    db_1.DB.upsertThread(threadKey, { lastActive: Date.now() });
                                    return [4 /*yield*/, (0, commands_1.processUserMessage)(bot, ctx.message.text, threadKey, ctx.chat.id)];
                                case 1:
                                    _d.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    // Handle Inline Button Clicks
                    bot.on("callback_query:data", function (ctx) { return __awaiter(_this, void 0, void 0, function () {
                        var data, modelId, threadKey, systemPrompt, _a, action, cmdId, pending, history, updateMessage, _b, stdout, stderr, error_1;
                        var _this = this;
                        var _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    data = ctx.callbackQuery.data;
                                    if (!(data === "upd:pull")) return [3 /*break*/, 4];
                                    return [4 /*yield*/, ctx.answerCallbackQuery({ text: "Initiating hot-swap upgrade..." })];
                                case 1:
                                    _e.sent();
                                    if (!(ctx.chat && ctx.callbackQuery.message)) return [3 /*break*/, 3];
                                    return [4 /*yield*/, bot.api.editMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, "⏳ <b>Pulling updates, typechecking, and hot-swapping. Stand by...</b>", { parse_mode: "HTML" })];
                                case 2:
                                    _e.sent();
                                    _e.label = 3;
                                case 3:
                                    setTimeout(function () {
                                        process.exit(42);
                                    }, 1000);
                                    return [2 /*return*/];
                                case 4:
                                    if (!(data === "upd:cancel")) return [3 /*break*/, 8];
                                    return [4 /*yield*/, ctx.answerCallbackQuery({ text: "Upgrade cancelled." })];
                                case 5:
                                    _e.sent();
                                    if (!(ctx.chat && ctx.callbackQuery.message)) return [3 /*break*/, 7];
                                    return [4 /*yield*/, bot.api.editMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, "❌ <b>Upgrade cancelled.</b>", { parse_mode: "HTML" })];
                                case 6:
                                    _e.sent();
                                    _e.label = 7;
                                case 7: return [2 /*return*/];
                                case 8:
                                    if (!data.startsWith("sm:")) return [3 /*break*/, 13];
                                    modelId = data.substring(3);
                                    threadKey = ((_c = ctx.callbackQuery.message) === null || _c === void 0 ? void 0 : _c.message_thread_id) || ((_d = ctx.chat) === null || _d === void 0 ? void 0 : _d.id);
                                    if (!threadKey)
                                        return [2 /*return*/, ctx.answerCallbackQuery("Error: Session lost.")];
                                    db_1.DB.upsertThread(threadKey, { modelId: modelId });
                                    return [4 /*yield*/, (0, config_1.getSystemPrompt)(threadKey)];
                                case 9:
                                    systemPrompt = _e.sent();
                                    db_1.DB.updateSystemPrompt(threadKey, systemPrompt);
                                    return [4 /*yield*/, ctx.answerCallbackQuery({ text: "Model changed to ".concat(modelId) })];
                                case 10:
                                    _e.sent();
                                    if (!(ctx.chat && ctx.callbackQuery.message)) return [3 /*break*/, 12];
                                    return [4 /*yield*/, bot.api.editMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, "\u2705 <b>Model set to:</b>\n<code>".concat(modelId, "</code>"), { parse_mode: "HTML" })];
                                case 11:
                                    _e.sent();
                                    _e.label = 12;
                                case 12: return [2 /*return*/];
                                case 13:
                                    _a = data.split(":"), action = _a[0], cmdId = _a[1];
                                    if (!action || !cmdId)
                                        return [2 /*return*/];
                                    pending = db_1.DB.getPendingAction(cmdId);
                                    if (!pending)
                                        return [2 /*return*/, ctx.answerCallbackQuery("Expired")];
                                    history = db_1.DB.getMessages(pending.thread_key);
                                    if (!history || history.length === 0)
                                        return [2 /*return*/, ctx.answerCallbackQuery("Memory lost")];
                                    updateMessage = function (text) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                        return [2 /*return*/, bot.api.editMessageText(pending.chat_id, pending.status_msg_id, text, { parse_mode: "HTML" })];
                                    }); }); };
                                    if (!(action === "reject")) return [3 /*break*/, 16];
                                    db_1.DB.addMessage(pending.thread_key, { role: "tool", content: "User rejected execution.", toolCallId: pending.tool_call_id });
                                    db_1.DB.deletePendingAction(cmdId);
                                    return [4 /*yield*/, updateMessage("\u274C <b>Command Rejected:</b>\n<pre><code>".concat(pending.command, "</code></pre>"))];
                                case 14:
                                    _e.sent();
                                    return [4 /*yield*/, (0, agent_1.runAgent)(bot, pending.thread_key, pending.chat_id, pending.status_msg_id)];
                                case 15:
                                    _e.sent();
                                    return [2 /*return*/];
                                case 16:
                                    if (!(action === "approve")) return [3 /*break*/, 25];
                                    return [4 /*yield*/, updateMessage("\u23F3 <b>Executing...</b>\n<pre><code>".concat(pending.command, "</code></pre>"))];
                                case 17:
                                    _e.sent();
                                    _e.label = 18;
                                case 18:
                                    _e.trys.push([18, 21, , 23]);
                                    return [4 /*yield*/, execAsync(pending.command)];
                                case 19:
                                    _b = _e.sent(), stdout = _b.stdout, stderr = _b.stderr;
                                    db_1.DB.addMessage(pending.thread_key, { role: "tool", content: (stdout || stderr || "Done").slice(0, 4000), toolCallId: pending.tool_call_id });
                                    return [4 /*yield*/, updateMessage("\u2705 <b>Executed:</b>\n<pre><code>".concat(pending.command, "</code></pre>\n\n\uD83D\uDCC4 <b>Result:</b>\n<pre><code>").concat((stdout || stderr || "Done").slice(0, 3000), "</code></pre>"))];
                                case 20:
                                    _e.sent();
                                    return [3 /*break*/, 23];
                                case 21:
                                    error_1 = _e.sent();
                                    db_1.DB.addMessage(pending.thread_key, { role: "tool", content: "Error: ".concat(error_1.message), toolCallId: pending.tool_call_id });
                                    return [4 /*yield*/, updateMessage("\u26A0\uFE0F <b>Failed:</b>\n<pre><code>".concat(pending.command, "</code></pre>\n\n<b>Error:</b>\n<pre><code>").concat(error_1.message, "</code></pre>"))];
                                case 22:
                                    _e.sent();
                                    return [3 /*break*/, 23];
                                case 23:
                                    db_1.DB.deletePendingAction(cmdId);
                                    return [4 /*yield*/, (0, agent_1.runAgent)(bot, pending.thread_key, pending.chat_id, pending.status_msg_id)];
                                case 24:
                                    _e.sent();
                                    _e.label = 25;
                                case 25: return [2 /*return*/];
                            }
                        });
                    }); });
                    bot.catch(function (err) {
                        var ctx = err.ctx;
                        console.error("[Telegram Error] while handling update ".concat(ctx.update.update_id, ":"));
                        var e = err.error;
                        if (e instanceof grammy_1.GrammyError) {
                            console.error("Error in request:", e.description);
                        }
                        else if (e instanceof grammy_1.HttpError) {
                            console.error("Could not contact Telegram:", e);
                        }
                        else {
                            console.error("Unknown error:", e);
                        }
                    });
                    // Replaced bottom startup lines:
                    bot.start({
                        onStart: function (botInfo) {
                            console.log("\u2705 Authentication Successful!");
                            console.log("\uD83E\uDD16 Agent online! Logged in as @".concat(botInfo.username));
                            console.log("\uD83E\uDDE0 Default Model: ".concat(config_1.DEFAULT_MODEL));
                        }
                    }).catch(function (err) {
                        if (err.description === "Not Found" || err.error_code === 404) {
                            console.error("\n❌ CRITICAL ERROR: Telegram returned '404 Not Found'.");
                            console.error("👉 This means your TELEGRAM_TOKEN is invalid or incorrect.");
                            console.error("👉 Please double-check your token in brain/secrets.json\n");
                        }
                        else {
                            console.error("❌ CRITICAL ERROR: Failed to start bot:", err);
                        }
                        process.exit(1);
                    });
                    return [2 /*return*/];
            }
        });
    });
}
start();
