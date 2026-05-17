# 🤖  TelegentAI - Telegram AI Agent Platform

A highly capable, local-tool-enabled Telegram AI Agent powered by **OpenRouter** and built with **Grammy**. This platform allows an LLM to converse, manage local files (in a sandboxed directory), dynamically search for models, and execute shell commands safely via a Human-In-The-Loop (HITL) approval system.

## ✨ Core Features
- **OpenRouter Integration**: Access to hundreds of LLMs (including free tiers) with dynamic model switching.
- **Human-in-the-loop (HITL) Shell Execution**: The AI can write and run scripts, but shell commands trigger interactive `Approve/Reject` Telegram buttons.
- **Sandboxed Workspace**: Local file reads and writes are securely locked to a \`./brain\` directory to prevent path traversal.
- **Persistent State Management**: All conversation history, thread statistics, and pending actions are persisted in a SQLite database (`state.db`), ensuring continuity across bot restarts.
- **Per-Thread AI Models**: Different Telegram topics/threads can run different AI models simultaneously, with selections persisted per-thread.
- **Intelligent Context Management**: Implements a sliding window pruning mechanism to prevent context overflow while preserving the system prompt.
- **Auto-Sleep Lifecycle**: Threads automatically transition to a "sleeping" state after 60 minutes of inactivity and must be awakened via `/ai`.
- **Recursive Tool Loops**: The agent can perform up to 5 chained tool calls before returning a response.
- **Smart Home Integration**: Integrated LIFX control to discover and manage lights on the local network with a persistent device registry.

---

## 📂 Directory Structure
```text
└── src
    ├── agent.ts     # Core LLM loop, OpenRouter API calls, and tool response handling.
    ├── commands.ts  # Telegram command definitions (/start, /ai, /model, etc.).
    ├── config.ts    # Environment variables, agent persona configuration, and brain directory setup.
    ├── index.ts     # Entry point, Grammy bot initialization, auth middleware, and callback queries.
    ├── state.ts     # Legacy state definitions (now primarily used for types).
    ├── tools.ts     # Definition and execution logic for local tools (shell, file IO, model search, LIFX).
    ├── db.ts        # Persistent SQLite storage for threads, messages, stats, and device registries.
    └── lifx.ts      # Manager for LIFX LAN client discovery and control.
```

## 🛠️ Bot Commands

| Command | Description |
| :--- | :--- |
| `/start` | Wakes up the bot and provides a brief introduction. |
| `/ai [prompt]` | Wakes up the AI for the current thread and processes your message. |
| `/clear` | Wipes the conversation memory and token statistics for the current thread. |
| `/status` | Displays context size, total token usage, and active state for the current thread. |
| `/model` | Shows the currently active AI model. |
| `/model [id]` | Switches the AI to a specific OpenRouter model ID. |
| `/model search [query]` | Searches OpenRouter for models (e.g., \`/model search free\`) with inline buttons to instantly switch. |

---

## ⚙️ AI Tools (Agent Capabilities)

The agent is currently equipped with the following internal tools:
1. `execute_shell_command`: Runs terminal commands (Intercepted by a Telegram inline-keyboard for human approval).
2. `write_file`: Saves content to a file inside the \`./brain\` workspace.
3. `read_file`: Reads text from a file inside the \`./brain\` workspace.
4. `list_brain_files`: Lists all current files stored in the workspace.
5. `search_openrouter_models`: Allows the AI to query OpenRouter to find alternative models.
6. `discover_lights`: Scans the local network for LIFX lights and updates the internal registry.
7. `set_light_state`: Adjusts power, color (hex), brightness, and kelvin for a specific LIFX light.

### 💡 Prompting for Light Control
You can ask the AI to control your lights naturally:
- *"Scan for lights and tell me what you find."*
- *"Turn on the Living Room light."*
- *"Set the Bedroom light to a dim warm white."*
- *"Change the Kitchen light to #FF0000 (red) at 50% brightness."*

---

## 🚀 Setup & Installation

### 1. Environment Variables
Create a \`.env\` file in the root directory:
```env
TELEGRAM_TOKEN=your_telegram_bot_token
OPENROUTER_API_KEY=your_openrouter_api_key
MY_TELEGRAM_ID=your_personal_telegram_id_for_auth
AI_MODEL=google/gemma-4-31b-it:free # Optional default
```

### 2. Run the Bot
```bash
bun install
bun run dev
```

*On the first run, the platform will auto-generate a `./brain` directory and an `agent_config.md` file to dictate the agent's persona and system prompt.*
