#!/usr/bin/env node
/* ============================================================
   内链体检 · scripts/check-links.mjs
   ------------------------------------------------------------
   扫 public 下所有 .html，抽出站内链接（href/src 以 / 开头），
   逐个确认目标文件真的存在。Cloudflare Pages 会把 /xxx.html
   308 到 /xxx，所以两种写法都算命中。

   用法：node scripts/check-links.mjs [--verbose]
   退出码：0 全通 / 1 有死链
   ============================================================ */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const verbose = process.argv.includes("--verbose");

/** 递归收集 public 下的 html */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (extname(name) === ".html") out.push(p);
  }
  return out;
}

const isFile = (p) => {
  try { return statSync(p).isFile(); } catch { return false; }
};

/** 把站内路径映射到磁盘路径，命中返回 true */
function resolves(urlPath) {
  const clean = urlPath.split("#")[0].split("?")[0];
  if (!clean) return true;                       // 纯锚点
  const base = join(PUBLIC, clean);
  if (isFile(base)) return true;                 // /assets/x.css
  if (isFile(join(base, "index.html"))) return true;  // /game/
  if (!extname(clean) && isFile(base + ".html")) return true; // /world -> world.html
  return false;
}

const pages = walk(PUBLIC);
const ATTR = /(?:href|src)\s*=\s*"([^"]*)"/g;
const broken = [];
const ext = [];
let checked = 0;

for (const file of pages) {
  const rel = file.slice(PUBLIC.length + 1).replace(/\\/g, "/");
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(ATTR)) {
    const url = m[1].trim();
    if (!url) continue;
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(url)) {
      if (/^https?:\/\//i.test(url) && verbose) ext.push(`${rel} → ${url}`);
      continue;
    }
    if (!url.startsWith("/")) continue;          // 相对路径不管（本仓库全部用绝对路径）
    checked++;
    if (!resolves(url)) broken.push(`${rel} → ${url}`);
  }
}

console.log(`扫描 ${pages.length} 个页面，检查 ${checked} 条站内链接`);
if (verbose && ext.length) {
  console.log(`\n外部链接 ${ext.length} 条（不检查）：`);
  for (const e of ext) console.log(`  ${e}`);
}
if (broken.length) {
  console.log(`\n✗ 死链 ${broken.length} 条：`);
  for (const b of [...new Set(broken)]) console.log(`  ${b}`);
  process.exit(1);
}
console.log("✓ 没有死链");
