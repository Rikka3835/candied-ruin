import { cp, mkdir, rm, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'pages-dist');

// 纯静态站：public/ 原样拷贝到 pages-dist/，不再附带 _worker.js
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'public'), out, { recursive: true });

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
