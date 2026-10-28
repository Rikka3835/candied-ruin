#!/usr/bin/env bash
# 把本地提交推到 GitHub（token 存在本机 secrets 文件里，不进仓库）
set -euo pipefail
cd "$(dirname "$0")/.."
SEC="${GITHUB_SECRETS:-/d/桌面/candied-ruin-secrets.txt}"
[ -f "$SEC" ] || SEC="/d/桌面/bubble-vanguard-secrets.txt"
TOKEN=$(grep -o 'GITHUB_TOKEN=.*' "$SEC" 2>/dev/null | tr -d '\r' | cut -d= -f2)
if [ -z "${TOKEN:-}" ]; then echo "✗ 找不到 GITHUB_TOKEN（$SEC）"; exit 1; fi
B64=$(printf "x-access-token:%s" "$TOKEN" | base64 -w0)
git -c http.schannelCheckRevoke=false -c http.extraheader="AUTHORIZATION: basic $B64" push -u origin HEAD:main "$@"
