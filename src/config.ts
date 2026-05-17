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

  // 1. Load existing if available
  if (existsSync(SECRETS_FILE)) {
    const data = JSON.parse(readFileSync(SECRETS_FILE, "utf-8"));
    TELEGRAM_TOKEN = data.TELEGRAM_TOKEN || "";
    OPENROUTER_API_KEY = data.OPENROUTER_API_KEY || "";
    MY_TELEGRAM_ID = data.MY_TELEGRAM_ID || 0;
    DEFAULT_MODEL = data.DEFAULT_MODEL || DEFAULT_MODEL;
  }

  // 2. Check process.env for overrides/fallbacks
  TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || TELEGRAM_TOKEN;
  OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY;
  const envTelegramId = parseInt(process.env.MY_TELEGRAM_ID || "0", 10);
  if (envTelegramId) MY_TELEGRAM_ID = envTelegramId;
  DEFAULT_MODEL = process.env.DEFAULT_MODEL || DEFAULT_MODEL;

  // 3. Helper to detect if a value is still a placeholder or empty
  const isPlaceholder = (val: string) => !val || val.includes("YOUR_");
  const isMissing = isPlaceholder(TELEGRAM_TOKEN) || isPlaceholder(OPENROUTER_API_KEY) || !MY_TELEGRAM_ID || MY_TELEGRAM_ID === 123456789;

  // 4. Attempt prompt ONLY if interactive
  if (isMissing && process.stdout.isTTY) {
    console.log("🚀 Setup required! Missing or placeholder configuration detected.");
    TELEGRAM_TOKEN = prompt("Enter Telegram Bot Token:") || TELEGRAM_TOKEN;
    OPENROUTER_API_KEY = prompt("Enter OpenRouter API Key:") || OPENROUTER_API_KEY;
    const idInput = prompt("Enter your Telegram User ID (for auth):");
    if (idInput) MY_TELEGRAM_ID = parseInt(idInput, 10);
    DEFAULT_MODEL = prompt("Enter Default Model (or press enter for default):") || DEFAULT_MODEL;
  } else if (isMissing) {
    console.log("⚠️ Non-interactive environment detected (e.g., Docker). Auto-prompts disabled.");
  }

  // 5. Final check: if STILL missing or placeholder, auto-create template and exit safely
  if (isPlaceholder(TELEGRAM_TOKEN) || isPlaceholder(OPENROUTER_API_KEY) || !MY_TELEGRAM_ID || MY_TELEGRAM_ID === 123456789) {
    console.error(`\n❌ Configuration is missing or still using placeholder values!`);
    console.error(`🛠️  Please edit the file at:`);
    console.error(`👉 ${SECRETS_FILE}\n`);
    
    await fs.writeFile(SECRETS_FILE, JSON.stringify({
      TELEGRAM_TOKEN: TELEGRAM_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN_HERE",
      OPENROUTER_API_KEY: OPENROUTER_API_KEY || "YOUR_OPENROUTER_API_KEY_HERE",
      MY_TELEGRAM_ID: MY_TELEGRAM_ID || 123456789,
      DEFAULT_MODEL: DEFAULT_MODEL
    }, null, 2));
    
    console.error("🛑 Exiting. Update the secrets.json file and restart.\n");
    process.exit(1);
  }

  // Save the merged/valid config
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
- To tag or ping the owner, use: [{username}](tg://user?id=${MY_TELEGRAM_ID})

If you build a tool:
1. Use 'write_file' to save it to './brain'.
2. Use 'execute_shell_command' to run it.`;
}