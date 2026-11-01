/* 生成 sitemap.xml（章节多了自动带 lastmod）。运行：npm run build:sitemap
 *
 * 2026-10-30：把 22 个「单章静态页」/novel/N/ 一并收进来（以前只有 4 条 URL）。
 * /game/ 与 /map/ 是 noindex，仍然不写。
 */
import { readFile, writeFile } from "node:fs/promises";

const SITE = "https://candied-ruin.pages.dev";
const idx = JSON.parse(await readFile("public/novel/ch/index.json", "utf8"));
const chapters = idx.chapters.slice().sort((a, b) => a.n - b.n);
const dates = chapters.map((c) => c.updated || "").filter(Boolean).sort();
const newest = dates[dates.length - 1] || new Date().toISOString().slice(0, 10);

const pages = [
  ["/", "1.0", newest],
  ["/novel/", "0.9", newest],
  ["/world/", "0.8", newest],
  ["/archive/", "0.5", newest],
];

const urls = [];
for (const [p, pr, lm] of pages) urls.push(`  <url><loc>${SITE}${p}</loc><lastmod>${lm}</lastmod><priority>${pr}</priority></url>`);
for (const c of chapters) {
  urls.push(`  <url><loc>${SITE}/novel/${c.n}/</loc><lastmod>${c.updated || newest}</lastmod><priority>0.7</priority></url>`);
}
/* 卷末后记：有几卷生成过就收几条 */
try {
  const afw = (await import("node:fs")).readdirSync("content/afterword").filter((f) => f.endsWith(".md"));
  for (const f of afw) {
    const n = Number(f.replace(/\D+/g, ""));
    if (n > 0) urls.push(`  <url><loc>${SITE}/novel/afterword/${n}/</loc><lastmod>${newest}</lastmod><priority>0.4</priority></url>`);
  }
} catch {}
await writeFile(
  "public/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
);

// robots 里必须能看见 sitemap（缺就补一句）
let robots = "";
try { robots = await readFile("public/robots.txt", "utf8"); } catch {}
if (robots && !/sitemap:/i.test(robots)) {
  robots = robots.trimEnd() + `\n\nSitemap: ${SITE}/sitemap.xml\n`;
  await writeFile("public/robots.txt", robots);
  console.log("robots.txt 补上 Sitemap 行");
}
console.log(`sitemap.xml 写好：${pages.length + chapters.length} 条（其中章节页 ${chapters.length} 条），lastmod ${newest}`);
