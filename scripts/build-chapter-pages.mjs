/*
 * 单章静态页：content/chapters → public/novel/<n>/index.html（可直接打开、可被搜索引擎与社交抓取）
 *
 * 背景：阅读器是单页应用，正文由 JS 取回片段后注入；/novel/ch/012.html 只是一个 `<p>` 片段，
 *       既没有标题也没有分享卡，搜索引擎和聊天软件都拿不到内容。这个脚本把每章生成成真正的网页：
 *       全文在 HTML 里、有标题/摘要/分享卡/结构化数据/上下章，读者点开就能读。
 *
 * 依赖：public/novel/ch/index.json 与 public/novel/ch/NNN.html（先跑 build-chapters.mjs）。
 * 输出：public/novel/<n>/index.html（URL 形如 /novel/12/，与 /novel/ch/012.html 不冲突）
 * 运行：node scripts/build-chapter-pages.mjs
 *
 * 修改方式：
 *   - 版式全部在 public/new/assets/chapter-page.css，这里只出结构，不写样式；
 *   - 分享卡图在 public/assets/og/ch-NN.jpg，由 scripts/make-chapter-cards.py 生成；
 *     没有图时自动退回品牌图，不会出现死链。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUB = path.join(ROOT, 'public');
const SRC = path.join(PUB, 'novel', 'ch');
const SITE = 'https://candied-ruin.pages.dev';
const AUTHOR = 'Rikka';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const strip = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/* 摘要：在句末断开，别把句子切一半（78 + 句末容差，落在 Google/Baidu 约 80–100 字的显示区间） */
function excerpt(text, max = 78) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 24);
  const m = cut.match(/^[\s\S]*[。！？；…”」]/);
  const out = (m ? m[0] : text.slice(0, max)).replace(/[，、；：,;:]$/, '');
  return out + '…';
}

const idx = JSON.parse(fs.readFileSync(path.join(SRC, 'index.json'), 'utf8'));
const chapters = idx.chapters.slice().sort((a, b) => a.n - b.n);
if (!chapters.length) {
  console.log(JSON.stringify({ pages: 0, note: '没有章节，跳过' }, null, 2));
  process.exit(0);
}

/* 卷序号：按首次出现顺序编号 */
const vols = [];
for (const c of chapters) if (!vols.includes(c.vol)) vols.push(c.vol);
const volInfo = (c) => {
  const i = vols.indexOf(c.vol) + 1;
  const short = String(c.vol).split('·')[0].trim() || `第 ${i} 卷`;
  return { no: String(i).padStart(2, '0'), short, full: c.vol };
};

const THEME_NAV = (cur) => `<nav class="nav" aria-label="主导航">
    <a class="nav__back" href="/" aria-label="返回上一页"><span aria-hidden="true">←</span><em>返回</em></a>
    <a class="nav__brand" href="/">CANDIED RUIN<em>糖渍旧蜜</em></a>
    <span class="nav__spacer"></span><span class="nav__links">
    <a class="nav__link${cur === 'novel' ? ' is-current' : ''}" href="/novel/"${cur === 'novel' ? ' aria-current="page"' : ''}>小说</a>
    <a class="nav__link" href="/archive/">人物档案</a>
    <a class="nav__link" href="/world/">前言</a>
    <a class="nav__link" href="/game/">游戏<i class="nav__tag">开发中</i></a>
    <a class="nav__link" href="/map/">世界地图</a></span>
  </nav>`;

function sideLink(c, dir) {
  if (!c) {
    const label = dir === 'prev' ? '已经是第一章' : '已经是最新一章';
    return `<span class="chp-nav__side is-off" aria-hidden="true"><span class="chp-nav__k">${label}</span><span class="chp-nav__t">—</span></span>`;
  }
  const k = dir === 'prev' ? '上一章' : '下一章';
  const cls = dir === 'next' ? ' chp-nav__side--next' : '';
  return `<a class="chp-nav__side${cls}" href="/novel/${c.n}/" rel="${dir}"><span class="chp-nav__k">${k} · 第 ${c.n} 章</span><span class="chp-nav__t">${esc(c.title)}</span></a>`;
}

