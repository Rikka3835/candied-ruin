/*
 * Local full-stack preview.
 *
 * Uses Node's built-in SQLite so the frontend can talk to the same read-only API
 * shape as the Cloudflare Worker without installing Wrangler.
 *
 * Run: node scripts/dev-server.mjs
 * Open: http://127.0.0.1:8788
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SCHEMA = path.join(ROOT, 'migrations', '0001_init.sql');
const SEED = path.join(ROOT, 'data', 'seed.sql');
const PORT = Number(process.env.PORT || 8788);

if (!fs.existsSync(SEED)) {
  console.error('data/seed.sql is missing. Run: node scripts/build-content.mjs');
  process.exit(1);
}

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(SCHEMA, 'utf8'));
db.exec(fs.readFileSync(SEED, 'utf8'));

const listStmt = db.prepare(
  `SELECT number, slug, ordinal, title, subtitle, kicker, volume, summary, quote,
          tags_json, sections_json, chars, minutes, updated_at
   FROM chapters ORDER BY number ASC`
);
const oneStmt = db.prepare(
  `SELECT number, slug, ordinal, title, subtitle, kicker, volume, summary, quote,
          tags_json, sections_json, chars, minutes, updated_at
   FROM chapters WHERE number = ?`
);
const prevStmt = db.prepare('SELECT number FROM chapters WHERE number < ? ORDER BY number DESC LIMIT 1');
const nextStmt = db.prepare('SELECT number FROM chapters WHERE number > ? ORDER BY number ASC LIMIT 1');

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapChapter(row, includeSections = false) {
  const chapter = {
    number: row.number,
    numberText: String(row.number).padStart(2, '0'),
    slug: row.slug,
    ordinal: row.ordinal,
    title: row.title,
    subtitle: row.subtitle,
    kicker: row.kicker,
    volume: row.volume,
    summary: row.summary,
    quote: row.quote,
    tags: parseJson(row.tags_json, []),
    chars: row.chars,
    minutes: row.minutes,
    sectionCount: parseJson(row.sections_json, []).length,
    updatedAt: row.updated_at
  };
  if (includeSections) chapter.sections = parseJson(row.sections_json, []);
  return chapter;
}

function chapterText(chapter) {
  const head = ['BUBBLE VANGUARD', chapter.volume, '', `${chapter.ordinal} ${chapter.title}`, chapter.subtitle || ''];
  const body = chapter.sections.map((section) => `${section.number}. ${section.title}\n\n${section.paras.join('\n\n')}`);
  return [...head, '', ...body].join('\n\n').trim() + '\n';
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*'
  });
  res.end(body);
}

function sendText(res, text, status = 200) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*'
  });
  res.end(text);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const requested = path.resolve(PUBLIC, relative);
  if (!requested.startsWith(PUBLIC + path.sep) && requested !== path.join(PUBLIC, 'index.html')) {
    return false;
  }
  let stat;
  try { stat = fs.statSync(requested); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(requested).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
    'x-content-type-options': 'nosniff'
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(requested).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    return res.end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, { error: 'method_not_allowed' }, 405);
  }

  if (pathname === '/api/novel' || pathname === '/api/novel/') {
    const rows = listStmt.all();
    const chapters = rows.map((row) => mapChapter(row, false));
    return sendJson(res, {
      title: 'BUBBLE VANGUARD',
      subtitle: '啵啵开荒团',
      volume: '第一卷 白榆之灯',
      chapterCount: chapters.length,
      chapters
    });
  }

  const textMatch = pathname.match(/^\/api\/novel\/(\d{1,2})\/text\/?$/);
  const chapterMatch = pathname.match(/^\/api\/novel\/(\d{1,2})\/?$/);
  if (textMatch || chapterMatch) {
    const number = Number((textMatch || chapterMatch)[1]);
    if (!Number.isInteger(number) || number < 1 || number > 22) {
      return sendJson(res, { error: 'chapter_not_found' }, 404);
    }
    const row = oneStmt.get(number);
    if (!row) return sendJson(res, { error: 'chapter_not_found' }, 404);
    const chapter = mapChapter(row, true);
    if (textMatch) return sendText(res, chapterText(chapter));
    return sendJson(res, {
      title: 'BUBBLE VANGUARD',
      volume: chapter.volume,
      chapter,
      prev: prevStmt.get(number)?.number ?? null,
      next: nextStmt.get(number)?.number ?? null
    });
  }

  if (pathname.startsWith('/api/')) return sendJson(res, { error: 'not_found' }, 404);

  if (serveStatic(req, res, pathname)) return;
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`BUBBLE VANGUARD local: http://127.0.0.1:${PORT}`);
  console.log('API: /api/novel  |  /api/novel/3  |  /api/novel/3/text');
});
