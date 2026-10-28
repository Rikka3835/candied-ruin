// 只取标题用字（scripts/_head-chars.txt, ~485 字）的 Noto Serif SC 700 子集。
// 用法：node scripts/fetch-head-font.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chars = (await readFile(join(here, '_head-chars.txt'), 'utf8')).trim();
const outDir = join(here, '..', 'public', 'new', 'assets', 'fonts', 'sub');
const outFile = join(outDir, 'noto-serif-sc-700-head.woff2');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const url = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700&text=' + encodeURIComponent(chars);

const res = await fetch(url, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error('css fetch failed: ' + res.status);
const css = await res.text();
const m = css.match(/url\((https:[^)]+)\)/);
if (!m) throw new Error('no woff2 in css:\n' + css.slice(0, 300));

const buf = Buffer.from(await (await fetch(m[1])).arrayBuffer());
await mkdir(outDir, { recursive: true });
await writeFile(outFile, buf);
console.log('700 subset written', outFile, (buf.length / 1024).toFixed(0) + 'KB', 'chars', chars.length);
