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
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  systemPromptTemplate: "",
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

export function getTimezoneOffset(timeZone: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset"
    }).formatToParts(date);
    const tzName = parts.find(p => p.type === "timeZoneName")?.value || "";
    if (tzName === "GMT") return "+00:00";
    return tzName.replace("GMT", "");
  } catch {
    return "+00:00";
  }
}

export function getLocalISOString(timeZone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === "year")?.value;
    const month = parts.find(p => p.type === "month")?.value;
    const day = parts.find(p => p.type === "day")?.value;
    let hour = parts.find(p => p.type === "hour")?.value || "00";
    const minute = parts.find(p => p.type === "minute")?.value;
    const second = parts.find(p => p.type === "second")?.value;
    if (hour === "24") hour = "00";
    const offset = getTimezoneOffset(timeZone, date);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
  } catch {
    return date.toISOString();
  }
}

export async function loadAgentConfig() {
  let content = "";
  try {
    content = await fs.readFile(CONFIG_FILE, "utf-8");
  } catch (e) {
    // If config file doesn't exist, create it with all defaults
    content = `# Agent Configuration
Persona: ${agentConfig.persona}
Preferred Language: ${agentConfig.preferredLanguage}
Default Scripting Language: ${agentConfig.defaultScriptingLanguage}
Max Context Warning: ${agentConfig.maxTokenWarning}
Safety Protocols: ${agentConfig.safetyProtocols}
Timezone: ${agentConfig.timezone}

## System Prompt Instructions
You are a {{persona}}.
Your workspace is '{{workspace}}'. You primarily use {{language}}.
Your safety protocols: {{safety}}.
Timezone: {{timezone}}
(Note: You can check the current time for each message in the time context appended to the user's message.)

FORMATTING:
- Use standard markdown (e.g. **bold**, *italic*, \`code\`).
- To tag or ping the owner, use: [{username}](tg://user?id={{owner_id}})

If you build a tool:
1. Use 'write_file' to save it to './brain'.
2. Use 'execute_shell_command' to run it.

To run commands on the host system when necessary:
- Use \`chroot /host\` to execute binaries on the host.
- Use \`nsenter -t 1 -m -u -n -i\` to run commands in the host's namespaces (PID, mount, UTS, network, IPC).`;

    await fs.writeFile(CONFIG_FILE, content.trim(), "utf-8");
  }

  // Parse keys
  agentConfig.persona = content.match(/Persona: (.*)/)?.[1]?.trim() || agentConfig.persona;
  agentConfig.preferredLanguage = content.match(/Preferred Language: (.*)/)?.[1]?.trim() || agentConfig.preferredLanguage;
  agentConfig.defaultScriptingLanguage = content.match(/Default Scripting Language: (.*)/)?.[1]?.trim() || agentConfig.defaultScriptingLanguage;
  const warningMatch = content.match(/Max Context Warning: (\d+)/)?.[1];
  if (warningMatch) agentConfig.maxTokenWarning = parseInt(warningMatch, 10);
  agentConfig.timezone = content.match(/Timezone: (.*)/)?.[1]?.trim() || agentConfig.timezone;
  agentConfig.safetyProtocols = content.match(/Safety Protocols: (.*)/)?.[1]?.trim() || agentConfig.safetyProtocols;

  // Handle system prompt section parsing & self-healing migrations
  let hasChanges = false;

  // 1. Ensure Timezone key exists in the file keys section
  if (!content.includes("Timezone:")) {
    // Find where to insert Timezone - right after Safety Protocols
    const safetyIndex = content.indexOf("Safety Protocols:");
    if (safetyIndex !== -1) {
      const lineEnd = content.indexOf("\n", safetyIndex);
      content = content.slice(0, lineEnd) + `\nTimezone: ${agentConfig.timezone}` + content.slice(lineEnd);
    } else {
      content = `Timezone: ${agentConfig.timezone}\n` + content;
    }
    hasChanges = true;
  }

  // 2. Parse or migrate system prompt section
  const promptParts = content.split(/## System Prompt Instructions\r?\n/);
  if (promptParts[1]) {
    agentConfig.systemPromptTemplate = promptParts[1].trim();
  } else {
    // Migrate: Append system prompt section
    const defaultPromptSection = `\n\n## System Prompt Instructions\nYou are a {{persona}}.\nYour workspace is '{{workspace}}'. You primarily use {{language}}.\nYour safety protocols: {{safety}}.\nTimezone: {{timezone}}\n(Note: You can check the current time for each message in the time context appended to the user's message.)\n\nFORMATTING:\n- Use standard markdown (e.g. **bold**, *italic*, \\\`code\\\`).\n- To tag or ping the owner, use: [{username}](tg://user?id={{owner_id}})\n\nIf you build a tool:\n1. Use 'write_file' to save it to './brain'.\n2. Use 'execute_shell_command' to run it.\n\nTo run commands on the host system when necessary:\n- Use \\\`chroot /host\\\` to execute binaries on the host.\n- Use \\\`nsenter -t 1 -m -u -n -i\\\` to run commands in the host's namespaces (PID, mount, UTS, network, IPC).`;
    content = content.trim() + defaultPromptSection;
    const migratedParts = defaultPromptSection.split(/## System Prompt Instructions\r?\n/);
    agentConfig.systemPromptTemplate = (migratedParts[1] || "").trim();
    hasChanges = true;
  }

  if (hasChanges) {
    await fs.writeFile(CONFIG_FILE, content, "utf-8");
  }
}

export async function getSystemPrompt(threadKey: number) {
  let template = agentConfig.systemPromptTemplate;
  if (!template) {
    await loadAgentConfig();
    template = agentConfig.systemPromptTemplate;
  }

  // Substitute static placeholders (safe for caching!)
  return template
    .replace(/{{persona}}/g, agentConfig.persona)
    .replace(/{{workspace}}/g, BRAIN_DIR)
    .replace(/{{language}}/g, agentConfig.defaultScriptingLanguage)
    .replace(/{{safety}}/g, agentConfig.safetyProtocols)
    .replace(/{{owner_id}}/g, MY_TELEGRAM_ID.toString())
    .replace(/{{timezone}}/g, agentConfig.timezone);
}   