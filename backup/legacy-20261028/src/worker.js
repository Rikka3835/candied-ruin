const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60, s-maxage=300',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS'
};

const TEXT_HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'public, max-age=60, s-maxage=300',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS'
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extra }
  });
}

function parseNumber(value) {
  if (!/^\d+$/.test(value || '')) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 22 ? number : null;
}

// 小说正在按新正史重写：旧 22 章正文不再对外提供。
// 新正文入库后，把这里改成 false 即可恢复。
const NOVEL_REWRITING = true;

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
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
  const head = [
    'BUBBLE VANGUARD',
    chapter.volume,
    '',
    `${chapter.ordinal} ${chapter.title}`,
    chapter.subtitle || '',
    ''
  ].filter((line, index) => index < 3 || line !== '');
  const body = chapter.sections.map((section) => {
    const heading = `${section.number}. ${section.title}`;
    return `${heading}\n\n${section.paras.join('\n\n')}`;
  });
  return [...head, '', ...body].join('\n\n').trim() + '\n';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...JSON_HEADERS, 'content-length': '0' } });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD, OPTIONS' });
    }

    if (url.pathname === '/api/novel' || url.pathname === '/api/novel/') {
      if (NOVEL_REWRITING) {
        return json({
          title: 'BUBBLE VANGUARD',
          subtitle: '啵啵开荒团',
          volume: '第一卷',
          state: 'rewriting',
          chapterCount: 0,
          chapters: []
        });
      }
      if (!env.DB) return json({ error: 'database_not_configured' }, 503);
      try {
        const { results } = await env.DB.prepare(
          `SELECT number, slug, ordinal, title, subtitle, kicker, volume, summary, quote,
                  tags_json, sections_json, chars, minutes, updated_at
           FROM chapters ORDER BY number ASC`
        ).all();
        const chapters = (results || []).map((row) => mapChapter(row, false));
        return json({
          title: 'BUBBLE VANGUARD',
          subtitle: '啵啵开荒团',
          volume: '第一卷 白榆之灯',
          chapterCount: chapters.length,
          chapters
        });
      } catch (err) {
        console.error('novel index failed', err);
        return json({ error: 'database_error' }, 500);
      }
    }

    const textMatch = url.pathname.match(/^\/api\/novel\/(\d{1,2})\/text\/?$/);
    const chapterMatch = url.pathname.match(/^\/api\/novel\/(\d{1,2})\/?$/);

    if (textMatch || chapterMatch) {
      if (NOVEL_REWRITING) return json({ error: 'novel_rewriting' }, 404);
      if (!env.DB) return json({ error: 'database_not_configured' }, 503);
      const number = parseNumber((textMatch || chapterMatch)[1]);
      if (!number) return json({ error: 'chapter_not_found' }, 404);
      try {
        const row = await env.DB.prepare(
          `SELECT number, slug, ordinal, title, subtitle, kicker, volume, summary, quote,
                  tags_json, sections_json, chars, minutes, updated_at
           FROM chapters WHERE number = ?1`
        ).bind(number).first();
        if (!row) return json({ error: 'chapter_not_found' }, 404);

        const chapter = mapChapter(row, true);
        if (textMatch) {
          return new Response(chapterText(chapter), { status: 200, headers: TEXT_HEADERS });
        }

        const prev = number > 1 ? Number((await env.DB.prepare(
          'SELECT number FROM chapters WHERE number < ?1 ORDER BY number DESC LIMIT 1'
        ).bind(number).first() || {}).number) || null : null;
        const next = number < 22 ? Number((await env.DB.prepare(
          'SELECT number FROM chapters WHERE number > ?1 ORDER BY number ASC LIMIT 1'
        ).bind(number).first() || {}).number) || null : null;

        return json({
          title: 'BUBBLE VANGUARD',
          volume: chapter.volume,
          chapter,
          prev,
          next
        });
      } catch (err) {
        console.error('novel chapter failed', err);
        return json({ error: 'database_error' }, 500);
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, 404);
    }

    if (!env.ASSETS) {
      return new Response('Static assets binding is not configured.', { status: 503 });
    }
    return env.ASSETS.fetch(request);
  }
};
