/* 构建期预算检查（棘轮：按当前体积定上限，只能变小不能变大）。
   运行：npm run check:budget  ·  超限退出码 1 */
import { stat, readdir } from "node:fs/promises";
import { join } from "node:path";

const KB = 1024;
const RULES = [
  { re: /assets\/art\/.*900\.(jpg|webp|avif)$/i, max: 300 * KB, label: "首屏 900 档" },
  { re: /assets\/art\/.*1600\.avif$/i, max: 380 * KB, label: "首屏 1600 avif" },
  { re: /assets\/art\/.*1600\.webp$/i, max: 520 * KB, label: "首屏 1600 webp" },
  { re: /assets\/art\/.*1600\.jpg$/i, max: 760 * KB, label: "首屏 1600 jpg" },
  { re: /assets\/art\//i, max: 300 * KB, label: "插画" },
  { re: /assets\/cast\/.*plate-1200\.(jpg|webp)$/i, max: 430 * KB, label: "立绘 1200" },
  { re: /assets\/cast\/.*plate-2000\.(jpg|webp)$/i, max: 880 * KB, label: "立绘 2000" },
  { re: /assets\/fonts\/.*\.woff2$/i, max: 800 * KB, label: "字体" },
  { re: /\.js$/i, max: 60 * KB, label: "脚本" },
  { re: /\.html$/i, max: 120 * KB, label: "页面" },
];

const over = [];
const rows = [];

async function walk(dir, out = []) {
  let ents = [];
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

async function check(dir, only, label) {
  const files = await walk(dir);
  let count = 0, sum = 0;
  for (const f of files) {
    const norm = f.split("\\").join("/");
    if (only && !only.test(norm)) continue;
    const rule = RULES.find((r) => r.re.test(norm));
    if (!rule) continue;
    const size = (await stat(f)).size;
    count++;
    sum += size;
    if (size > rule.max) {
      over.push(`${norm}  ${(size / KB).toFixed(0)}KB > ${(rule.max / KB).toFixed(0)}KB（${rule.label}）`);
    }
  }
  if (count) rows.push(`${label}: ${count} 个文件，共 ${(sum / KB).toFixed(0)}KB`);
}

await check("public/new/assets/art", /\.(jpg|png|webp|avif)$/i, "插画");
await check("public/new/assets/cast", /\.(jpg|png|webp|avif)$/i, "立绘");
await check("public/new/assets/fonts", /\.(woff2|woff)$/i, "字体");
await check("public/new/assets", /\.js$/i, "脚本");
await check("pages-dist", /\.html$/i, "页面");

console.log(rows.join("\n"));
console.log("规则：" + RULES.map((r) => `${r.label} ≤ ${(r.max / KB).toFixed(0)}KB`).join(" · "));
if (over.length) {
  console.log("\n超限 " + over.length + " 个：");
  over.forEach((o) => console.log("  " + o));
  process.exit(1);
}
console.log("\n全部在预算内");
