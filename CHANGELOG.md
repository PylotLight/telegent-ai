# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Unified Configuration**: Merged the hardcoded system prompt template directly into `brain/agent_config.md` under a customizable `## System Prompt Instructions` section.
- **Timezone Awareness Configuration**: Added a customizable `Timezone` key to `brain/agent_config.md` (defaulting to the host system's resolved timezone name).
- **Time-Aware Helpers**: Added dynamic timezone offset and ISO-8601 formatting utilities in `src/config.ts` to compute exact local times without using external date libraries.
- **Caching-Friendly Time awareness**: Dynamically injects a small, timezone-aware timestamp `[Current Time: YYYY-MM-DDTHH:mm:ss±HH:MM]` directly into incoming user prompts, keeping the system prompt static and preventing prompt caching invalidation/token burn.
- **Scheduler Timezone Support**: Configured background `Cron` instances in `src/scheduler.ts` to execute tasks in the configured user timezone, preventing time mismatches in containerized deployments.
- **Auto-Healing Migration**: Added dynamic self-healing configurations on boot that automatically parse, format, and migrate legacy `agent_config.md` files to the new format, preserving any existing user settings.

### Fixed
- **System Prompt Sorting Drift**: Fixed a bug where deleting and re-inserting the system prompt on config/model changes caused it to drift to the end of the history array by enforcing `created_at = 0` database sorting.
