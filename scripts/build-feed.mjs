/* 生成 /feed.xml（新章自动进）。运行：npm run build:feed
 *
 * 2026-10-30：条目改指「单章静态页」/novel/N/（以前指 /novel/#chN 锚点），
 * 并把摘要换成正文首段——订阅器里能看出这一章写的是什么，而不是只有字数。 */
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const SITE = "https://candied-ruin.pages.dev";
const idx = JSON.parse(await readFile("public/novel/ch/index.json", "utf8"));
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = [...idx.chapters].sort((a, b) => b.n - a.n);

function excerpt(n, max = 96) {
  try {
    const html = readFileSync(`public/novel/ch/${String(n).padStart(3, "0")}.html`, "utf8");
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > max ? text.slice(0, max) + "…" : text;
  } catch {
    return "";
  }
}

const items = list
  .map((c) => {
    const url = `${SITE}/novel/${c.n}/`;
    const desc = excerpt(c.n) || `${c.vol || ""} · ${c.chars || 0} 字`;
    return `    <item>
      <title>${esc(`第 ${c.n} 章 · ${c.title}`)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date((c.updated || "2026-10-28") + "T12:00:00+08:00").toUTCString()}</pubDate>
      <category>${esc(c.vol || "")}</category>
      <description>${esc(desc)}</description>
    </item>`;
  })
  .join("\n");

const newest = list[0] ? new Date((list[0].updated || "2026-10-28") + "T12:00:00+08:00").toUTCString() : new Date().toUTCString();

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>糖渍旧蜜 · CANDIED RUIN</title>
    <link>${SITE}/novel/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>一个靠舌头替整条街对账的猫族少女，攒三十四枚铜币买一颗糖。</description>
    <language>zh-CN</language>
    <lastBuildDate>${newest}</lastBuildDate>
${items}
  </channel>
</rss>
`;
await writeFile("public/feed.xml", xml);
console.log("feed.xml 写好：" + list.length + " 条（链接指向 /novel/N/）");
