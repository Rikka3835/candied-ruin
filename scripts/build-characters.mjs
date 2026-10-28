// docs/characters.md → public/archive/index.html
// 用法：node scripts/build-characters.mjs
// 规矩：人物卡的唯一正源是 docs/characters.md；改设定改 md，再跑这条命令。
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const md = await readFile(join(here, '..', 'docs', 'characters.md'), 'utf8');

const groups = [];
let group = null;
let person = null;

for (const raw of md.split(/\r?\n/)) {
  const line = raw.trimEnd();
  if (line.startsWith('### ')) {
    person = { name: line.slice(4).trim(), fields: [], body: [] };
    if (!group) { group = { title: '', people: [] }; groups.push(group); }
    group.people.push(person);
  } else if (line.startsWith('## ')) {
    const title = line.slice(3).trim();
    group = { title, people: [] };
    groups.push(group);
    person = null;
  } else if (person) {
    const m = line.match(/^- \*\*(.+?)\*\*：(.*)$/);
    if (m) person.fields.push([m[1].trim(), m[2].trim()]);
    else if (line.trim()) person.body.push(line.trim());
  }
}

// 只保留真的有人物的分组（“编辑为维奥拉定的立场”那种不是人物组）
const real = groups.filter((g) => g.people.length > 0);
const total = real.reduce((n, g) => n + g.people.length, 0);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const EXP = ['平静', '营业笑', '真笑', '炸毛', '装凶', '耳朵塌', '嫌甜', '认真鉴糖', '紧张', '忍着哭', '得意', '警戒'];
let ri = 0;
const rosterItems = real.flatMap((g) => g.people.map((p) => {
  ri += 1;
  const f = (k) => (p.fields.find((x) => x[0] === k) || ['', ''])[1];
  return { i: ri, name: p.name, tag: f('一句话'), hint: f('剪影'), race: f('种族/年龄'), role: f('身份'), want: f('愿望') };
}));
const roster = rosterItems.map((p) =>
  `        <button type="button" class="cast__rb" data-idx="${p.i}" data-name="${esc(p.name)}" data-tag="${esc(p.tag)}" data-hint="${esc(p.hint)}" data-race="${esc(p.race)}" data-role="${esc(p.role)}" data-want="${esc(p.want)}">${esc(p.name)}</button>`
).join('\n');
const exps = EXP.map((e, i) =>
  `          <button type="button" class="cast__ex" data-ex="${i + 1}" aria-pressed="${i === 0 ? 'true' : 'false'}"><span>${String(i + 1).padStart(2, '0')}</span>${e}</button>`
).join('\n');
let n = 0;
const cards = real.map((g, gi) => {
  const people = g.people.map((p) => {
    n += 1;
    const id = 'c' + n;
    const tag = p.fields.find((f) => f[0] === '一句话');
    const hint = (p.fields.find((f) => f[0] === '剪影') || ['', ''])[1];
    const fields = p.fields.filter((f) => f[0] === '剪影' ? false : f[0] !== '一句话');
    const rows = fields.map(([k, v]) => `        <div class="fld"><span class="fld__k">${esc(k)}</span><p class="fld__v">${inline(v)}</p></div>`).join('\n');
    const body = p.body.length ? `      <p class="card__tight">${inline(p.body.join(' '))}</p>\n` : '';
    return `    <article class="card" id="${id}" data-name="${esc(p.name)}" data-hint="${esc(hint)}">
      <header class="card__head">
        <span class="card__no">${String(n).padStart(2, '0')}</span>
        <h3 class="card__name">${esc(p.name)}</h3>
      </header>
${tag ? `      <p class="card__tag">${inline(tag[1])}</p>\n` : ''}${rows ? `      <div class="card__fields">\n${rows}\n      </div>\n` : ''}${body}    </article>`;
  }).join('\n\n');
  return `  <section class="grp" aria-labelledby="g${gi + 1}">
    <h2 class="grp__h" id="g${gi + 1}">${esc(g.title.replace(/^[一二三四五六七八九十]+、/, ''))}<span class="grp__n">${g.people.length} 人</span></h2>

${people}
  </section>`;
}).join('\n\n');

