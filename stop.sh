#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$APP_DIR/data/mc.pid"
PORT="${1:-${PORT:-8080}}"
PIDS="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
[[ -n "$PIDS" ]] && kill $PIDS 2>/dev/null || true
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  kill "$PID" 2>/dev/null || true
  rm -f "$PID_FILE"
fi
echo "[stopped] port=$PORT"