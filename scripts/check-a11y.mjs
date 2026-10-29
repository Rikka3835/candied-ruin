/* 静态可访问性体检（不依赖浏览器）。
   运行：npm run check:a11y */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function walk(dir, out = []) {
  let ents = [];
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.html$/i.test(e.name)) out.push(p);
  }
  return out;
}
const all = await walk("pages-dist");
const fragments = [];
const files = [];
for (const f of all) {
  const html = await readFile(f, "utf8");
  // 章节正文是「片段」（供阅读器 fetch 注入），不是独立文档：跳过文档级检查
  if (!/<!doctype/i.test(html)) { fragments.push(f.replace(/^pages-dist\//, "/")); continue; }
  files.push(f);
}
const problems = [];
const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "").trim();

for (const f of files) {
  const html = await readFile(f, "utf8");
  const rel = f.replace(/^pages-dist\//, "/");
  const bad = (msg) => problems.push(`${rel}: ${msg}`);

  if (!/<html[^>]+lang="zh-CN"/i.test(html)) bad("html 缺 lang=zh-CN");
  if (!/<meta[^>]+name="viewport"/i.test(html)) bad("缺 viewport");
  if (!/<main\b/i.test(html)) bad("缺 <main>");
  if (!/class="skip"|class="[^"]*skip-link|href="#main"/i.test(html)) bad("缺跳转主内容的链接");

  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1 === 0) bad("缺 h1");
  if (h1 > 1) bad(`h1 有 ${h1} 个`);

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=/.test(m[0])) bad("img 缺 alt：" + m[0].slice(0, 60));
  }
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = m[1] || "", inner = m[2] || "";
    const labelled = /aria-label=|aria-labelledby=|title=/.test(attrs);
    if (!labelled && !stripTags(inner)) bad("按钮无可读文本：" + m[0].replace(/\s+/g, " ").slice(0, 70));
  }
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1] || "", inner = m[2] || "";
    if (/aria-label=|title=/.test(attrs)) continue;
    if (!stripTags(inner) && !/<img\b[^>]*alt="[^"]+"/i.test(inner)) bad("链接无可读文本：" + m[0].replace(/\s+/g, " ").slice(0, 70));
  }
  const ids = new Map();
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
  for (const [id, n] of ids) if (n > 1) bad(`重复 id="${id}" ×${n}`);
}

console.log(`检查 ${files.length} 个页面` + (fragments.length ? `（跳过 ${fragments.length} 个正文片段：${fragments.slice(0, 3).join(" ")}${fragments.length > 3 ? " …" : ""}）` : ""));
if (!problems.length) { console.log("未发现问题"); process.exit(0); }
console.log(`发现 ${problems.length} 处：`);
problems.forEach((p) => console.log("  " + p));
process.exit(1);