let k = 0;
const rail = real.map((g) => {
  const links = g.people.map((p) => { k += 1; return `      <a class="rail__a" href="#c${k}">${esc(p.name)}</a>`; }).join('\n');
  return `    <p class="rail__g">${esc(g.title.replace(/^[一二三四五六七八九十]+、/, ''))}</p>\n${links}`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>人物档案 · 糖渍旧蜜</title>
<meta name="description" content="《糖渍旧蜜》人物档案：${total} 位登场人物，每人一份完整设定——种族年龄、身份、愿望、外貌、装束、背景、性格、关系、与糖的关系、剧情功能、口癖。">
<meta name="theme-color" content="#f6f1e7">
<link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">
<link rel="icon" href="/assets/brand/icon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/brand/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/new/assets/fonts/sub/noto-serif-sc-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/new/assets/fonts-subset.css?v=20261029b">
<link rel="stylesheet" href="/new/assets/site.css?v=20261028l">
<link rel="stylesheet" href="/new/assets/paper.css?v=20261029t">
<link rel="canonical" href="https://bubble-vanguard.pages.dev/archive/">
<meta property="og:type" content="website">
<meta property="og:title" content="人物档案 · 糖渍旧蜜">
<meta property="og:description" content="${total} 位登场人物的完整设定：外貌、装束、背景、性格、口癖，以及每个人与糖的关系。">
<meta property="og:url" content="https://bubble-vanguard.pages.dev/archive/">
<meta property="og:image" content="https://bubble-vanguard.pages.dev/assets/brand/og-new.jpg">
<meta name="twitter:card" content="summary_large_image">
<style>
.arch__wrap {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 4.5rem);
  margin-top: 3.2rem;
}
.cast { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 2.4rem; margin: 2.4rem 0 3.2rem; align-items: start; }
.cast__art { position: relative; margin: 0; aspect-ratio: 3 / 4; border: 1px solid var(--line-2); background: linear-gradient(180deg, rgba(255,179,71,.05), rgba(255,179,71,.015)); display: grid; place-items: center; }
.cast__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: bottom center; }
.cast__mono { font-family: var(--font-serif, Georgia, serif); font-size: 5.4rem; color: var(--amber); opacity: .32; line-height: 1; }
.cast__note { position: absolute; left: 0; right: 0; bottom: .9rem; text-align: center; font-size: .68rem; letter-spacing: .12em; color: var(--text-dim); }
.cast.is-locked .cast__mono { opacity: .5; }
.cast.is-locked .cast__art { background: linear-gradient(180deg, rgba(40,30,20,.06), rgba(40,30,20,.02)); }
.cast__kicker { font-size: .68rem; letter-spacing: .18em; color: var(--amber); margin: 0 0 .7rem; }
.cast__name { font-size: clamp(1.8rem, 3.4vw, 2.4rem); margin: 0 0 .5rem; letter-spacing: .06em; }
.cast__tag { color: var(--caramel); margin: 0 0 1.4rem; font-size: .95rem; }
.cast__meta { margin: 0 0 1.6rem; padding: 0; }
.cast__meta > div { display: grid; grid-template-columns: 5.4rem minmax(0, 1fr); gap: 1rem; padding: .5rem 0; border-top: 1px solid var(--line-1, rgba(0,0,0,.08)); }
.cast__meta > div:last-child { border-bottom: 1px solid var(--line-1, rgba(0,0,0,.08)); }
.cast__meta dt { font-size: .7rem; letter-spacing: .12em; color: var(--text-dim); }
.cast__meta dd { margin: 0; font-size: .92rem; line-height: 1.8; color: var(--text); }
.cast__exps { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1.6rem; }
.cast__ex { font: inherit; font-size: .72rem; letter-spacing: .04em; color: var(--text-soft); background: none; border: 1px solid var(--line-2); padding: .3rem .55rem; cursor: pointer; display: inline-flex; gap: .35rem; align-items: baseline; }
.cast__ex span { color: var(--text-dim); font-size: .62rem; letter-spacing: .1em; }
.cast__ex[aria-pressed="true"] { color: var(--text); border-color: var(--amber); background: rgba(255,179,71,.12); }
.cast__ex:hover { border-color: var(--amber); }
.cast__roster { display: flex; flex-wrap: wrap; gap: .35rem 1.1rem; padding-top: 1.1rem; border-top: 1px solid var(--line-2); }
.cast__rb { font: inherit; font-size: .8rem; color: var(--text-soft); background: none; border: 0; padding: .15rem 0; cursor: pointer; letter-spacing: .04em; }
.cast__rb.is-on { color: var(--text); border-bottom: 1px solid var(--amber); }
.cast__rb.is-locked { color: var(--line-strong); pointer-events: none; }
@media (max-width: 820px) {
  .cast { grid-template-columns: minmax(0, 1fr); gap: 1.6rem; }
  .cast__panel { min-width: 0; }
  .cast__exps { max-width: 100%; }
  .cast__art { max-width: 300px; margin: 0 auto; width: 100%; }
  .cast__exps { flex-wrap: nowrap; overflow-x: auto; padding-bottom: .4rem; }
  .cast__ex { flex: 0 0 auto; }
}
.arch__wrap.no-rail { grid-template-columns: minmax(0, 1fr); }
.arch__rail.is-empty { display: none; }
.arch__rail {
  position: sticky;
  top: calc(var(--nav-h, 72px) + 2.4rem);
  align-self: start;
  font-size: 0.84rem;
}
.rail__g {
  margin: 1.5rem 0 0.45rem;
  font-size: 0.64rem;
  letter-spacing: 0.3em;
  color: var(--caramel);
}
.rail__g:first-child { margin-top: 0; }
.rail__a {
  display: block;
  padding: 0.26rem 0 0.26rem 0.72rem;
  color: var(--text-dim);
  text-decoration: none;
  border-left: 2px solid transparent;
  transition: color 0.18s, border-color 0.18s;
}
.rail__a:hover,
.rail__a:focus-visible { color: var(--honey); border-left-color: var(--line-strong); }
.arch__body { min-width: 0; }
.grp { margin-top: 3.4rem; }
.grp:first-child { margin-top: 0; }
.grp__h {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  margin: 0 0 0.2rem;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.grp__n {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 400;
  letter-spacing: 0.16em;
  color: var(--text-dim);
}
.card {
  padding: 2.1rem 0 2.4rem;
  border-top: 1px solid var(--line);
  scroll-margin-top: calc(var(--nav-h, 72px) + 1.5rem);
}
.card:first-of-type { border-top: 0; }
.card__head {
  display: flex;
  align-items: baseline;
  gap: 0.85rem;
  flex-wrap: wrap;
}
.card__no {
  font-size: 0.7rem;
  letter-spacing: 0.16em;
  color: var(--caramel);
}
.card__name {
  margin: 0;
  font-size: clamp(1.35rem, 2.6vw, 1.7rem);
  font-weight: 700;
  letter-spacing: 0.05em;
}
.card__tag {
  margin: 0.5rem 0 0;
  font-family: var(--font-ui, system-ui);
  font-size: 0.9rem;
  letter-spacing: 0.05em;
  color: var(--honey);
}
.card__fields {
  display: grid;
  gap: 0.9rem;
  margin-top: 1.5rem;
}
.fld {
  display: grid;
  grid-template-columns: 4.4rem minmax(0, 1fr);
  gap: 1rem;
}
.fld__k {
  padding-top: 0.42em;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  color: var(--text-dim);
}
.fld__v {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.98;
  letter-spacing: 0.02em;
  color: var(--text-soft);
}
.fld:first-child .fld__v { color: var(--text); }
.card__tight {
  margin: 1.3rem 0 0;
  font-size: 0.95rem;
  line-height: 2;
  color: var(--text-soft);
}
@media (max-width: 899px) {
  .arch__wrap { grid-template-columns: 1fr; gap: 1.4rem; margin-top: 2.2rem; }
  .arch__rail {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    padding: 0.9rem 0 1rem;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .rail__g { width: 100%; margin: 0.35rem 0 0.15rem; }
  .rail__a { padding: 0.1rem 0; border-left: 0; }
  .grp { margin-top: 2.4rem; }
  .fld { grid-template-columns: 3.5rem minmax(0, 1fr); gap: 0.75rem; }
  .fld__k { font-size: 0.66rem; }
  .fld__v { font-size: 0.92rem; line-height: 1.95; }
}
</style>
</head>
<body class="page-sheet">

  <a class="skip" href="#main">跳到正文</a>
<div class="bg" aria-hidden="true">
    <div class="bg__nebula"></div>
    <div class="bg__floor"></div>
    <div class="bg__lantern"></div>
    <div class="bg__grain"></div>
    <div class="bg__vignette"></div>
  </div>
  <div class="frame" aria-hidden="true"></div>

  <nav class="nav" aria-label="主导航">
    <a class="nav__back" href="/" aria-label="返回上一页"><span aria-hidden="true">←</span><em>返回</em></a>
    <a class="nav__brand" href="/">CANDIED RUIN<em>糖渍旧蜜</em></a>
    <span class="nav__spacer"></span><span class="nav__links">
    <a class="nav__link" href="/novel/">小说</a>
    <a class="nav__link is-current" href="/archive/" aria-current="page">人物档案</a>
    <a class="nav__link" href="/game/">游戏<i class="nav__tag">开发中</i></a>
    <a class="nav__link" href="/map/">世界地图<i class="nav__tag">开发中</i></a></span>
  </nav>

  <main id="main" class="page">
    <div class="page__inner">
      <p class="page__kicker rise" style="--i:0">ARCHIVE</p>
      <h1 class="page__title rise" style="--i:1">人物档案</h1>
      <p class="page__lede rise" style="--i:2">${total} 位登场人物。在这个世界里，一个人怎么对待糖，就等于他是什么人。</p>
      <div class="gal__bar rise" style="--i:2"><span>图鉴</span><span class="gal__count" id="galCount">已解锁 0 / 12</span><button type="button" class="gal__spoiler" id="galSpoiler" aria-pressed="false">剧透模式</button></div>

      <section class="cast" id="cast" aria-label="人物立绘">
        <figure class="cast__art">
          <img class="cast__img" id="castImg" alt="" hidden>
          <span class="cast__mono" id="castMono">琉</span>
          <figcaption class="cast__note">立绘待补 · 3:4 透明底</figcaption>
        </figure>
        <div class="cast__panel">
          <p class="cast__kicker">第 <span id="castNo">01</span> 位 · 共 ${total} 位</p>
          <h2 class="cast__name" id="castName">琉玥</h2>
          <p class="cast__tag" id="castTag">把味道翻译成话的人</p>
          <dl class="cast__meta" id="castMeta">
            <div><dt>种族/年龄</dt><dd data-k="race">—</dd></div>
            <div><dt>身份</dt><dd data-k="role">—</dd></div>
            <div><dt>愿望</dt><dd data-k="want">—</dd></div>
          </dl>
          <div class="cast__exps" role="group" aria-label="表情差分">${exps}</div>
          <nav class="cast__roster" id="castRoster" aria-label="切换人物">
${roster}
          </nav>
        </div>
      </section>

      <div class="arch__wrap">
        <nav class="arch__rail" aria-label="人物索引">
${rail}
        </nav>

        <div class="arch__body">
${cards}
        </div>
      </div>
    </div>
  </main>

  <footer class="foot">
    <span class="foot__name">CANDIED RUIN</span>
    <span class="foot__spacer"></span>
    <a href="/">返回首页</a>
  </footer>

  <script src="/new/assets/nav-back.js?v=20261028l" defer></script>
<script src="/new/assets/gallery.js?v=20261029a" defer></script>
</body>
</html>
`;

await writeFile(join(here, '..', 'public', 'archive', 'index.html'), html);
console.log('archive written:', total, 'people /', real.length, 'groups /', (html.length / 1024).toFixed(1) + 'KB');
