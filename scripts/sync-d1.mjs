#!/usr/bin/env node
/**
 * 把 content/chapters/*.md 同步进 D1 的 chapters 表。
 * 阅读器优先读 /api/chapters/<n>（D1），所以 md 改了而 D1 没同步时，
 * 线上会继续显示旧正文——这个脚本就是消除那个差异。
 *
 * 用法：node scripts/sync-d1.mjs          # 只生成 d1-sync.sql
 *       node scripts/sync-d1.mjs --apply  # 生成并推送到远端 D1
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const CH_DIR = path.join(ROOT, "content/chapters");
const OUT = path.join(ROOT, "d1-sync.sql");

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const rows = fs
  .readdirSync(CH_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => {
    const raw = fs.readFileSync(path.join(CH_DIR, f), "utf8");
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) throw new Error(`${f}: 缺少 front-matter`);
    const fm = {};
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const body = m[2].trim();
    return {
      n: Number(fm["章"] || 0),
      vol: fm["卷"] || "",
      title: fm["标题"] || "",
      subtitle: fm["副标题"] || "",
      cast: fm["出场"] || "",
      body,
      file: f,
    };
  });

if (!rows.length) throw new Error("content/chapters 里没有 md");

const now = new Date().toISOString();
const sql = [
  "DELETE FROM chapters;",
  ...rows.map(
    (r) =>
      `INSERT INTO chapters (n,vol,title,subtitle,cast,body,status,updated) VALUES (` +
      [r.n, r.vol, r.title, r.subtitle, r.cast, r.body, "published", now]
        .map((v) => (typeof v === "number" ? v : q(v)))
        .join(",") +
      ");"
  ),
  "",
].join("\n");

fs.writeFileSync(OUT, sql, "utf8");
console.log(
  rows.map((r) => `  #${r.n} ${r.title} ${r.body.length} 字`).join("\n")
);
console.log(`SQL 已写入 ${path.relative(ROOT, OUT)}（${rows.length} 章）`);

if (process.argv.includes("--apply")) {
  const SEC =
    process.env.SECRETS_FILE || "D:/桌面/candied-ruin-secrets.txt";
  if (!fs.existsSync(SEC))
    throw new Error(`找不到密钥文件：${SEC}（可用 SECRETS_FILE 指定）`);
  const secrets = fs.readFileSync(SEC, "utf8");
  const pick = (k) => (secrets.match(new RegExp(k + "=(.*)")) || [])[1]?.trim();
  const wrangler = path.join(
    ROOT,
    "node_modules/.pnpm/wrangler@4.152.0/node_modules/wrangler/wrangler-dist/cli.js"
  );
  // 用当前解释器自身的可执行文件：在 DSH 里跑时它就是 Electron（ELECTRON_RUN_AS_NODE=1 当 node 用）。
  // 以前写死 POSIX 路径 "/d/DSH/DeepSeek Harness.exe"，Windows 上 execFileSync 会 ENOENT。
  const NODE_EXE = process.env.NODE_EXE || process.execPath;
  execFileSync(
    NODE_EXE,
    [
      "-r",
      `${ROOT}\\scripts\\wr-preload.cjs`,
      wrangler,
      "d1",
      "execute",
      "candied-ruin-db",
      "--remote",
      `--file=${OUT}`,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        CLOUDFLARE_ACCOUNT_ID: pick("CLOUDFLARE_ACCOUNT_ID"),
        CLOUDFLARE_API_TOKEN: pick("CLOUDFLARE_API_TOKEN"),
      },
    }
  );
  console.log("已推送到远端 D1");
}
