#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-${PORT:-8080}}"
HOST="${HOST:-0.0.0.0}"
APP_NAME="mc"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$APP_DIR/data/${APP_NAME}.pid"
LOG_FILE="$APP_DIR/logs/${APP_NAME}.log"
BIN="$APP_DIR/bin/${APP_NAME}"
WEB_DIR="$APP_DIR/web"
STATIC_DIR="${STATIC_DIR:-$APP_DIR/static}"
SKIP_WEB_BUILD="${SKIP_WEB_BUILD:-0}"

cd "$APP_DIR"
mkdir -p data logs bin "$STATIC_DIR"

stop_existing() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "[stop] killing pid $pid"
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi

  local pids
  pids="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[stop] killing processes on port $PORT: $pids"
    kill $pids 2>/dev/null || true
    sleep 0.5
    kill -9 $pids 2>/dev/null || true
  fi
}

build_web() {
  if [[ "$SKIP_WEB_BUILD" == "1" ]]; then
    echo "[web] skip (SKIP_WEB_BUILD=1)"
    return
  fi
  if [[ ! -d "$WEB_DIR" ]]; then
    echo "[web] no $WEB_DIR, skip"
    return
  fi
  echo "[web] build -> $STATIC_DIR"
  if [[ ! -d "$WEB_DIR/node_modules" ]]; then
    (cd "$WEB_DIR" && npm install --no-audit --no-fund --silent)
  fi
  (cd "$WEB_DIR" && npm run build --silent)
  rm -rf "$STATIC_DIR"/*
  cp -R "$WEB_DIR/dist/." "$STATIC_DIR"/
  echo "[web] copied $(ls "$STATIC_DIR" | wc -l | tr -d ' ') entries to $STATIC_DIR"
}

build() {
  echo "[build] go build -> $BIN"
  go build -trimpath -ldflags="-s -w" -o "$BIN" .
}

start() {
  echo "[start] host=$HOST port=$PORT log=$LOG_FILE"
  HOST="$HOST" PORT="$PORT" STATIC_DIR="$STATIC_DIR" nohup "$BIN" -host "$HOST" -port "$PORT" >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 0.6
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "[ok] running pid=$(cat "$PID_FILE") on http://$HOST:$PORT"
  else
    echo "[fail] see log: $LOG_FILE" >&2
    tail -n 50 "$LOG_FILE" >&2 || true
    exit 1
  fi
}

stop_existing
build_web
build
start