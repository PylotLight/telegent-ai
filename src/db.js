"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DB = void 0;
var bun_sqlite_1 = require("bun:sqlite");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
// Ensure brain directory exists before DB init
var BRAIN_DIR = node_path_1.default.join(process.cwd(), "brain");
(0, node_fs_1.mkdirSync)(BRAIN_DIR, { recursive: true });
// Move DB into brain for easy Docker volume mounting
var dbPath = node_path_1.default.join(BRAIN_DIR, "state.db");
var db = new bun_sqlite_1.Database(dbPath);
// Initialize Schema
db.run("\n  CREATE TABLE IF NOT EXISTS threads (\n    thread_key INTEGER PRIMARY KEY,\n    model_id TEXT,\n    persona TEXT,\n    last_active INTEGER\n  )\n");
db.run("\n  CREATE TABLE IF NOT EXISTS messages (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    thread_key INTEGER,\n    role TEXT,\n    content TEXT,\n    tool_call_id TEXT,\n    created_at INTEGER,\n    FOREIGN KEY(thread_key) REFERENCES threads(thread_key)\n  )\n");
db.run("\n  CREATE TABLE IF NOT EXISTS thread_stats (\n    thread_key INTEGER PRIMARY KEY,\n    requests INTEGER DEFAULT 0,\n    prompt_tokens INTEGER DEFAULT 0,\n    completion_tokens INTEGER DEFAULT 0,\n    cached_tokens INTEGER DEFAULT 0,\n    last_context_size INTEGER DEFAULT 0,\n    FOREIGN KEY(thread_key) REFERENCES threads(thread_key)\n  )\n");
db.run("\n  CREATE TABLE IF NOT EXISTS pending_actions (\n    action_id TEXT PRIMARY KEY,\n    thread_key INTEGER,\n    chat_id INTEGER,\n    status_msg_id INTEGER,\n    tool_call_id TEXT,\n    command TEXT,\n    FOREIGN KEY(thread_key) REFERENCES threads(thread_key)\n  )\n");
db.run("\n  CREATE TABLE IF NOT EXISTS lights (\n    id TEXT PRIMARY KEY,\n    label TEXT,\n    address TEXT,\n    last_seen INTEGER\n  )\n");
// NEW: Logging Table
db.run("\n  CREATE TABLE IF NOT EXISTS logs (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    level TEXT,\n    message TEXT,\n    timestamp INTEGER\n  )\n");
db.run("\n  CREATE TABLE IF NOT EXISTS scheduled_tasks (\n    id TEXT PRIMARY KEY,\n    thread_key INTEGER,\n    chat_id INTEGER,\n    type TEXT,\n    time_expression TEXT,\n    action_prompt TEXT\n  )\n");
exports.DB = {
    // Thread Management
    getThread: function (threadKey) {
        return db.query("SELECT * FROM threads WHERE thread_key = ?").get(threadKey);
    },
    upsertThread: function (threadKey, data) {
        var modelId = data.modelId, persona = data.persona, lastActive = data.lastActive;
        db.run("\n      INSERT INTO threads (thread_key, model_id, persona, last_active) \n      VALUES (?, ?, ?, ?) \n      ON CONFLICT(thread_key) DO UPDATE SET \n        model_id = COALESCE(?, model_id), \n        persona = COALESCE(?, persona), \n        last_active = COALESCE(?, last_active)\n    ", [threadKey, modelId !== null && modelId !== void 0 ? modelId : null, persona !== null && persona !== void 0 ? persona : null, lastActive !== null && lastActive !== void 0 ? lastActive : null, modelId !== null && modelId !== void 0 ? modelId : null, persona !== null && persona !== void 0 ? persona : null, lastActive !== null && lastActive !== void 0 ? lastActive : null]);
    },
    // Message Management
    getMessages: function (threadKey) {
        return db.query("SELECT role, content, tool_call_id FROM messages WHERE thread_key = ? ORDER BY created_at ASC").all(threadKey);
    },
    addMessage: function (threadKey, msg) {
        var _a;
        db.run("INSERT INTO messages (thread_key, role, content, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?)", [threadKey, msg.role, msg.content, (_a = msg.toolCallId) !== null && _a !== void 0 ? _a : null, Date.now()]);
    },
    clearMessages: function (threadKey) {
        db.run("DELETE FROM messages WHERE thread_key = ?", [threadKey]);
    },
    updateSystemPrompt: function (threadKey, content) {
        db.run("DELETE FROM messages WHERE thread_key = ? AND role = 'system'", [threadKey]);
        db.run("INSERT INTO messages (thread_key, role, content, created_at) VALUES (?, 'system', ?, 0)", [threadKey, content]);
    },
    // Stats Management
    getStats: function (threadKey) {
        return db.query("SELECT * FROM thread_stats WHERE thread_key = ?").get(threadKey);
    },
    upsertStats: function (threadKey, stats) {
        var requests = stats.requests, promptTokens = stats.promptTokens, completionTokens = stats.completionTokens, cachedTokens = stats.cachedTokens, lastContextSize = stats.lastContextSize;
        db.run("\n      INSERT INTO thread_stats (thread_key, requests, prompt_tokens, completion_tokens, cached_tokens, last_context_size) \n      VALUES (?, ?, ?, ?, ?, ?) \n      ON CONFLICT(thread_key) DO UPDATE SET \n        requests = requests + COALESCE(?, 0), \n        prompt_tokens = prompt_tokens + COALESCE(?, 0), \n        completion_tokens = completion_tokens + COALESCE(?, 0), \n        cached_tokens = cached_tokens + COALESCE(?, 0), \n        last_context_size = COALESCE(?, last_context_size)\n    ", [threadKey, requests !== null && requests !== void 0 ? requests : 0, promptTokens !== null && promptTokens !== void 0 ? promptTokens : 0, completionTokens !== null && completionTokens !== void 0 ? completionTokens : 0, cachedTokens !== null && cachedTokens !== void 0 ? cachedTokens : 0, lastContextSize !== null && lastContextSize !== void 0 ? lastContextSize : 0, requests !== null && requests !== void 0 ? requests : null, promptTokens !== null && promptTokens !== void 0 ? promptTokens : null, completionTokens !== null && completionTokens !== void 0 ? completionTokens : null, cachedTokens !== null && cachedTokens !== void 0 ? cachedTokens : null, lastContextSize !== null && lastContextSize !== void 0 ? lastContextSize : null]);
    },
    // NEW: Log Method
    log: function (level, message) {
        db.run("INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)", [level, message, Date.now()]);
    },
    // --- Scheduled Tasks ---
    addScheduledTask: function (task) {
        db.run("INSERT INTO scheduled_tasks (id, thread_key, chat_id, type, time_expression, action_prompt) VALUES (?, ?, ?, ?, ?, ?)", [task.id, task.threadKey, task.chatId, task.type, task.timeExpr, task.actionPrompt]);
    },
    getScheduledTasks: function () {
        return db.query("SELECT * FROM scheduled_tasks").all();
    },
    deleteScheduledTask: function (id) {
        db.run("DELETE FROM scheduled_tasks WHERE id = ?", [id]);
    },
    // Pending Actions
    setPendingAction: function (actionId, action) {
        db.run("INSERT INTO pending_actions (action_id, thread_key, chat_id, status_msg_id, tool_call_id, command) VALUES (?, ?, ?, ?, ?, ?)", [actionId, action.threadKey, action.chatId, action.statusMsgId, action.toolCallId, action.command]);
    },
    getPendingAction: function (actionId) {
        return db.query("SELECT * FROM pending_actions WHERE action_id = ?").get(actionId);
    },
    deletePendingAction: function (actionId) {
        db.run("DELETE FROM pending_actions WHERE action_id = ?", [actionId]);
    },
    // Lights Management
    getLights: function () {
        return db.query("SELECT * FROM lights").all();
    },
    upsertLight: function (id, label, address) {
        db.run("\n      INSERT INTO lights (id, label, address, last_seen) \n      VALUES (?, ?, ?, ?) \n      ON CONFLICT(id) DO UPDATE SET label = ?, address = ?, last_seen = ?\n    ", [id, label, address, Date.now(), label, address, Date.now()]);
    },
};
