import { cp, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'pages-dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'public'), out, { recursive: true });
await copyFile(join(root, 'src', 'worker.js'), join(out, '_worker.js'));

const index = await stat(join(out, 'index.html'));
const worker = await stat(join(out, '_worker.js'));
console.log(JSON.stringify({
  out,
  indexBytes: index.size,
  workerBytes: worker.size,
  entry: true
}, null, 2));
