/*
 * 章节构建：content/chapters/*.md → 目录页列表 + 每章 HTML 片段 + 索引 JSON
 *
 * 用途：把「写字」和「做页面」分开。作者只写 md，页面自动生成。
 * 依赖：无（零依赖，只用 node 内置模块）。
 * 修改方式：
 *   - 想让 md 支持更多语法，改 renderBody()；
 *   - 想改列表长相，改 renderList()（样式在 public/new/assets/site.css 的 .chap / .vol）。
 * 运行：node scripts/build-chapters.mjs（在 bubble-vanguard-app 目录内）
 *
 * md 格式（front-matter 用 --- 包起来）：
 *   ---
 *   卷: 第一卷 · 糖罐里的猫
 *   章: 1
 *   标题: 糖罐里的猫
 *   副标题: 可空
 *   ---
 *
 *   正文第一段。
 *
 *   正文第二段。支持 **加粗**、> 引用、## 小标题、--- 分节线。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'content', 'chapters');
const OUT = path.join(ROOT, 'public', 'novel');
const OUT_CH = path.join(OUT, 'ch');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([^:：]+)\s*[:：]\s*(.*)$/);
    if (kv) meta[kv[1].trim()] = kv[2].trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

function inline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderBody(body) {
  const blocks = body.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  for (const block of blocks) {
    if (block === '---') {
      out.push('<hr>');
      continue;
    }
    if (block.startsWith('## ')) {
      out.push(`<h3>${inline(block.slice(3).trim())}</h3>`);
      continue;
    }
    if (block.startsWith('> ')) {
      const lines = block.split(/\r?\n/).map((l) => l.replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(lines.join(' '))}</p></blockquote>`);
      continue;
    }
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

function countChars(text) {
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length + (text.match(/[A-Za-z0-9]+/g) || []).length;
}

fs.mkdirSync(OUT_CH, { recursive: true });
if (!fs.existsSync(SRC)) fs.mkdirSync(SRC, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
const chapters = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(SRC, file), 'utf8');
  const { meta, body } = parseFrontMatter(raw);
  const n = Number(meta['章'] || file.match(/\d+/)?.[0]);
  if (!Number.isInteger(n) || n <= 0) {
    console.warn(`[skip] ${file}：缺少「章:」或文件名里没有数字`);
    continue;
  }
  const title = meta['标题'] || `第 ${n} 章`;
  const cast = (meta['出场'] || '').split(/[、,，]/).map((x) => x.trim()).filter(Boolean);
  const chars = countChars(body);
  chapters.push({
    n,
    vol: meta['卷'] || '未分卷',
    title,
    subtitle: meta['副标题'] || '',
    cast,
    chars,
    minutes: Math.max(1, Math.round(chars / 420)),
    updated: fs.statSync(path.join(SRC, file)).mtime.toISOString().slice(0, 10),
    file: `ch/${String(n).padStart(3, '0')}.html`
  });

  const html = renderBody(body);
  fs.writeFileSync(
    path.join(OUT_CH, `${String(n).padStart(3, '0')}.html`),
    `<!-- 由 scripts/build-chapters.mjs 从 content/chapters/${file} 生成，不要手改 -->\n${html}\n`
  );
}

chapters.sort((a, b) => a.n - b.n);

// 清掉不再对应 md 的旧章节文件
for (const f of fs.readdirSync(OUT_CH)) {
  if (!f.endsWith('.html')) continue;
  const n = Number(f.replace('.html', ''));
  if (!chapters.some((c) => c.n === n)) fs.unlinkSync(path.join(OUT_CH, f));
}

fs.writeFileSync(path.join(OUT_CH, 'index.json'), JSON.stringify({ chapters }, null, 2) + '\n');

/* ---------- 目录页列表 ---------- */
function renderList(list) {
  if (!list.length) {
    return `<div class="chap-empty">
          <p>正文还没有开始。</p>
          <p>等第一章写完，这里会出现第一行。</p>
        </div>`;
  }
  const byVol = new Map();
  for (const c of list) {
    if (!byVol.has(c.vol)) byVol.set(c.vol, []);
    byVol.get(c.vol).push(c);
  }
  let html = '';
  let vi = 0;
  for (const [vol, items] of byVol) {
    vi += 1;
    const totalChars = items.reduce((sum, c) => sum + c.chars, 0);
    html += `        <div class="vol__head">\n`;
    html += `          <span class="vol__no">VOL. ${String(vi).padStart(2, '0')}</span>\n`;
    html += `          <h2 class="vol__name" id="vol${vi}">${escapeHtml(vol)}</h2>\n`;
    html += `          <span class="vol__note">${items.length} 章 · 共 ${totalChars.toLocaleString('zh-CN')} 字</span>\n`;
    html += `        </div>\n\n`;
    html += `        <div class="chap-list">\n`;
    for (const c of items) {
      html += `          <button class="chap" type="button" data-ch="${c.n}">`;
      html += `<span class="chap__no">第 ${c.n} 章</span>`;
      html += `<span class="chap__name">${escapeHtml(c.title)}</span>`;
      html += `<span class="chap__state">${c.chars.toLocaleString('zh-CN')} 字 · ${c.minutes} 分钟</span>`;
      html += `</button>\n`;
    }
    html += `        </div>\n`;
  }
  return html.trimEnd();
}

const pagePath = path.join(OUT, 'index.html');
const page = fs.readFileSync(pagePath, 'utf8');
const START = '<!-- chapters:start -->';
const END = '<!-- chapters:end -->';
const s = page.indexOf(START);
const e = page.indexOf(END);
if (s === -1 || e === -1) {
  console.error(`[fail] public/novel/index.html 里找不到 ${START} / ${END} 标记`);
  process.exit(1);
}
const next = page.slice(0, s + START.length) + '\n' + renderList(chapters) + '\n        ' + page.slice(e);
fs.writeFileSync(pagePath, next);

/* ---------- 首页「最近更新」：由章节数据生成，避免手写空态与正文脱节 ---------- */
const homePath = path.join(ROOT, 'public', 'index.html');
if (fs.existsSync(homePath)) {
  const home = fs.readFileSync(homePath, 'utf8');
  const HS = '<!-- updates:start -->';
  const HE = '<!-- updates:end -->';
  const hs = home.indexOf(HS);
  const he = home.indexOf(HE);
  if (hs !== -1 && he !== -1) {
    let block;
    if (!chapters.length) {
      block = `
    <p class="updates__empty">还没有更新。第一章写完之后，这里会出现第一条。</p>
    `;
    } else {
      const latest = chapters.slice().sort((a, b) => b.n - a.n).slice(0, 3);
      block =
        '\n' +
        latest
          .map((c) =>
            [
              `    <a class="updates__item" href="/novel/#ch${c.n}">`,
              `      <span class="updates__no">第 ${c.n} 章</span>`,
              `      <span class="updates__t">${escapeHtml(c.title)}</span>`,
              `      <span class="updates__d">${c.chars.toLocaleString('zh-CN')} 字 · ${c.minutes} 分钟</span>`,
              `    </a>`,
            ].join('\n')
          )
          .join('\n') +
        '\n    ';
    }
    fs.writeFileSync(homePath, home.slice(0, hs + HS.length) + block + home.slice(he));
  }
}

console.log(
  JSON.stringify(
    { chapters: chapters.length, empty: chapters.length === 0, out: 'public/novel/ch', sample: chapters[0]?.file || null },
    null,
    2
  )
);
