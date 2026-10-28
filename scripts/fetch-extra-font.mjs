// 补字子集：400 正文里 GB2312 一级覆盖不到、但站点/设定集里会出现的字（薇、玥、痣、簪、髻…）。
// 与主 400 字体同 family、同 weight，用 unicode-range 分片：只有这几十个字走这个文件。
// 用法：node scripts/fetch-extra-font.mjs  → 写 woff2 + 打印 unicode-range 片段
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chars = (await readFile(join(here, '_extra-chars.txt'), 'utf8')).trim();
const outDir = join(here, '..', 'public', 'new', 'assets', 'fonts', 'sub');
const outFile = join(outDir, 'noto-serif-sc-400-extra.woff2');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const url = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400&text=' + encodeURIComponent(chars);

const res = await fetch(url, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error('css fetch failed: ' + res.status);
const css = await res.text();
const m = css.match(/url\((https:[^)]+)\)/);
if (!m) throw new Error('no woff2 in css:\n' + css.slice(0, 300));

const buf = Buffer.from(await (await fetch(m[1])).arrayBuffer());
await mkdir(outDir, { recursive: true });
await writeFile(outFile, buf);

const ranges = [...chars].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
console.log('400 extra written', outFile, (buf.length / 1024).toFixed(0) + 'KB', 'chars', chars.length);
console.log('unicode-range:', ranges.join(', '));
