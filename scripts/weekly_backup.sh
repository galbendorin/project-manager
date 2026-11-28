#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUPS_DIR="$PROJECT_DIR/backups"
LOG_DIR="$BACKUPS_DIR/logs"
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$LOG_DIR"
chmod 700 "$BACKUPS_DIR" "$LOG_DIR" || true

{
  echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') weekly backup start ==="
  cd "$PROJECT_DIR"
  NPM_BIN="$(command -v npm || true)"
  if [ -z "$NPM_BIN" ]; then
    echo "ERROR: npm not found in PATH"
    exit 1
  fi

  "$NPM_BIN" run backup:projects -- --keep 8

  LATEST_DIR="$(find "$BACKUPS_DIR" -maxdepth 1 -mindepth 1 -type d -name '[0-9][0-9][0-9][0-9]-*' | sort -r | head -n 1 || true)"
  if [ -z "$LATEST_DIR" ]; then
    echo "ERROR: could not find latest backup directory"
    exit 1
  fi

  "$NPM_BIN" run backup:verify -- "$LATEST_DIR"
  echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') weekly backup done ==="
} >> "$LOG_DIR/weekly-backup.log" 2>&1
