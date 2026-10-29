#!/usr/bin/env bash
# 上线前一条命令自检：重建产物 → 四项检查 → 汇总。
# 用法：bash scripts/release-check.sh
# 说明：只读不写远端；通过之后再手动部署（见 docs/deploy.md）。
set -euo pipefail
cd "$(dirname "$0")/.."

# 没配 PATH 的 shell 里也能跑（DSH 自带 node）
if ! command -v node >/dev/null 2>&1; then
  export PATH="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
fi

fail=0

echo "── 构建（人物档案 → 章节 → 单章页 → feed → sitemap → pages-dist）"
for s in build-characters build-chapters build-chapter-pages build-feed build-sitemap build-pages; do
  node "scripts/$s.mjs" >"/tmp/cr-$s.log" 2>&1 || { echo "   ✗ $s 失败，见 /tmp/cr-$s.log"; fail=1; }
done
[ "$fail" -eq 0 ] && echo "   完成"

for s in check-sync check-a11y check-links check-budget; do
  echo "── $s"
  node "scripts/$s.mjs" >"/tmp/cr-$s.log" 2>&1 || { echo "   ✗ 未通过，见 /tmp/cr-$s.log"; fail=1; }
  tail -2 "/tmp/cr-$s.log" | sed 's/^/   /'
done

if [ "$fail" -ne 0 ]; then
  echo "✗ 有检查未通过，不要部署"
  exit 1
fi
echo "✓ 全部通过，可以部署"
