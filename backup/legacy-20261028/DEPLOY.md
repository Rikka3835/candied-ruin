# 部署到 GitHub + Cloudflare

当前机器本地已经验证通过：

- `wrangler deploy --dry-run` 能打包 Worker 和 13 个静态资源。
- `wrangler dev --local` 能启动真实的 Worker + D1 绑定。
- 浏览器实际访问本地 Worker：22 张章节卡、章节阅读、下一章、手机布局都通过，无控制台错误。

还差的是**远端账号凭据**。仓库里没有任何 token，也没有远端 remote。

## 需要准备的两样东西

### 1. GitHub 空仓库

在 GitHub 新建一个空仓库（不要勾选 README / .gitignore / license），拿到地址，例如：

```text
https://github.com/你的用户名/bubble-vanguard.git
```

### 2. 两个 token

| 用途 | 需要的权限 |
| --- | --- |
| GitHub Personal Access Token | 只对目标仓库开放；Contents: Read and write |
| Cloudflare API Token | Account: Workers Scripts:Edit、D1:Edit、Account Settings:Read |

Cloudflare Account ID 在 Cloudflare 控制台右侧栏，或者 Workers 概览页的账户 ID 里。

> 建议用 fine-grained PAT，并把过期时间设短；部署完成后立刻撤销。

## 推荐：把凭据放在仓库外的本地文件

路径：

```text
C:\Users\44186\Documents\deepseek-harness\default-workspace\bubble-vanguard-secrets.txt
```

内容四行：

```text
GITHUB_REPO=https://github.com/你的用户名/bubble-vanguard.git
GITHUB_TOKEN=github_pat_...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
```

这个文件在仓库外，`.gitignore` 也覆盖不到它，但不会被提交。把文件建好之后回我一声即可。

我会做剩下的事：

1. 把本地 `main` 推到 GitHub。
2. 用 Cloudflare API 建 D1、拿 database_id、写回 `wrangler.jsonc`。
3. 执行 migration 和 22 章 seed。
4. 部署 Worker，访问线上 `/api/novel` 和首页做最后验证。

## 手动部署（如果你更想自己来）

```bash
git remote add origin https://github.com/你的用户名/bubble-vanguard.git
git push -u origin main

npx wrangler login
npx wrangler d1 create bubble-vanguard-db
# 把输出的 database_id 填进 wrangler.jsonc
npx wrangler d1 execute bubble-vanguard-db --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute bubble-vanguard-db --remote --file=./data/seed.sql
npx wrangler deploy
```

Windows 上如果 `node` 不在 PATH，使用：

```powershell
$node = "C:\Users\44186\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
& $node scripts\build-content.mjs
& $node node_modules\wrangler\bin\wrangler.js deploy
```

## 注意

- `content/`、`data/chapters.json`、`data/seed.sql` 已被 `.gitignore` 排除。小说正文不会进 GitHub，只会进 Cloudflare D1。
- 但 GitHub 仓库仍应设为 **private**，因为章节标题和摘要会在 API 响应里。
- 如果以后要隐藏书目，需要给 API 加登录或访问令牌；当前是公开只读。
