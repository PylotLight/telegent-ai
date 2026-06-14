# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **MarkdownV2 Migration**: Migrated all remaining Telegram HTML parse modes (`parse_mode: "HTML"`) across the codebase to `parse_mode: "MarkdownV2"` and converted all raw HTML tags (`<b>`, `<i>`, `<code>`, `<pre>`) to their equivalent native markdown representation (`*`, `_`, `\``, `\`\`\``). Added proper escaping using `escapeMarkdownV2` for all dynamic parameters.
- **Unified Configuration**: Merged the hardcoded system prompt template directly into `brain/agent_config.md` under a customizable `## System Prompt Instructions` section.
- **Timezone Awareness Configuration**: Added a customizable `Timezone` key to `brain/agent_config.md` (defaulting to the host system's resolved timezone name).
- **Time-Aware Helpers**: Added dynamic timezone offset and ISO-8601 formatting utilities in `src/config.ts` to compute exact local times without using external date libraries.
- **Caching-Friendly Time awareness**: Dynamically injects a small, timezone-aware timestamp `[Current Time: YYYY-MM-DDTHH:mm:ss±HH:MM]` directly into incoming user prompts, keeping the system prompt static and preventing prompt caching invalidation/token burn.
- **Scheduler Timezone Support**: Configured background `Cron` instances in `src/scheduler.ts` to execute tasks in the configured user timezone, preventing time mismatches in containerized deployments.
- **Auto-Healing Migration**: Added dynamic self-healing configurations on boot that automatically parse, format, and migrate legacy `agent_config.md` files to the new format, preserving any existing user settings.
- **Dynamic Git-Based Updates**: Created `entrypoint.sh` - a supervisor script that boots the agent, dynamically fetches remote repository states, installs bun dependencies, and executes typescript syntax validation (`tsc --noEmit`).
- **Robust Rollback Safety**: Configured automatic healing in the bootloader loop to immediately roll back target branches/commits to the last working stable state if type-checking fails or if the agent crash-loops on startup.
- **Dynamic Branch Switcher (`/branch`)**: Added an interactive Telegram command enabling the owner to query available remote branches and dynamically hot-swap the bot into a separate developer/feature branch for live testing.
- **Interactive Upgrade (`/update`)**: Added a git-aware update manager command that queries remote changes on the active branch, lists the incoming changelog commit notes, and presents an inline approval keyboard to trigger clean process exits for automatic container restarts.
- **Git Context Status**: Upgraded `/status` to dynamically include active Git branch name, commit hash, and log message for perfect environment tracking.
- **Execution Cancellation**: Added support for aborting stuck background command executions and AI reasoning runs via inline `❌ Cancel` buttons and the `/cancel` bot command. Integrates dynamic AbortControllers and child process signals to stop stuck tasks instantly and cleanly resume interactions.

### Fixed
- **System Prompt Sorting Drift**: Fixed a bug where deleting and re-inserting the system prompt on config/model changes caused it to drift to the end of the history array by enforcing `created_at = 0` database sorting.
