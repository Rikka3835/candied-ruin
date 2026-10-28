#!/usr/bin/env bash
# 交付前自检：Node 侧同步章节状态 → NovelOps 审计 / 知识边界 / 钩子压力
# 用法：
#   bash scripts/audit.sh                 # 审计最新一章
#   bash scripts/audit.sh audit 002       # 审计第 2 章
#   bash scripts/audit.sh knowledge 001   # 知识边界检查
#   bash scripts/audit.sh hooks           # 钩子压力
set -euo pipefail
cd "$(dirname "$0")/.."

# 让脚本在没配 PATH 的 shell 里也能跑（DSH 自带 node）
if ! command -v node >/dev/null 2>&1; then
  for d in "$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin"; do
    [ -x "$d/node" ] && PATH="$d:$PATH"
  done
fi

MODE="${1:-audit}"
NUM="${2:-}"
CLI="ref/novelops-skill-main/scripts/novelops_cli.py"
PROJ="docs/novelops"

if [ ! -f "$CLI" ]; then
  echo "缺少 NovelOps 本体：$CLI" >&2
  echo "下载：curl -sSL -o /tmp/n.zip https://codeload.github.com/qiyan233/novelops-skill/zip/refs/heads/main && unzip -q /tmp/n.zip -d ref" >&2
  exit 1
fi

node scripts/novelops-sync.mjs

if [ -z "$NUM" ]; then
  NUM=$(ls content/chapters/*.md 2>/dev/null | sed 's/.*\///; s/\.md$//' | sort | tail -1)
fi
CH="content/chapters/${NUM}.md"

case "$MODE" in
  audit)     python "$CLI" audit --project "$PROJ" --chapter-file "$CH" ;;
  knowledge) python "$CLI" knowledge-check --project "$PROJ" --chapter-file "$CH" ;;
  hooks)     python "$CLI" hook-report --project "$PROJ" --stale-after 5 ;;
  *) echo "未知模式：$MODE（audit / knowledge / hooks）" >&2; exit 2 ;;
esac
