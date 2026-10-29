/* 生成 /feed.xml（新章自动进）。运行：npm run build:feed */
import { readFile, writeFile } from "node:fs/promises";

const SITE = "https://candied-ruin.pages.dev";
const idx = JSON.parse(await readFile("public/novel/ch/index.json", "utf8"));
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = [...idx.chapters].sort((a, b) => b.n - a.n).slice(0, 20);

const items = list.map((c) => `    <item>
      <title>${esc(`第 ${c.n} 章 · ${c.title}`)}</title>
      <link>${SITE}/novel/#ch${c.n}</link>
      <guid isPermaLink="true">${SITE}/novel/#ch${c.n}</guid>
      <pubDate>${new Date((c.updated || "2026-10-28") + "T12:00:00+08:00").toUTCString()}</pubDate>
      <description>${esc((c.vol || "") + " · " + (c.chars || 0) + " 字")}</description>
    </item>`).join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>糖渍旧蜜 · CANDIED RUIN</title>
    <link>${SITE}/novel/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>一个靠舌头替整条街对账的猫族少女，攒三十四枚铜币买一颗糖。</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>
`;
await writeFile("public/feed.xml", xml);
console.log("feed.xml 写好：" + list.length + " 条");
