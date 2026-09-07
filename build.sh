#!/usr/bin/env bash
# 构建一个或多个平台的自包含二进制,把前端 (web/dist) 嵌进 Go 二进制里。
#
# 用法:
#   ./build.sh                          # 当前 OS/ARCH,输出到 bin/mc
#   ./build.sh linux amd64              # 交叉编译
#   ./build.sh darwin arm64             # Apple Silicon
#   ./build.sh windows amd64            # Windows,输出 .exe
#   ./build.sh all                      # 一次性构建 linux/amd64 + linux/arm64 + darwin/amd64 + darwin/arm64 + windows/amd64
#
# 环境变量:
#   SKIP_FRONTEND=1     跳过 npm install / npm run build(假设 web/dist 已经构建过)
#   OUTPUT_DIR=dist     产物输出目录
#   BIN_NAME=mc         产物文件名(Windows 自动加 .exe)

set -euo pipefail

APP_NAME="mc"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$APP_DIR/web"
OUTPUT_DIR="${OUTPUT_DIR:-$APP_DIR/dist}"
BIN_NAME="${BIN_NAME:-$APP_NAME}"
SKIP_FRONTEND="${SKIP_FRONTEND:-0}"

cd "$APP_DIR"

build_frontend() {
  if [[ "$SKIP_FRONTEND" == "1" ]]; then
    echo "[web] skip (SKIP_FRONTEND=1)"
    return
  fi
  if [[ ! -d "$WEB_DIR" ]]; then
    echo "[web] no web/ directory, skip" >&2
    return
  fi
  if [[ ! -d "$WEB_DIR/node_modules" ]]; then
    echo "[web] npm install"
    (cd "$WEB_DIR" && npm install --no-audit --no-fund --silent)
  fi
  echo "[web] npm run build"
  (cd "$WEB_DIR" && npm run build --silent)
}

build_one() {
  local goos="$1"
  local goarch="$2"

  local ext=""
  [[ "$goos" == "windows" ]] && ext=".exe"

  local suffix=""
  if [[ "${BUILD_ALL:-0}" == "1" || "${BUILD_TARGETED:-0}" == "1" ]]; then
    suffix="-$goos-$goarch"
  fi
  local outfile="$OUTPUT_DIR/${BIN_NAME}${suffix}${ext}"

  echo "[build] GOOS=$goos GOARCH=$goarch -> $outfile"
  GOOS="$goos" GOARCH="$goarch" CGO_ENABLED=0 \
    go build -trimpath -ldflags="-s -w" -o "$outfile" .
}

mkdir -p "$OUTPUT_DIR"

build_frontend

if [[ "${1:-}" == "all" ]]; then
  BUILD_ALL=1
  build_one linux  amd64
  build_one linux  arm64
  build_one darwin amd64
  build_one darwin arm64
  build_one windows amd64
elif [[ $# -gt 0 ]]; then
  BUILD_TARGETED=1
  build_one "$1" "$2"
else
  build_one "$(go env GOOS)" "$(go env GOARCH)"
fi

echo
echo "[done] artifacts:"
ls -lh "$OUTPUT_DIR" | sed 's/^/    /'