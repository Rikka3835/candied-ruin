/* 一键备份：本地内容 + 线上 D1 正文（阅读器真正读的那份）。
   产出：backups/<日期时间>/  ·  运行：npm run backup */
import { mkdir, cp, writeFile, readFile } from "node:fs/promises";

const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const dir = `backups/${stamp}`;
await mkdir(dir, { recursive: true });

await cp("content", `${dir}/content`, { recursive: true });
await cp("docs", `${dir}/docs`, { recursive: true, filter: (src) => !src.includes("node_modules") });

const raw = await readFile("public/novel/ch/index.json", "utf8");
const idx = JSON.parse(raw);
await writeFile(`${dir}/chapters-index.json`, raw);

const base = process.env.SITE || "https://candied-ruin.pages.dev";
let got = 0;
const failed = [];
for (const c of idx.chapters) {
  try {
    const r = await fetch(`${base}/api/chapters/${c.n}`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    await writeFile(`${dir}/d1-${String(c.n).padStart(3, "0")}.json`, JSON.stringify(j, null, 2));
    got++;
  } catch (e) {
    failed.push(c.n);
  }
}

console.log("备份完成 → " + dir);
console.log("  本地：content/ · docs/ · chapters-index.json");
console.log("  线上正文：" + got + " 章" + (failed.length ? "，失败：" + failed.join(", ") : ""));
