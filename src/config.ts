import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

export const BRAIN_DIR = path.join(process.cwd(), "brain");
export const SECRETS_FILE = path.join(BRAIN_DIR, "secrets.json");
export const CONFIG_FILE = path.join(BRAIN_DIR, "agent_config.md");

export let TELEGRAM_TOKEN = "";
export let OPENROUTER_API_KEY = "";
export let MY_TELEGRAM_ID = 0;
export let DEFAULT_MODEL = "openrouter/free";

export let agentConfig = {
  persona: "General AI Assistant",
  preferredLanguage: "English",
  defaultScriptingLanguage: "Node.js (TypeScript/JavaScript)",
  primaryTools: ["execute_shell_command", "write_file", "read_file", "list_brain_files", "search_openrouter_models"],
  safetyProtocols: "Always ask for user approval before running execute_shell_command. Avoid destructive commands.",
  maxTokenWarning: 150000,
};

export async function ensureBrainDir() { 
  await fs.mkdir(BRAIN_DIR, { recursive: true }); 
}

export async function initSecrets() {
  await ensureBrainDir();

  // 1. Prioritize Secrets File
  if (existsSync(SECRETS_FILE)) {
    const data = JSON.parse(readFileSync(SECRETS_FILE, "utf-8"));
    TELEGRAM_TOKEN = data.TELEGRAM_TOKEN;
    OPENROUTER_API_KEY = data.OPENROUTER_API_KEY;
    MY_TELEGRAM_ID = data.MY_TELEGRAM_ID;
    if (data.DEFAULT_MODEL) DEFAULT_MODEL = data.DEFAULT_MODEL;
    return;
  }

  // 2. Check Docker/Environment variables
  TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "";
  OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
  MY_TELEGRAM_ID = parseInt(process.env.MY_TELEGRAM_ID || "0", 10);
  DEFAULT_MODEL = process.env.DEFAULT_MODEL || DEFAULT_MODEL;

  // 3. Fallback to CLI Prompts if running natively without env vars
  if (!TELEGRAM_TOKEN || !OPENROUTER_API_KEY || !MY_TELEGRAM_ID) {
    console.log("🚀 First time setup! Please enter your configuration:\n");
    TELEGRAM_TOKEN = prompt("Enter Telegram Bot Token:") || "";
    OPENROUTER_API_KEY = prompt("Enter OpenRouter API Key:") || "";
    const idInput = prompt("Enter your Telegram User ID (for auth):") || "0";
    MY_TELEGRAM_ID = parseInt(idInput, 10);
    DEFAULT_MODEL = prompt("Enter Default Model (or press enter for default):") || DEFAULT_MODEL;
  }

  if (!TELEGRAM_TOKEN || !OPENROUTER_API_KEY || !MY_TELEGRAM_ID) {
    console.error("❌ Missing required configuration. Exiting.");
    process.exit(1);
  }

  await fs.writeFile(SECRETS_FILE, JSON.stringify({
    TELEGRAM_TOKEN, OPENROUTER_API_KEY, MY_TELEGRAM_ID, DEFAULT_MODEL
  }, null, 2));
}

export async function loadAgentConfig() {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    agentConfig.persona = content.match(/Persona: (.*)/)?.[1] || agentConfig.persona;
    agentConfig.preferredLanguage = content.match(/Preferred Language: (.*)/)?.[1] || agentConfig.preferredLanguage;
    agentConfig.defaultScriptingLanguage = content.match(/Default Scripting Language: (.*)/)?.[1] || agentConfig.defaultScriptingLanguage;
    const warningMatch = content.match(/Max Context Warning: (\d+)/)?.[1];
    if (warningMatch) agentConfig.maxTokenWarning = parseInt(warningMatch, 10);
  } catch (e) {
    await fs.writeFile(CONFIG_FILE, `# Agent Configuration
Persona: ${agentConfig.persona}
Preferred Language: ${agentConfig.preferredLanguage}
Default Scripting Language: ${agentConfig.defaultScriptingLanguage}
Max Context Warning: ${agentConfig.maxTokenWarning}
Safety Protocols: ${agentConfig.safetyProtocols}`.trim(), "utf-8");
  }
}

export async function getSystemPrompt(threadKey: number) {
  return `You are a ${agentConfig.persona}.
Your workspace is '${BRAIN_DIR}'. You primarily use ${agentConfig.defaultScriptingLanguage}.
Your safety protocols: ${agentConfig.safetyProtocols}.

FORMATTING:
- Use standard markdown (e.g. **bold**, *italic*, \`code\`).
- To tag or ping the owner, use: [Master](tg://user?id=${MY_TELEGRAM_ID})

If you build a tool:
1. Use 'write_file' to save it to './brain'.
2. Use 'execute_shell_command' to run it.`;
}