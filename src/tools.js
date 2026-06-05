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
exports.AGENT_TOOLS = void 0;
exports.getSafeBrainPath = getSafeBrainPath;
exports.executeToolLocally = executeToolLocally;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var config_1 = require("./config");
var lifx_1 = require("./lifx");
var node_crypto_1 = require("node:crypto");
exports.AGENT_TOOLS = [
    { type: "function", function: { name: "execute_shell_command", description: "Executes a shell command. Requires approval.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
    { type: "function", function: { name: "write_file", description: "Saves a file into ./brain", parameters: { type: "object", properties: { filename: { type: "string" }, content: { type: "string" } }, required: ["filename", "content"] } } },
    { type: "function", function: { name: "read_file", description: "Reads a file from ./brain", parameters: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] } } },
    { type: "function", function: { name: "list_brain_files", description: "Lists files in ./brain" } },
    { type: "function", function: { name: "search_openrouter_models", description: "Searches the OpenRouter API for LLM models. Pass query='free' to find free models, or search by name like 'llama'.", parameters: { type: "object", properties: { query: { type: "string" } } } } },
    {
        type: "function",
        function: {
            name: "discover_lights",
            description: "Scans the local network for LIFX lights and updates the registry. Returns a list of known lights.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "set_light_state",
            description: "Sets the state of a LIFX light (power, color, brightness, kelvin).",
            parameters: {
                type: "object",
                properties: {
                    light_id: { type: "string", description: "The ID of the light" },
                    power: { type: "boolean", description: "true for on, false for off" },
                    color: { type: "string", description: "Hex code (e.g., #FF0000)" },
                    brightness: { type: "number", description: "0-100" },
                    kelvin: { type: "number", description: "2500-9000" }
                },
                required: ["light_id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "schedule_task",
            description: "Creates a background task. Type is 'one_time' or 'cron'. time_expression must be a precise ISO Date string for one_time, or a cron string. action_prompt is what you should do when it triggers.",
            parameters: {
                type: "object",
                properties: {
                    type: { type: "string", enum: ["one_time", "cron"] },
                    time_expression: { type: "string", description: "ISO Date string (e.g. 2026-05-18T01:30:00+10:00) OR Cron expression" },
                    action_prompt: { type: "string", description: "Instructions for your future self (e.g. 'Ping user about the laundry', 'Check weather')" }
                },
                required: ["type", "time_expression", "action_prompt"]
            }
        }
    },
    { type: "function", function: { name: "list_scheduled_tasks", description: "Lists all background tasks mapped to the current chat.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "delete_scheduled_task", description: "Deletes a scheduled background task by ID.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } }
];
function getSafeBrainPath(filename) {
    var safePath = node_path_1.default.normalize(node_path_1.default.join(config_1.BRAIN_DIR, filename));
    if (!safePath.startsWith(config_1.BRAIN_DIR))
        throw new Error("Path traversal blocked.");
    return safePath;
}
function executeToolLocally(name, args, context) {
    return __awaiter(this, void 0, void 0, function () {
        var files, response, data, models, query_1, top_1, res, lights, result, scheduleNewTask, id, DB, tasks, removeScheduledTask, e_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 20, , 21]);
                    if (!(name === "write_file")) return [3 /*break*/, 2];
                    return [4 /*yield*/, promises_1.default.writeFile(getSafeBrainPath(args.filename), args.content, "utf8")];
                case 1:
                    _b.sent();
                    return [2 /*return*/, "Saved ".concat(args.filename)];
                case 2:
                    if (!(name === "read_file")) return [3 /*break*/, 4];
                    return [4 /*yield*/, promises_1.default.readFile(getSafeBrainPath(args.filename), "utf8")];
                case 3: return [2 /*return*/, _b.sent()];
                case 4:
                    if (!(name === "list_brain_files")) return [3 /*break*/, 6];
                    return [4 /*yield*/, promises_1.default.readdir(config_1.BRAIN_DIR)];
                case 5:
                    files = _b.sent();
                    return [2 /*return*/, files.join("\n") || "Directory empty."];
                case 6:
                    if (!(name === "search_openrouter_models")) return [3 /*break*/, 9];
                    return [4 /*yield*/, fetch("https://openrouter.ai/api/v1/models")];
                case 7:
                    response = _b.sent();
                    return [4 /*yield*/, response.json()];
                case 8:
                    data = (_b.sent());
                    models = data.data;
                    query_1 = ((_a = args.query) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "";
                    if (query_1 === "free") {
                        models = models.filter(function (m) { var _a, _b; return parseFloat(((_a = m.pricing) === null || _a === void 0 ? void 0 : _a.prompt) || "1") === 0 && parseFloat(((_b = m.pricing) === null || _b === void 0 ? void 0 : _b.completion) || "1") === 0; });
                    }
                    else if (query_1) {
                        models = models.filter(function (m) { return m.id.toLowerCase().includes(query_1) || m.name.toLowerCase().includes(query_1); });
                    }
                    top_1 = models.slice(0, 20);
                    res = top_1.map(function (m) { return "- ID: ".concat(m.id, " | Name: ").concat(m.name); }).join("\n");
                    return [2 /*return*/, models.length > 20 ? res + "\n...and ".concat(models.length - 20, " more.") : (res || "No models found.")];
                case 9:
                    if (!(name === "discover_lights")) return [3 /*break*/, 11];
                    return [4 /*yield*/, lifx_1.lifxManager.discoverAndSync()];
                case 10:
                    lights = _b.sent();
                    return [2 /*return*/, JSON.stringify(lights, null, 2)];
                case 11:
                    if (!(name === "set_light_state")) return [3 /*break*/, 13];
                    return [4 /*yield*/, lifx_1.lifxManager.setLightState(args.light_id, {
                            power: args.power,
                            color: args.color,
                            brightness: args.brightness,
                            kelvin: args.kelvin
                        })];
                case 12:
                    result = _b.sent();
                    return [2 /*return*/, "Successfully updated light ".concat(result.id)];
                case 13:
                    if (!(name === "schedule_task")) return [3 /*break*/, 15];
                    if (!context)
                        return [2 /*return*/, "System Error: Missing chat context for scheduling."];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./scheduler"); })];
                case 14:
                    scheduleNewTask = (_b.sent()).scheduleNewTask;
                    id = node_crypto_1.default.randomUUID().slice(0, 8);
                    scheduleNewTask({
                        id: id,
                        threadKey: context.threadKey,
                        chatId: context.chatId,
                        type: args.type,
                        timeExpr: args.time_expression,
                        actionPrompt: args.action_prompt
                    });
                    return [2 /*return*/, "Task scheduled successfully. ID: ".concat(id)];
                case 15:
                    if (!(name === "list_scheduled_tasks")) return [3 /*break*/, 17];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                case 16:
                    DB = (_b.sent()).DB;
                    tasks = DB.getScheduledTasks().filter(function (t) { return t.chat_id === (context === null || context === void 0 ? void 0 : context.chatId); });
                    if (tasks.length === 0)
                        return [2 /*return*/, "No scheduled tasks active."];
                    return [2 /*return*/, tasks.map(function (t) { return "ID: ".concat(t.id, " | Type: ").concat(t.type, " | Time: ").concat(t.time_expression, " | Action: ").concat(t.action_prompt); }).join("\n")];
                case 17:
                    if (!(name === "delete_scheduled_task")) return [3 /*break*/, 19];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./scheduler"); })];
                case 18:
                    removeScheduledTask = (_b.sent()).removeScheduledTask;
                    removeScheduledTask(args.id);
                    return [2 /*return*/, "Task ".concat(args.id, " removed.")];
                case 19: return [3 /*break*/, 21];
                case 20:
                    e_1 = _b.sent();
                    return [2 /*return*/, "Error: ".concat(e_1.message)];
                case 21: return [2 /*return*/, "Unknown tool"];
            }
        });
    });
}
