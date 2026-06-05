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
exports.agentConfig = exports.DEFAULT_MODEL = exports.MY_TELEGRAM_ID = exports.OPENROUTER_API_KEY = exports.TELEGRAM_TOKEN = exports.CONFIG_FILE = exports.SECRETS_FILE = exports.BRAIN_DIR = void 0;
exports.ensureBrainDir = ensureBrainDir;
exports.initSecrets = initSecrets;
exports.getTimezoneOffset = getTimezoneOffset;
exports.getLocalISOString = getLocalISOString;
exports.loadAgentConfig = loadAgentConfig;
exports.getSystemPrompt = getSystemPrompt;
var promises_1 = require("node:fs/promises");
var node_fs_1 = require("node:fs");
var path = require("node:path");
exports.BRAIN_DIR = path.join(process.cwd(), "brain");
exports.SECRETS_FILE = path.join(exports.BRAIN_DIR, "secrets.json");
exports.CONFIG_FILE = path.join(exports.BRAIN_DIR, "agent_config.md");
exports.TELEGRAM_TOKEN = "";
exports.OPENROUTER_API_KEY = "";
exports.MY_TELEGRAM_ID = 0;
exports.DEFAULT_MODEL = "openrouter/free";
exports.agentConfig = {
    persona: "General AI Assistant",
    preferredLanguage: "English",
    defaultScriptingLanguage: "Node.js (TypeScript/JavaScript)",
    primaryTools: ["execute_shell_command", "write_file", "read_file", "list_brain_files", "search_openrouter_models"],
    safetyProtocols: "Always ask for user approval before running execute_shell_command. Avoid destructive commands.",
    maxTokenWarning: 150000,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    systemPromptTemplate: "",
};
function ensureBrainDir() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, promises_1.default.mkdir(exports.BRAIN_DIR, { recursive: true })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function initSecrets() {
    return __awaiter(this, void 0, void 0, function () {
        var data, envTelegramId, isPlaceholder, isMissing, idInput;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBrainDir()];
                case 1:
                    _a.sent();
                    // 1. Load existing if available
                    if ((0, node_fs_1.existsSync)(exports.SECRETS_FILE)) {
                        data = JSON.parse((0, node_fs_1.readFileSync)(exports.SECRETS_FILE, "utf-8"));
                        exports.TELEGRAM_TOKEN = data.TELEGRAM_TOKEN || "";
                        exports.OPENROUTER_API_KEY = data.OPENROUTER_API_KEY || "";
                        exports.MY_TELEGRAM_ID = data.MY_TELEGRAM_ID || 0;
                        exports.DEFAULT_MODEL = data.DEFAULT_MODEL || exports.DEFAULT_MODEL;
                    }
                    // 2. Check process.env for overrides/fallbacks
                    exports.TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || exports.TELEGRAM_TOKEN;
                    exports.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || exports.OPENROUTER_API_KEY;
                    envTelegramId = parseInt(process.env.MY_TELEGRAM_ID || "0", 10);
                    if (envTelegramId)
                        exports.MY_TELEGRAM_ID = envTelegramId;
                    exports.DEFAULT_MODEL = process.env.DEFAULT_MODEL || exports.DEFAULT_MODEL;
                    isPlaceholder = function (val) { return !val || val.includes("YOUR_"); };
                    isMissing = isPlaceholder(exports.TELEGRAM_TOKEN) || isPlaceholder(exports.OPENROUTER_API_KEY) || !exports.MY_TELEGRAM_ID || exports.MY_TELEGRAM_ID === 123456789;
                    // 4. Attempt prompt ONLY if interactive
                    if (isMissing && process.stdout.isTTY) {
                        console.log("🚀 Setup required! Missing or placeholder configuration detected.");
                        exports.TELEGRAM_TOKEN = prompt("Enter Telegram Bot Token:") || exports.TELEGRAM_TOKEN;
                        exports.OPENROUTER_API_KEY = prompt("Enter OpenRouter API Key:") || exports.OPENROUTER_API_KEY;
                        idInput = prompt("Enter your Telegram User ID (for auth):");
                        if (idInput)
                            exports.MY_TELEGRAM_ID = parseInt(idInput, 10);
                        exports.DEFAULT_MODEL = prompt("Enter Default Model (or press enter for default):") || exports.DEFAULT_MODEL;
                    }
                    else if (isMissing) {
                        console.log("⚠️ Non-interactive environment detected (e.g., Docker). Auto-prompts disabled.");
                    }
                    if (!(isPlaceholder(exports.TELEGRAM_TOKEN) || isPlaceholder(exports.OPENROUTER_API_KEY) || !exports.MY_TELEGRAM_ID || exports.MY_TELEGRAM_ID === 123456789)) return [3 /*break*/, 3];
                    console.error("\n\u274C Configuration is missing or still using placeholder values!");
                    console.error("\uD83D\uDEE0\uFE0F  Please edit the file at:");
                    console.error("\uD83D\uDC49 ".concat(exports.SECRETS_FILE, "\n"));
                    return [4 /*yield*/, promises_1.default.writeFile(exports.SECRETS_FILE, JSON.stringify({
                            TELEGRAM_TOKEN: exports.TELEGRAM_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN_HERE",
                            OPENROUTER_API_KEY: exports.OPENROUTER_API_KEY || "YOUR_OPENROUTER_API_KEY_HERE",
                            MY_TELEGRAM_ID: exports.MY_TELEGRAM_ID || 123456789,
                            DEFAULT_MODEL: exports.DEFAULT_MODEL
                        }, null, 2))];
                case 2:
                    _a.sent();
                    console.error("🛑 Exiting. Update the secrets.json file and restart.\n");
                    process.exit(1);
                    _a.label = 3;
                case 3: 
                // Save the merged/valid config
                return [4 /*yield*/, promises_1.default.writeFile(exports.SECRETS_FILE, JSON.stringify({
                        TELEGRAM_TOKEN: exports.TELEGRAM_TOKEN,
                        OPENROUTER_API_KEY: exports.OPENROUTER_API_KEY,
                        MY_TELEGRAM_ID: exports.MY_TELEGRAM_ID,
                        DEFAULT_MODEL: exports.DEFAULT_MODEL
                    }, null, 2))];
                case 4:
                    // Save the merged/valid config
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getTimezoneOffset(timeZone, date) {
    var _a;
    if (date === void 0) { date = new Date(); }
    try {
        var parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timeZone,
            timeZoneName: "longOffset"
        }).formatToParts(date);
        var tzName = ((_a = parts.find(function (p) { return p.type === "timeZoneName"; })) === null || _a === void 0 ? void 0 : _a.value) || "";
        if (tzName === "GMT")
            return "+00:00";
        return tzName.replace("GMT", "");
    }
    catch (_b) {
        return "+00:00";
    }
}
function getLocalISOString(timeZone, date) {
    var _a, _b, _c, _d, _e, _f;
    if (date === void 0) { date = new Date(); }
    try {
        var formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
        var parts = formatter.formatToParts(date);
        var year = (_a = parts.find(function (p) { return p.type === "year"; })) === null || _a === void 0 ? void 0 : _a.value;
        var month = (_b = parts.find(function (p) { return p.type === "month"; })) === null || _b === void 0 ? void 0 : _b.value;
        var day = (_c = parts.find(function (p) { return p.type === "day"; })) === null || _c === void 0 ? void 0 : _c.value;
        var hour = ((_d = parts.find(function (p) { return p.type === "hour"; })) === null || _d === void 0 ? void 0 : _d.value) || "00";
        var minute = (_e = parts.find(function (p) { return p.type === "minute"; })) === null || _e === void 0 ? void 0 : _e.value;
        var second = (_f = parts.find(function (p) { return p.type === "second"; })) === null || _f === void 0 ? void 0 : _f.value;
        if (hour === "24")
            hour = "00";
        var offset = getTimezoneOffset(timeZone, date);
        return "".concat(year, "-").concat(month, "-").concat(day, "T").concat(hour, ":").concat(minute, ":").concat(second).concat(offset);
    }
    catch (_g) {
        return date.toISOString();
    }
}
function loadAgentConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var content, e_1, warningMatch, hasChanges, safetyIndex, lineEnd, promptParts, defaultPromptSection, migratedParts;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    content = "";
                    _m.label = 1;
                case 1:
                    _m.trys.push([1, 3, , 5]);
                    return [4 /*yield*/, promises_1.default.readFile(exports.CONFIG_FILE, "utf-8")];
                case 2:
                    content = _m.sent();
                    return [3 /*break*/, 5];
                case 3:
                    e_1 = _m.sent();
                    // If config file doesn't exist, create it with all defaults
                    content = "# Agent Configuration\nPersona: ".concat(exports.agentConfig.persona, "\nPreferred Language: ").concat(exports.agentConfig.preferredLanguage, "\nDefault Scripting Language: ").concat(exports.agentConfig.defaultScriptingLanguage, "\nMax Context Warning: ").concat(exports.agentConfig.maxTokenWarning, "\nSafety Protocols: ").concat(exports.agentConfig.safetyProtocols, "\nTimezone: ").concat(exports.agentConfig.timezone, "\n\n## System Prompt Instructions\nYou are a {{persona}}.\nYour workspace is '{{workspace}}'. You primarily use {{language}}.\nYour safety protocols: {{safety}}.\nTimezone: {{timezone}}\n(Note: You can check the current time for each message in the time context appended to the user's message.)\n\nFORMATTING:\n- Use standard markdown (e.g. **bold**, *italic*, `code`).\n- To tag or ping the owner, use: [{username}](tg://user?id={{owner_id}})\n\nIf you build a tool:\n1. Use 'write_file' to save it to './brain'.\n2. Use 'execute_shell_command' to run it.\n\nTo run commands on the host system when necessary:\n- Use `chroot /host` to execute binaries on the host.\n- Use `nsenter -t 1 -m -u -n -i` to run commands in the host's namespaces (PID, mount, UTS, network, IPC).");
                    return [4 /*yield*/, promises_1.default.writeFile(exports.CONFIG_FILE, content.trim(), "utf-8")];
                case 4:
                    _m.sent();
                    return [3 /*break*/, 5];
                case 5:
                    // Parse keys
                    exports.agentConfig.persona = ((_b = (_a = content.match(/Persona: (.*)/)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.trim()) || exports.agentConfig.persona;
                    exports.agentConfig.preferredLanguage = ((_d = (_c = content.match(/Preferred Language: (.*)/)) === null || _c === void 0 ? void 0 : _c[1]) === null || _d === void 0 ? void 0 : _d.trim()) || exports.agentConfig.preferredLanguage;
                    exports.agentConfig.defaultScriptingLanguage = ((_f = (_e = content.match(/Default Scripting Language: (.*)/)) === null || _e === void 0 ? void 0 : _e[1]) === null || _f === void 0 ? void 0 : _f.trim()) || exports.agentConfig.defaultScriptingLanguage;
                    warningMatch = (_g = content.match(/Max Context Warning: (\d+)/)) === null || _g === void 0 ? void 0 : _g[1];
                    if (warningMatch)
                        exports.agentConfig.maxTokenWarning = parseInt(warningMatch, 10);
                    exports.agentConfig.timezone = ((_j = (_h = content.match(/Timezone: (.*)/)) === null || _h === void 0 ? void 0 : _h[1]) === null || _j === void 0 ? void 0 : _j.trim()) || exports.agentConfig.timezone;
                    exports.agentConfig.safetyProtocols = ((_l = (_k = content.match(/Safety Protocols: (.*)/)) === null || _k === void 0 ? void 0 : _k[1]) === null || _l === void 0 ? void 0 : _l.trim()) || exports.agentConfig.safetyProtocols;
                    hasChanges = false;
                    // 1. Ensure Timezone key exists in the file keys section
                    if (!content.includes("Timezone:")) {
                        safetyIndex = content.indexOf("Safety Protocols:");
                        if (safetyIndex !== -1) {
                            lineEnd = content.indexOf("\n", safetyIndex);
                            content = content.slice(0, lineEnd) + "\nTimezone: ".concat(exports.agentConfig.timezone) + content.slice(lineEnd);
                        }
                        else {
                            content = "Timezone: ".concat(exports.agentConfig.timezone, "\n") + content;
                        }
                        hasChanges = true;
                    }
                    promptParts = content.split(/## System Prompt Instructions\r?\n/);
                    if (promptParts[1]) {
                        exports.agentConfig.systemPromptTemplate = promptParts[1].trim();
                    }
                    else {
                        defaultPromptSection = "\n\n## System Prompt Instructions\nYou are a {{persona}}.\nYour workspace is '{{workspace}}'. You primarily use {{language}}.\nYour safety protocols: {{safety}}.\nTimezone: {{timezone}}\n(Note: You can check the current time for each message in the time context appended to the user's message.)\n\nFORMATTING:\n- Use standard markdown (e.g. **bold**, *italic*, \\`code\\`).\n- To tag or ping the owner, use: [{username}](tg://user?id={{owner_id}})\n\nIf you build a tool:\n1. Use 'write_file' to save it to './brain'.\n2. Use 'execute_shell_command' to run it.\n\nTo run commands on the host system when necessary:\n- Use \\`chroot /host\\` to execute binaries on the host.\n- Use \\`nsenter -t 1 -m -u -n -i\\` to run commands in the host's namespaces (PID, mount, UTS, network, IPC).";
                        content = content.trim() + defaultPromptSection;
                        migratedParts = defaultPromptSection.split(/## System Prompt Instructions\r?\n/);
                        exports.agentConfig.systemPromptTemplate = (migratedParts[1] || "").trim();
                        hasChanges = true;
                    }
                    if (!hasChanges) return [3 /*break*/, 7];
                    return [4 /*yield*/, promises_1.default.writeFile(exports.CONFIG_FILE, content, "utf-8")];
                case 6:
                    _m.sent();
                    _m.label = 7;
                case 7: return [2 /*return*/];
            }
        });
    });
}
function getSystemPrompt(threadKey) {
    return __awaiter(this, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    template = exports.agentConfig.systemPromptTemplate;
                    if (!!template) return [3 /*break*/, 2];
                    return [4 /*yield*/, loadAgentConfig()];
                case 1:
                    _a.sent();
                    template = exports.agentConfig.systemPromptTemplate;
                    _a.label = 2;
                case 2: 
                // Substitute static placeholders (safe for caching!)
                return [2 /*return*/, template
                        .replace(/{{persona}}/g, exports.agentConfig.persona)
                        .replace(/{{workspace}}/g, exports.BRAIN_DIR)
                        .replace(/{{language}}/g, exports.agentConfig.defaultScriptingLanguage)
                        .replace(/{{safety}}/g, exports.agentConfig.safetyProtocols)
                        .replace(/{{owner_id}}/g, exports.MY_TELEGRAM_ID.toString())
                        .replace(/{{timezone}}/g, exports.agentConfig.timezone)];
            }
        });
    });
}
