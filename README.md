# 糖渍旧蜜 · CANDIED RUIN

轻小说《糖渍旧蜜》的官方网站与正文稿库。  
线上：<https://bubble-vanguard.pages.dev>

## 目录

| 路径 | 内容 |
|---|---|
| `public/` | 站点静态文件（首页、小说目录、阅读层、前言、人物档案、404 等） |
| `content/chapters/` | 正文源文件，一章一个 `.md` |
| `docs/` | 设定集（`story-bible.md`）、人物卡（`characters.md`）、创世神话（`world-genesis.md`）、系列规划（`series-plan.md`） |
| `scripts/` | 构建与工具脚本 |

## 写一章

1. 新建 `content/chapters/002.md`，文件头：

```markdown
---
卷: 第一卷 · 糖罐里的猫
章: 2
标题: 章名
---
```

2. 空行分段；支持 `## 小标题`、`> 引用`、`**粗体**`、`---` 分节线。

## 构建与发布

```bash
node scripts/build-chapters.mjs   # content/*.md → public/novel/ch/*.html + index.json
node scripts/build-pages.mjs      # public/ → pages-dist/
```

同步到 GitHub（改完就这样一条）：

```bash
npm run push
```

token 只存在本机 `secrets` 文件里，不写进仓库、不写进 shell 历史。

发布到 Cloudflare Pages（项目 `bubble-vanguard`），wrangler 在 Electron 的 node 模式下的启动方式见 `scripts/wr-preload.cjs` 文件头注释。

## 约定

- 正文是第一手事实来源；设定以 `docs/story-bible.md` 与 `docs/series-plan.md` 为准。
- 地下城层数**不封顶**：只允许写「已探明层数 / 已知带数 / 当前警戒带」，不写总数。
- 站内不出现内部生产词（AI/预览/占位/未上传等）。