const written = [];
for (let i = 0; i < chapters.length; i++) {
  const c = chapters[i];
  const prev = chapters[i - 1] || null;
  const next = chapters[i + 1] || null;
  const v = volInfo(c);

  const fragPath = path.join(SRC, String(c.n).padStart(3, '0') + '.html');
  const body = fs.readFileSync(fragPath, 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '').trim();
  const plain = strip(body);
  const desc = excerpt(plain);
  const url = `${SITE}/novel/${c.n}/`;

  const ogCard = path.join(PUB, 'assets', 'og', 'ch-' + String(c.n).padStart(2, '0') + '.jpg');
  const ogRel = fs.existsSync(ogCard) ? `/assets/og/ch-${String(c.n).padStart(2, '0')}.jpg` : '/assets/brand/og-new.jpg';

  const pageTitle = `第 ${c.n} 章 · ${c.title} — 糖渍旧蜜`;
  const metaLine = [
    `第 ${c.n} 章`,
    `${c.chars.toLocaleString('zh-CN')} 字`,
    `约 ${c.minutes} 分钟`,
    c.updated,
  ]
    .map((t) => `<span>${esc(t)}</span>`)
    .join('');

  const chapterLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Chapter',
        name: `第 ${c.n} 章 · ${c.title}`,
        headline: c.title,
        url,
        position: c.n,
        inLanguage: 'zh-CN',
        wordCount: c.chars,
        dateModified: c.updated,
        isPartOf: {
          '@type': 'Book',
          name: '糖渍旧蜜',
          alternateName: 'CANDIED RUIN',
          url: `${SITE}/novel/`,
          inLanguage: 'zh-CN',
          author: { '@type': 'Person', name: AUTHOR },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: '小说', item: `${SITE}/novel/` },
          { '@type': 'ListItem', position: 3, name: `第 ${c.n} 章 · ${c.title}`, item: url },
        ],
      },
    ],
  };

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#f6f1e7">
<meta property="og:type" content="article">
<meta property="og:site_name" content="糖渍旧蜜">
<meta property="og:title" content="第 ${c.n} 章 · ${esc(c.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${ogRel}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="article:published_time" content="${c.updated}">
<meta property="article:section" content="${esc(v.full)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="第 ${c.n} 章 · ${esc(c.title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}${ogRel}">
<link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">
<link rel="icon" href="/assets/brand/icon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/assets/brand/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/assets/brand/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="糖渍旧蜜 · 更新" href="/feed.xml">
<link rel="canonical" href="${url}">
<link rel="preload" href="/new/assets/fonts/sub/noto-serif-sc-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/new/assets/fonts-subset.css?v=20261029b">
<link rel="stylesheet" href="/new/assets/site.css?v=20261030b">
<link rel="stylesheet" href="/new/assets/paper.css?v=20261029q">
<link rel="stylesheet" href="/new/assets/chapter-page.css?v=20261030c">
<script type="application/ld+json">${JSON.stringify(chapterLd)}</script>
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

  ${THEME_NAV('novel')}

  <main id="main" class="chp">
    <article class="chp__sheet">
      <a class="chp__back" href="/novel/"><span aria-hidden="true">←</span> 目录</a>
      <p class="chp__kicker">VOL. ${v.no} · ${esc(v.short)}</p>
      <h1 class="chp__title">${esc(c.title)}</h1>
      <p class="chp__meta">${metaLine}</p>
      <div class="chp__rule" aria-hidden="true"></div>

      <div class="chp__body reader-view__body">
${body}
      </div>

      <nav class="chp-nav" aria-label="翻章">
        ${sideLink(prev, 'prev')}
        <a class="chp-nav__mid" href="/novel/">目录</a>
        ${sideLink(next, 'next')}
      </nav>

      <p class="chp-tools"><a href="/novel/#ch${c.n}">用阅读器读这一章</a><span>可调字号、行距与夜读</span><button class="chp-tools__copy" type="button" data-copy="${url}">复制本页链接</button><span class="chp-tools__ok" role="status" hidden>已复制</span></p>
    </article>
  </main>

  <footer class="foot">
    <span class="foot__name">CANDIED RUIN</span>
    <span class="foot__spacer"></span>
    <a href="/novel/">全部章节</a>
    <a href="/">返回首页</a>
  </footer>

  <div class="progress-top" aria-hidden="true"><div class="progress-top__bar" id="chpProgress"></div></div>

  ${
    next
      ? `<a class="chp-jump" href="/novel/${next.n}/" aria-label="下一章：第 ${next.n} 章 ${esc(next.title)}">
    <span class="chp-jump__k">下一章</span>
    <span class="chp-jump__t">第 ${next.n} 章 · ${esc(next.title)}</span>
    <span class="chp-jump__arrow" aria-hidden="true">→</span>
  </a>`
      : `<a class="chp-jump" href="/novel/" aria-label="已是最后一章，回到目录">
    <span class="chp-jump__k">已是最后一章</span>
    <span class="chp-jump__t">回目录</span>
    <span class="chp-jump__arrow" aria-hidden="true">→</span>
  </a>`
  }

<script>
/* 与阅读器共用偏好与进度：在这个页面读到哪里，回目录「继续读」接得上 */
(function () {
  var S = { s: "16px", m: "18px", l: "20px", xl: "22px" };
  var L = { tight: "1.75", normal: "1.95", loose: "2.2" };
  try {
    var p = JSON.parse(localStorage.getItem("cr.reader") || "{}");
    var r = document.documentElement.style;
    r.setProperty("--rs", S[p.size] || S.m);
    r.setProperty("--rlh", L[p.leading] || L.normal);
  } catch (e) {}
  var N = ${c.n};
  var bar = document.getElementById("chpProgress");
  var top = document.querySelector(".progress-top");
  var ticking = false;
  function paint() {
    ticking = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    if (bar) bar.style.width = (ratio * 100).toFixed(2) + "%";
    if (top) top.classList.toggle("is-on", ratio > 0.004 && ratio < 0.999);
    if (ratio <= 0.01) return;
    try {
      localStorage.setItem("cr.maxch", String(Math.max(Number(localStorage.getItem("cr.maxch") || 0), N)));
      localStorage.setItem("cr.progress", JSON.stringify({ n: N, ratio: ratio, at: Date.now() }));
    } catch (e) {}
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(paint); }
  }, { passive: true });
  window.addEventListener("resize", paint, { passive: true });
  paint();

  /* 手机吸底「下一章」：过了章首才出现，读到翻章卡时让位消失 */
  var jump = document.querySelector(".chp-jump");
  if (jump && "IntersectionObserver" in window) {
    var headPassed = false, navSeen = false;
    var sync = function () { jump.classList.toggle("is-on", headPassed && !navSeen); };
    var rule = document.querySelector(".chp__rule");
    var nav = document.querySelector(".chp-nav");
    if (rule) new IntersectionObserver(function (es) {
      headPassed = !es[0].isIntersecting && es[0].boundingClientRect.top < 0;
      sync();
    }, { threshold: 0 }).observe(rule);
    if (nav) new IntersectionObserver(function (es) {
      navSeen = es[0].isIntersecting;
      sync();
    }, { threshold: 0 }).observe(nav);
  }

  /* 复制本页链接：剪贴板不可用时退回选中文本 */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var ok = btn.parentElement.querySelector(".chp-tools__ok");
      var done = function () { if (!ok) return; ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.prompt("复制这一章的链接：", text); });
      } else {
        window.prompt("复制这一章的链接：", text);
      }
    });
  });
})();
</script>
<script src="/new/assets/nav-back.js?v=20261028l" defer></script>
</body>
</html>
`;

  const outDir = path.join(PUB, 'novel', String(c.n));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  written.push({ n: c.n, url: `/novel/${c.n}/`, bytes: Buffer.byteLength(html), desc: desc.length, og: ogRel });
}

/* 清掉已经不存在的章节目录（只动纯数字目录，别碰 ch/ 与 assets/） */
for (const e of fs.readdirSync(path.join(PUB, 'novel'), { withFileTypes: true })) {
  if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue;
  if (!written.some((w) => String(w.n) === e.name)) fs.rmSync(path.join(PUB, 'novel', e.name), { recursive: true, force: true });
}

const sizes = written.map((w) => w.bytes);
console.log(
  JSON.stringify(
    {
      pages: written.length,
      htmlKB: { min: +(Math.min(...sizes) / 1024).toFixed(1), max: +(Math.max(...sizes) / 1024).toFixed(1) },
      descChars: { min: Math.min(...written.map((w) => w.desc)), max: Math.max(...written.map((w) => w.desc)) },
      ogCards: written.filter((w) => w.og.startsWith('/assets/og/')).length,
      sample: written.slice(0, 2),
    },
    null,
    2
  )
);
