#!/usr/bin/env bash
# 临时发布脚本：构建 → 推 D1 → 部署 Cloudflare Pages
set -euo pipefail
cd "$(dirname "$0")/.."

SEC="D:/桌面/candied-ruin-secrets.txt"
pick() { grep -m1 "^$1=" "$SEC" | cut -d= -f2- | tr -d '\r' ; }
export CLOUDFLARE_ACCOUNT_ID="$(pick CLOUDFLARE_ACCOUNT_ID)"
export CLOUDFLARE_API_TOKEN="$(pick CLOUDFLARE_API_TOKEN)"
export NODE_EXE="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe"
export PATH="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"

echo "[1/3] build"
npm run build >/tmp/build.log 2>&1 || { tail -20 /tmp/build.log; exit 1; }
tail -3 /tmp/build.log

echo "[2/3] d1 sync"
node scripts/sync-d1.mjs --apply | tail -3

echo "[3/3] pages deploy"
ELECTRON_RUN_AS_NODE=1 "/d/DSH/DeepSeek Harness.exe" \
  -r scripts/wr-preload.cjs \
  node_modules/.pnpm/wrangler@4.152.0/node_modules/wrangler/wrangler-dist/cli.js \
  pages deploy pages-dist --project-name=bubble-vanguard --branch=main --commit-dirty=true 2>&1 | tail -6
