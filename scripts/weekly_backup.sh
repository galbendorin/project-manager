#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/doringalben/project-manager"
LOG_DIR="$PROJECT_DIR/backups/logs"
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$LOG_DIR"

{
  echo "=== $(date) weekly backup start ==="
  cd "$PROJECT_DIR"
  NPM_BIN="$(command -v npm || true)"
  if [ -z "$NPM_BIN" ]; then
    echo "ERROR: npm not found in PATH"
    exit 1
  fi
  "$NPM_BIN" run backup:projects
  echo "=== $(date) weekly backup done ==="
} >> "$LOG_DIR/weekly-backup.log" 2>&1
