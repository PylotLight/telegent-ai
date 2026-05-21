import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Ensure brain directory exists before DB init
const BRAIN_DIR = path.join(process.cwd(), "brain");
mkdirSync(BRAIN_DIR, { recursive: true });

// Move DB into brain for easy Docker volume mounting
const dbPath = path.join(BRAIN_DIR, "state.db");
const db = new Database(dbPath);

// Initialize Schema
db.run(`
  CREATE TABLE IF NOT EXISTS threads (
    thread_key INTEGER PRIMARY KEY,
    model_id TEXT,
    persona TEXT,
    last_active INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_key INTEGER,
    role TEXT,
    content TEXT,
    tool_call_id TEXT,
    created_at INTEGER,
    FOREIGN KEY(thread_key) REFERENCES threads(thread_key)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS thread_stats (
    thread_key INTEGER PRIMARY KEY,
    requests INTEGER DEFAULT 0,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    cached_tokens INTEGER DEFAULT 0,
    last_context_size INTEGER DEFAULT 0,
    FOREIGN KEY(thread_key) REFERENCES threads(thread_key)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS pending_actions (
    action_id TEXT PRIMARY KEY,
    thread_key INTEGER,
    chat_id INTEGER,
    status_msg_id INTEGER,
    tool_call_id TEXT,
    command TEXT,
    FOREIGN KEY(thread_key) REFERENCES threads(thread_key)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS lights (
    id TEXT PRIMARY KEY,
    label TEXT,
    address TEXT,
    last_seen INTEGER
  )
`);

// NEW: Logging Table
db.run(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT,
    message TEXT,
    timestamp INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY,
    thread_key INTEGER,
    chat_id INTEGER,
    type TEXT,
    time_expression TEXT,
    action_prompt TEXT
  )
`);

export const DB = {
  // Thread Management
  getThread: (threadKey: number) => {
    return db.query("SELECT * FROM threads WHERE thread_key = ?").get(threadKey) as any;
  },
  upsertThread: (threadKey: number, data: { modelId?: string, persona?: string, lastActive?: number }) => {
    const { modelId, persona, lastActive } = data;
    db.run(`
      INSERT INTO threads (thread_key, model_id, persona, last_active) 
      VALUES (?, ?, ?, ?) 
      ON CONFLICT(thread_key) DO UPDATE SET 
        model_id = COALESCE(?, model_id), 
        persona = COALESCE(?, persona), 
        last_active = COALESCE(?, last_active)
    `, [threadKey, modelId, persona, lastActive, modelId, persona, lastActive]);
  },

  // Message Management
  getMessages: (threadKey: number) => {
    return db.query("SELECT role, content, tool_call_id FROM messages WHERE thread_key = ? ORDER BY created_at ASC").all(threadKey) as any[];
  },
  addMessage: (threadKey: number, msg: { role: string, content: string, toolCallId?: string }) => {
    db.run("INSERT INTO messages (thread_key, role, content, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?)", 
      [threadKey, msg.role, msg.content, msg.toolCallId, Date.now()]);
  },
  clearMessages: (threadKey: number) => {
    db.run("DELETE FROM messages WHERE thread_key = ?", [threadKey]);
  },
  updateSystemPrompt: (threadKey: number, content: string) => {
    db.run("DELETE FROM messages WHERE thread_key = ? AND role = 'system'", [threadKey]);
    db.run("INSERT INTO messages (thread_key, role, content, created_at) VALUES (?, 'system', ?, ?)", 
      [threadKey, content, Date.now()]);
  },

  // Stats Management
  getStats: (threadKey: number) => {
    return db.query("SELECT * FROM thread_stats WHERE thread_key = ?").get(threadKey) as any;
  },
  upsertStats: (threadKey: number, stats: { requests?: number, promptTokens?: number, completionTokens?: number, cachedTokens?: number, lastContextSize?: number }) => {
    const { requests, promptTokens, completionTokens, cachedTokens, lastContextSize } = stats;
    db.run(`
      INSERT INTO thread_stats (thread_key, requests, prompt_tokens, completion_tokens, cached_tokens, last_context_size) 
      VALUES (?, ?, ?, ?, ?, ?) 
      ON CONFLICT(thread_key) DO UPDATE SET 
        requests = requests + COALESCE(?, 0), 
        prompt_tokens = prompt_tokens + COALESCE(?, 0), 
        completion_tokens = completion_tokens + COALESCE(?, 0), 
        cached_tokens = cached_tokens + COALESCE(?, 0), 
        last_context_size = COALESCE(?, last_context_size)
    `, [threadKey, requests || 0, promptTokens || 0, completionTokens || 0, cachedTokens || 0, lastContextSize || 0, 
        requests, promptTokens, completionTokens, cachedTokens, lastContextSize]);
  },

  // NEW: Log Method
  log: (level: string, message: string) => {
    db.run("INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)", [level, message, Date.now()]);
  },

  // --- Scheduled Tasks ---
  addScheduledTask: (task: { id: string, threadKey: number, chatId: number, type: string, timeExpr: string, actionPrompt: string }) => {
    db.run("INSERT INTO scheduled_tasks (id, thread_key, chat_id, type, time_expression, action_prompt) VALUES (?, ?, ?, ?, ?, ?)", 
      [task.id, task.threadKey, task.chatId, task.type, task.timeExpr, task.actionPrompt]);
  },
  getScheduledTasks: () => {
    return db.query("SELECT * FROM scheduled_tasks").all() as any[];
  },
  deleteScheduledTask: (id: string) => {
    db.run("DELETE FROM scheduled_tasks WHERE id = ?", [id]);
  },

  // Pending Actions
  setPendingAction: (actionId: string, action: { threadKey: number, chatId: number, statusMsgId: number, toolCallId: string, command: string }) => {
    db.run("INSERT INTO pending_actions (action_id, thread_key, chat_id, status_msg_id, tool_call_id, command) VALUES (?, ?, ?, ?, ?, ?)", 
      [actionId, action.threadKey, action.chatId, action.statusMsgId, action.toolCallId, action.command]);
  },
  getPendingAction: (actionId: string) => {
    return db.query("SELECT * FROM pending_actions WHERE action_id = ?").get(actionId) as any;
  },
  deletePendingAction: (actionId: string) => {
    db.run("DELETE FROM pending_actions WHERE action_id = ?", [actionId]);
  },

  // Lights Management
  getLights: () => {
    return db.query("SELECT * FROM lights").all() as any[];
  },
  upsertLight: (id: string, label: string, address: string) => {
    db.run(`
      INSERT INTO lights (id, label, address, last_seen) 
      VALUES (?, ?, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET label = ?, address = ?, last_seen = ?
    `, [id, label, address, Date.now(), label, address, Date.now()]);
  },
};
