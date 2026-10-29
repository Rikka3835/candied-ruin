/* 生成 sitemap.xml（章节多了自动带 lastmod）。运行：npm run build:sitemap */
import { readFile, writeFile, readdir } from "node:fs/promises";

const SITE = "https://candied-ruin.pages.dev";
const idx = JSON.parse(await readFile("public/novel/ch/index.json", "utf8"));
const dates = idx.chapters.map((c) => c.updated || "").filter(Boolean).sort();
const newest = dates[dates.length - 1] || new Date().toISOString().slice(0, 10);

const pages = [
  ["/", "1.0", newest],
  ["/novel/", "0.9", newest],
  ["/world/", "0.8", newest],
  ["/archive/", "0.5", newest],
];

// 只收被索引的页面：/game/ 与 /map/ 是 noindex，不写进 sitemap
const urls = pages.map(([p, pr, lm]) => `  <url><loc>${SITE}${p}</loc><lastmod>${lm}</lastmod><priority>${pr}</priority></url>`).join("\n");
await writeFile("public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

// robots 里必须能看见 sitemap（缺就补一句）
let robots = "";
try { robots = await readFile("public/robots.txt", "utf8"); } catch {}
if (robots && !/sitemap:/i.test(robots)) {
  robots = robots.trimEnd() + `\n\nSitemap: ${SITE}/sitemap.xml\n`;
  await writeFile("public/robots.txt", robots);
  console.log("robots.txt 补上 Sitemap 行");
}
console.log("sitemap.xml 写好：" + pages.length + " 条，lastmod " + newest);
