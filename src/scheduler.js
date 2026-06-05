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
exports.initScheduler = initScheduler;
exports.startJob = startJob;
exports.scheduleNewTask = scheduleNewTask;
exports.removeScheduledTask = removeScheduledTask;
var croner_1 = require("croner");
var db_1 = require("./db");
var commands_1 = require("./commands");
var config_1 = require("./config");
var jobs = new Map();
var activeBot = null;
function initScheduler(bot) {
    activeBot = bot;
    var tasks = db_1.DB.getScheduledTasks();
    for (var _i = 0, tasks_1 = tasks; _i < tasks_1.length; _i++) {
        var task = tasks_1[_i];
        startJob(task);
    }
}
function startJob(task) {
    var _this = this;
    var _a;
    if (!activeBot)
        return;
    if (jobs.has(task.id)) {
        (_a = jobs.get(task.id)) === null || _a === void 0 ? void 0 : _a.stop();
    }
    var isOneTime = task.type === "one_time";
    var triggerTime;
    if (isOneTime) {
        triggerTime = new Date(task.time_expression);
        // If the timer is already in the past, clean it up and ignore
        if (triggerTime.getTime() < Date.now()) {
            db_1.DB.deleteScheduledTask(task.id);
            return;
        }
    }
    else {
        // It's a cron expression
        triggerTime = task.time_expression;
    }
    try {
        var options = {};
        if (typeof triggerTime === "string") {
            options.timezone = config_1.agentConfig.timezone;
        }
        var job = new croner_1.Cron(triggerTime, options, function () { return __awaiter(_this, void 0, void 0, function () {
            var triggerPrompt;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!activeBot)
                            return [2 /*return*/];
                        db_1.DB.upsertThread(task.thread_key, { lastActive: Date.now() });
                        triggerPrompt = "[SYSTEM: SCHEDULED TASK TRIGGERED]\nTask Description: ".concat(task.action_prompt);
                        // Notify the user subtly that a task triggered
                        return [4 /*yield*/, activeBot.api.sendMessage(task.chat_id, "\u23F0 <i>Running scheduled task...</i>", { parse_mode: "HTML", message_thread_id: task.thread_key }).catch(function () { })];
                    case 1:
                        // Notify the user subtly that a task triggered
                        _a.sent();
                        // Trigger the agent loop using processUserMessage
                        return [4 /*yield*/, (0, commands_1.processUserMessage)(activeBot, triggerPrompt, task.thread_key, task.chat_id)];
                    case 2:
                        // Trigger the agent loop using processUserMessage
                        _a.sent();
                        if (isOneTime) {
                            db_1.DB.deleteScheduledTask(task.id);
                            jobs.delete(task.id);
                        }
                        return [2 /*return*/];
                }
            });
        }); });
        jobs.set(task.id, job);
    }
    catch (e) {
        console.error("Error starting scheduled job ".concat(task.id, ":"), e.message);
    }
}
function scheduleNewTask(task) {
    db_1.DB.addScheduledTask(task);
    startJob({
        id: task.id,
        thread_key: task.threadKey,
        chat_id: task.chatId,
        type: task.type,
        time_expression: task.timeExpr,
        action_prompt: task.actionPrompt
    });
}
function removeScheduledTask(id) {
    var _a;
    if (jobs.has(id)) {
        (_a = jobs.get(id)) === null || _a === void 0 ? void 0 : _a.stop();
        jobs.delete(id);
    }
    db_1.DB.deleteScheduledTask(id);
}
