// Fetch Noto Serif SC (400/600) from Google Fonts, self-host subsets locally.
// Run: node scripts/fetch-fonts.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'new', 'assets', 'fonts');
const cssPath = join(here, '..', 'public', 'new', 'assets', 'fonts.css');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SRC = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600&display=swap';

const res = await fetch(SRC, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error('css fetch failed: ' + res.status);
let css = await res.text();

const urls = [...new Set([...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((m) => m[1]))];
await mkdir(outDir, { recursive: true });

const map = new Map();
let index = 0;
for (const url of urls) {
  const name = 'noto-serif-sc-' + String(index).padStart(3, '0') + '.woff2';
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(join(outDir, name), buf);
  map.set(url, name);
  index += 1;
}

for (const [url, name] of map) {
  css = css.split(url).join('./fonts/' + name);
}

const header = '/* Noto Serif SC 400/600 —— 自托管子集，由 scripts/fetch-fonts.mjs 生成，勿手改 */\n';
await writeFile(cssPath, header + css, 'utf8');
console.log('fonts:', map.size, 'css bytes:', css.length);
