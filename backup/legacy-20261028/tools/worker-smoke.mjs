import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(root, 'migrations', '0001_init.sql'), 'utf8'));
db.exec(fs.readFileSync(path.join(root, 'data', 'seed.sql'), 'utf8'));

function statement(sql) {
  return {
    bind(...args) {
      return {
        all: async () => ({ results: db.prepare(sql).all(...args) }),
        first: async () => db.prepare(sql).get(...args) || null,
        run: async () => ({ success: true })
      };
    },
    all: async () => ({ results: db.prepare(sql).all() }),
    first: async () => db.prepare(sql).get() || null
  };
}

const env = {
  DB: { prepare: statement },
  ASSETS: { fetch: async () => new Response('asset-ok') }
};

async function call(url) {
  const response = await worker.fetch(new Request(url), env, {});
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : await response.text();
  return { status: response.status, body };
}

const index = await call('http://local/api/novel');
const chapter = await call('http://local/api/novel/3');
const text = await call('http://local/api/novel/3/text');
const missing = await call('http://local/api/novel/99');
const asset = await call('http://local/');

const checks = {
  indexStatus: index.status,
  chapterCount: index.body.chapterCount,
  first: index.body.chapters?.[0]?.title,
  last: index.body.chapters?.at(-1)?.title,
  chapterStatus: chapter.status,
  chapterTitle: chapter.body.chapter?.title,
  next: chapter.body.next,
  sections: chapter.body.chapter?.sections?.length,
  textStatus: text.status,
  textStarts: String(text.body).slice(0, 28),
  missingStatus: missing.status,
  asset: asset.body
};

console.log(JSON.stringify(checks, null, 2));
if (checks.indexStatus !== 200 || checks.chapterCount !== 22 || checks.chapterStatus !== 200 || checks.next !== 4 || checks.missingStatus !== 404) {
  process.exitCode = 1;
}
