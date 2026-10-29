/* 双源对账：content/chapters/*.md ↔ 线上 /api/chapters/<n>（D1 里阅读器真正读的那份）。
   运行：npm run check:sync  ·  有不一致时退出码 1 */
import { readFile } from "node:fs/promises";

const base = process.env.SITE || "https://candied-ruin.pages.dev";
const idx = JSON.parse(await readFile("public/novel/ch/index.json", "utf8"));

const decode = (s) => s
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h\d|li|blockquote)>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
// 分场符：md 里是 `---`，渲染后是 <hr>（解码后为空），两边都要抹掉再比
const norm = (s) => decode(s)
  .replace(/^\s*-{3,}\s*$/gm, "")
  .replace(/[\s\u3000]/g, "")
  .replace(/[「」『』“”"'`]/g, "");

let bad = 0;
for (const c of idx.chapters) {
  const file = `content/chapters/${String(c.n).padStart(3, "0")}.md`;
  let md;
  try { md = await readFile(file, "utf8"); } catch { console.log(`第 ${c.n} 章：本地缺文件 ${file}`); bad++; continue; }
  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  let html = "";
  try {
    const r = await fetch(`${base}/api/chapters/${c.n}`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    html = j.html || j.content || "";
  } catch (e) {
    console.log(`第 ${c.n} 章：接口不可用（${e.message}）`);
    bad++;
    continue;
  }
  const a = norm(body), b = norm(html);
  if (a === b) { console.log(`第 ${c.n} 章 一致  ${a.length} 字`); continue; }
  bad++;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  console.log(`第 ${c.n} 章 不一致  本地 ${a.length} 字 / 线上 ${b.length} 字  首处分歧在第 ${i} 字`);
  console.log(`   本地：${a.slice(Math.max(0, i - 12), i + 24)}`);
  console.log(`   线上：${b.slice(Math.max(0, i - 12), i + 24)}`);
}
console.log(bad ? `\n需要处理：${bad} 章不一致（改过正文记得 npm run sync:d1）` : "\n全部一致");
process.exit(bad ? 1 : 0);
