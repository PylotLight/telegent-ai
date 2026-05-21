#!/bin/bash
# entrypoint.sh - Dynamic Bootloader & Auto-Healer for TelegentAI

# Ensure errors do not crash the entrypoint outer loop itself
set -e

REPO_DIR="/app"
DEFAULT_REPO="https://github.com/PylotLight/telegent-ai.git"

# Create brain directory if it doesn't exist
mkdir -p "$REPO_DIR/brain"

# 1. Helper functions to read/write JSON configuration using Bun
read_boot_key() {
  bun -e "try { console.log(JSON.parse(require('fs').readFileSync('brain/boot.json', 'utf8'))['$1'] || '$2') } catch { console.log('$2') }"
}

write_boot_key() {
  bun -e "
    const fs = require('fs');
    let data = {};
    try { data = JSON.parse(fs.readFileSync('brain/boot.json', 'utf8')); } catch {}
    data['$1'] = '$2';
    fs.writeFileSync('brain/boot.json', JSON.stringify(data, null, 2));
  "
}

# Ensure boot.json template exists
if [ ! -f "$REPO_DIR/brain/boot.json" ]; then
  echo "📝 Creating initial boot.json..."
  write_boot_key "target_branch" "main"
  write_boot_key "last_stable_branch" "main"
  write_boot_key "bot_repo" "$DEFAULT_REPO"
fi

# 2. Check if git repository is cloned, if not clone it
if [ ! -d "$REPO_DIR/.git" ]; then
  BOT_REPO=$(read_boot_key "bot_repo" "$DEFAULT_REPO")
  TARGET_BRANCH=$(read_boot_key "target_branch" "main")
  echo "📥 Repository not found. Cloning $BOT_REPO ($TARGET_BRANCH) into $REPO_DIR..."
  git clone -b "$TARGET_BRANCH" "$BOT_REPO" "$REPO_DIR"
fi

cd "$REPO_DIR"

# Mark repo directory as safe for git inside container
git config --global --add safe.directory "$REPO_DIR" || true

while true; do
  # Read active target configuration
  TARGET_BRANCH=$(read_boot_key "target_branch" "main")
  LAST_STABLE_BRANCH=$(read_boot_key "last_stable_branch" "main")
  LAST_STABLE_COMMIT=$(read_boot_key "last_stable_commit" "")
  
  echo "--------------------------------------------------------"
  echo "🔍 Target branch: '$TARGET_BRANCH'"
  echo "🔍 Last stable branch: '$LAST_STABLE_BRANCH'"
  echo "--------------------------------------------------------"
  
  echo "📡 Fetching updates from GitHub..."
  if ! git fetch --all; then
    echo "⚠️ Failed to fetch from remote! Proceeding offline with local branch state."
  fi
  
  # Checkout the target branch
  echo "🔄 Checking out branch '$TARGET_BRANCH'..."
  if ! git checkout "$TARGET_BRANCH"; then
    echo "⚠️ Failed to checkout branch '$TARGET_BRANCH'! Reverting to '$LAST_STABLE_BRANCH'..."
    write_boot_key "target_branch" "$LAST_STABLE_BRANCH"
    sleep 2
    continue
  fi
  
  # Pull updates if we are connected
  echo "📥 Pulling latest changes for '$TARGET_BRANCH'..."
  if ! git pull origin "$TARGET_BRANCH"; then
    echo "⚠️ Failed to pull remote updates. Using local branch state."
  fi
  
  # Store current commit hash
  CURRENT_COMMIT=$(git rev-parse HEAD)
  echo "📌 Active Commit: $CURRENT_COMMIT"

  # Ensure dependencies are installed
  echo "📦 Installing/updating dependencies..."
  if ! bun install --frozen-lockfile; then
    echo "⚠️ Dependency installation failed!"
    if [ "$TARGET_BRANCH" != "$LAST_STABLE_BRANCH" ]; then
      echo "🔄 Rolling back branch to '$LAST_STABLE_BRANCH'..."
      write_boot_key "target_branch" "$LAST_STABLE_BRANCH"
      sleep 2
      continue
    fi
  fi
  
  # Validate syntax & compilation
  echo "🔬 Validating TypeScript syntax and build..."
  if ! bun x tsc --noEmit; then
    echo "❌ Syntax validation failed on branch '$TARGET_BRANCH'!"
    if [ "$TARGET_BRANCH" != "$LAST_STABLE_BRANCH" ]; then
      echo "🔄 Rolling back branch to '$LAST_STABLE_BRANCH'..."
      write_boot_key "target_branch" "$LAST_STABLE_BRANCH"
      sleep 2
      continue
    elif [ -n "$LAST_STABLE_COMMIT" ] && [ "$CURRENT_COMMIT" != "$LAST_STABLE_COMMIT" ]; then
      echo "🔄 Rolling back commit to stable commit '$LAST_STABLE_COMMIT'..."
      git reset --hard "$LAST_STABLE_COMMIT"
      sleep 2
      continue
    fi
  fi

  echo "🚀 Launching TelegentAI Agent..."
  START_TIME=$(date +%s)
  
  # Disable set -e so crashes do not abort the supervisor entrypoint script itself
  set +e
  bun run src/index.ts
  EXIT_CODE=$?
  set -e
  
  END_TIME=$(date +%s)
  RUN_DURATION=$((END_TIME - START_TIME))

  echo "⏹️ Agent exited with code $EXIT_CODE (Duration: ${RUN_DURATION}s)"

  if [ $EXIT_CODE -eq 0 ]; then
    echo "👋 Agent shut down cleanly. Exiting supervisor loop."
    exit 0
  elif [ $EXIT_CODE -eq 42 ]; then
    echo "🔄 Agent requested hot-reload/upgrade."
    # If the app booted and requested a hot-swap, mark the CURRENT branch/commit as the last known stable state
    write_boot_key "last_stable_branch" "$TARGET_BRANCH"
    write_boot_key "last_stable_commit" "$CURRENT_COMMIT"
    continue
  else
    echo "💥 Agent crashed!"
    
    # If it crashed instantly (less than 15 seconds) and we are NOT on the stable branch/commit, roll back
    if [ $RUN_DURATION -lt 15 ]; then
      echo "⚠️ Agent crashed instantly on startup!"
      if [ "$TARGET_BRANCH" != "$LAST_STABLE_BRANCH" ]; then
        echo "🔄 Rolling back branch from '$TARGET_BRANCH' to '$LAST_STABLE_BRANCH'..."
        write_boot_key "target_branch" "$LAST_STABLE_BRANCH"
      elif [ -n "$LAST_STABLE_COMMIT" ] && [ "$CURRENT_COMMIT" != "$LAST_STABLE_COMMIT" ]; then
        echo "🔄 Rolling back commit from '$CURRENT_COMMIT' to '$LAST_STABLE_COMMIT'..."
        git reset --hard "$LAST_STABLE_COMMIT"
      else
        echo "⚠️ Already at last known stable state. Sleeping 5 seconds before restart to prevent tight crash loop..."
        sleep 5
      fi
    else
      # Normal crash recovery, just restart the process
      echo "⏳ Restarting process in 2 seconds..."
      sleep 2
    fi
  fi
done
