import { cp, mkdir, rm, stat, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const out = join(root, 'pages-dist');

// 纯静态站：public/ 原样拷贝到 pages-dist/，不再附带 _worker.js
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'public'), out, { recursive: true });

/** Cloudflare Web Analytics 信标：只注入真正的文档页（有 doctype）、跳过后台与正文片段。 */
const BEACON_TOKEN = 'd68160433b6d4f82a379f3094a6da0b7';
const BEACON = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${BEACON_TOKEN}"}'></script>`;

async function inject(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { await inject(p); continue; }
    if (!/\.html$/i.test(e.name)) continue;
    const rel = relative(out, p).split('\\').join('/');
    if (rel.startsWith('admin/') || rel === 'admin/index.html') continue; // 后台不统计
    const html = await readFile(p, 'utf8');
    if (!/<!doctype/i.test(html) || html.includes('cloudflareinsights.com')) continue; // 正文片段/已注入
    await writeFile(p, html.replace(/<\/head>/i, `  ${BEACON}\n</head>`), 'utf8');
  }
}
await inject(out);

async function countFiles(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? await countFiles(join(dir, e.name)) : 1;
  }
  return n;
}

const index = await stat(join(out, 'index.html'));
const files = await countFiles(out);
console.log(JSON.stringify({ out, indexBytes: index.size, files, worker: false }, null, 2));
