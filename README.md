# 🤖  TelegentAI - Telegram AI Agent Platform

A highly capable, local-tool-enabled Telegram AI Agent powered by **OpenRouter** and built with **Grammy**. This platform allows an LLM to converse, manage local files (in a sandboxed directory), dynamically search for models, execute shell commands safely via a Human-In-The-Loop (HITL) approval system, and schedule its own background tasks.

## ✨ Core Features
- **OpenRouter Integration**: Access to hundreds of LLMs (including free tiers) with dynamic model switching.
- **Real-Time Streaming Responses**: Telegram messages are updated progressively in chunks as the model generates text, providing a fast, snappy UX.
- **Human-in-the-loop (HITL) Shell Execution**: The AI can write and run scripts, but shell commands trigger interactive `Approve/Reject` Telegram buttons.
- **Resilient API & Fallbacks**: Built-in exponential backoff for API errors, automatically rolling over to fallback models (e.g., Google Gemma 4 free, Nemotron 3 Free) if a provider goes down.
- **Background Tasks & Scheduling**: Native support for creating precise one-time reminders or recurring cron jobs that prompt the AI to act proactively.
- **Sandboxed Workspace**: Local file reads and writes are securely locked to a `./brain` directory to prevent path traversal.
- **Persistent State Management**: All conversation history, thread statistics, scheduled tasks, and pending actions are persisted in a SQLite database (`state.db`), ensuring continuity across bot restarts.
- **Intelligent Context Management**: Implements a sliding window pruning mechanism to prevent context overflow while preserving the system prompt and maximizing cached tokens.
- **Recursive Tool Loops**: The agent can perform up to 5 chained tool calls before returning a response to the user.
- **Smart Home Integration**: Integrated LIFX control to discover and manage lights on the local network with a persistent device registry.

---

## 📂 Directory Structure
```text
└── src
    ├── agent.ts         # Core LLM loop, streaming handler, OpenRouter API calls, and tool execution.
    ├── commands.ts      # Telegram command definitions (/start, /ai, /model, /status, /clear).
    ├── config.ts        # Environment variables, agent persona configuration, and brain directory setup.
    ├── db.ts            # Persistent SQLite storage for threads, messages, stats, tasks, and devices.
    ├── index.ts         # Entry point, bot initialization, auth middleware, and callback queries.
    ├── lifx.ts          # Manager for LIFX LAN client discovery and local light control.
    ├── resilience.ts    # Retry logic, exponential backoff, and AI model fallback configurations.
    ├── scheduler.ts     # Cron-based background task manager for one-time and recurring events.
    ├── state.ts         # Global state management (e.g., tracking the currently active model).
    └── tools.ts         # Definition and routing for local tools (shell, file IO, model search, LIFX, tasks).
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
| `/model search [query]` | Searches OpenRouter for models (e.g., `/model search free`) with inline buttons to instantly switch. |

---

## ⚙️ AI Tools (Agent Capabilities)

The agent is currently equipped with the following internal tools:
1. `execute_shell_command`: Runs terminal commands (Intercepted by a Telegram inline-keyboard for human approval).
2. `write_file`: Saves content to a file inside the `./brain` workspace.
3. `read_file`: Reads text from a file inside the `./brain` workspace.
4. `list_brain_files`: Lists all current files stored in the workspace.
5. `search_openrouter_models`: Allows the AI to query OpenRouter to find alternative models.
6. `discover_lights`: Scans the local network for LIFX lights and updates the internal registry.
7. `set_light_state`: Adjusts power, color (hex), brightness, and kelvin for a specific LIFX light.
8. `schedule_task`: Creates a one-time precise timer or a recurring background cron job.
9. `list_scheduled_tasks`: Views active background timers mapped to the current chat.
10. `delete_scheduled_task`: Cancels a scheduled background job by ID.

### 💡 Example Prompts

**Home Automation:**
- *"Scan for lights and tell me what you find."*
- *"Change the Kitchen light to #FF0000 (red) at 50% brightness."*

**Proactive Scheduling:**
- *"Ping me in 30 minutes to check the oven."*
- *"Check the weather every morning at 8:00 AM and give me a brief summary."*
- *"List all my active reminders."*

---

## 🚀 Setup & Installation

### 1. Install Dependencies
```bash
bun install
```

*(Note: Ensure you have installed the `croner` and `lifx-lan-client` dependencies if you haven't already).*

### 2. Configuration (`brain/secrets.json`)
The bot features an interactive setup CLI. You do not need to create `.env` files manually. Simply run the bot, and if configurations are missing, it will prompt you in the terminal or automatically generate a template at `./brain/secrets.json`:

```json
{
  "TELEGRAM_TOKEN": "your_telegram_bot_token",
  "OPENROUTER_API_KEY": "your_openrouter_api_key",
  "MY_TELEGRAM_ID": 123456789,
  "DEFAULT_MODEL": "openrouter/free"
}
```

### 3. Run the Bot
```bash
bun run dev
```

*On the first run, the platform will auto-generate the `./brain` directory, instantiate `state.db`, and create an `agent_config.md` file where you can customize the agent's persona, languages, and system safety protocols.*