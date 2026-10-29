// 章节转场 + 正文加载：目录 ↔ 阅读页
// 数据来自 /novel/ch/index.json 与 /novel/ch/NNN.html（由 scripts/build-chapters.mjs 生成）
// 不用整页刷新：列表淡出 180ms，阅读页从下方推入 260ms；返回时恢复原来的滚动位置。
// 改法：样式在 site.css 的 .reader-view*；渲染逻辑只在 renderChapter()。
(() => {
  const view = document.getElementById("readerView");
  if (!view) return;

  const bar = document.getElementById("readerProgress");
  const chLabel = document.getElementById("readerCh");
  const chTitle = document.getElementById("readerTitle");
  const chMeta = view.querySelector(".reader-view__meta");
  const chBody = document.getElementById("readerBody");
  const list = document.querySelector(".chap-list");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let lastY = 0;
  let open = false;
  let index = null; // { chapters: [...] }

  const paint = () => {
    if (!bar) return;
    const max = view.scrollHeight - view.clientHeight;
    const p = max > 0 ? view.scrollTop / max : 0;
    bar.style.width = (p * 100).toFixed(2) + "%";
    bar.parentElement.classList.toggle("is-on", open && view.scrollTop > 8);
  };

  const loadIndex = async () => {
    if (index) return index;
    // 先问站内写作后台（/api/chapters），拿不到再回落到构建时生成的静态目录
    try {
      const res = await fetch("/api/chapters", { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.chapters) && data.chapters.length) {
          index = {
            chapters: data.chapters.map((c) => ({
              n: c.n, vol: c.vol, title: c.title, subtitle: c.subtitle || "",
              cast: c.cast ? String(c.cast).split(/[、,，]/).filter(Boolean) : [],
              chars: c.size || 0, minutes: Math.max(1, Math.round((c.size || 0) / 420)),
              updated: c.updated, file: "ch/" + String(c.n).padStart(3, "0") + ".html"
            }))
          };
          return index;
        }
      }
    } catch (err) {}
    try {
      const res = await fetch("/novel/ch/index.json", { cache: "no-cache" });
      index = res.ok ? await res.json() : { chapters: [] };
    } catch (err) {
      index = { chapters: [] };
    }
    return index;
  };

  const findMeta = (n) => (index?.chapters || []).find((c) => c.n === Number(n)) || null;

  async function renderChapter(n) {
    await loadIndex();
    const meta = findMeta(n);
    if (chLabel) chLabel.textContent = "第 " + n + " 章";
    if (chMeta) {
      chMeta.textContent = meta
        ? `${meta.vol} · ${meta.chars.toLocaleString("zh-CN")} 字 · 约 ${meta.minutes} 分钟`
        : "糖渍旧蜜";
    }

    if (!meta) {
      if (chTitle) chTitle.textContent = "尚未发布";
      if (chBody) {
        chBody.innerHTML =
          "<p>这一章还没有发布。目录是提前搭好的骨架，点进来只是为了让你看到阅读页长什么样。</p>" +
          "<p>等正文开始连载，这一页才会真的有字。在那之前，任何“剧情”都是假的。</p>";
      }
      return;
    }

    if (chTitle) chTitle.textContent = meta.title;
    renderNav(meta.n);
    try {
      let html = "";
      const api = await fetch("/api/chapters/" + meta.n, { cache: "no-cache" });
      if (api.ok) {
        const data = await api.json();
        html = data.html || "";
      }
      if (!html) {
        const res = await fetch("/novel/" + meta.file, { cache: "no-cache" });
        html = res.ok ? await res.text() : "";
      }
      if (chBody) chBody.innerHTML = html || "<p>正文读取失败，刷新再试。</p>";
    } catch (err) {
      if (chBody) chBody.innerHTML = "<p>正文读取失败，刷新再试。</p>";
    }
  }

  /* ---------- R3：章末翻章 ---------- */
  const nav = document.createElement("nav");
  nav.className = "reader-view__nav";
  nav.hidden = true;
  const btnPrev = document.createElement("button");
  const btnNext = document.createElement("button");
  btnPrev.type = btnNext.type = "button";
  const navHint = document.createElement("p");
  navHint.className = "reader-nav__hint";
  navHint.textContent = "左右滑动也能翻页";
  nav.append(btnPrev, btnNext, navHint);
  const sheet = view.querySelector(".reader-view__sheet");
  if (sheet) sheet.appendChild(nav);

  function renderNav(n) {
    if (!sheet) return;
    const listAll = (index?.chapters || []).slice().sort((a, b) => a.n - b.n);
    const i = listAll.findIndex((c) => c.n === Number(n));
    const prev = i > 0 ? listAll[i - 1] : null;
    const next = i >= 0 && i < listAll.length - 1 ? listAll[i + 1] : null;
    nav.hidden = false;
    btnPrev.disabled = !prev;
    btnNext.disabled = !next;
    if (prev) { btnPrev.hidden = false; btnPrev.textContent = "← 第 " + prev.n + " 章 · " + prev.title; }
    else { btnPrev.hidden = true; }
    if (next) { btnNext.hidden = false; btnNext.textContent = "第 " + next.n + " 章 · " + next.title + " →"; }
    else { btnNext.hidden = true; }
    btnPrev.onclick = prev ? () => openChapter(String(prev.n)) : null;
    btnNext.onclick = next ? () => openChapter(String(next.n)) : null;
    navHint.hidden = !(prev || next);
    btnNext.classList.add("to-next");

    /* 卷末卡：读完本卷最后一章才出现一次 */
    const cur = listAll[i] || null;
    const isVolEnd = !!cur && !next;
    let volend = sheet.querySelector(".volend");
    if (!isVolEnd) { if (volend) volend.remove(); return; }
    const sameVol = listAll.filter((c) => c.vol === cur.vol);
    const words = sameVol.reduce((sum, c) => sum + (c.chars || 0), 0);
    if (!volend) {
      volend = document.createElement("div");
      volend.className = "volend";
      nav.parentNode.insertBefore(volend, nav);
    }
    volend.innerHTML =
      '<p class="volend__mark">卷一 · 完</p>' +
      '<p class="volend__name">' + cur.vol.replace(/^第[一二三四五六七八九十]+卷\s*·\s*/, "") + '</p>' +
      '<p class="volend__note">' + sameVol.length + " 章 · 约 " + words.toLocaleString("en-US") + " 字</p>" +
      '<p class="volend__next">第二卷《甜味走私者》——罐子里的东西，得找到一个能说清楚它的人。</p>';
  }

  /* ---------- R3：阅读进度（每章记一个比例，目录页给「继续读」） ---------- */
  const PROG = "cr.progress";
  const MAXCH = "cr.maxch";
  const bumpMax = (n) => { try { localStorage.setItem(MAXCH, String(Math.max(Number(localStorage.getItem(MAXCH) || 0), n))); } catch (e) {} };
  const readProg = () => {
    try {
      return JSON.parse(localStorage.getItem(PROG) || "null");
    } catch (err) {
      return null;
    }
  };
  const writeProg = (data) => {
    try {
      localStorage.setItem(PROG, JSON.stringify(data));
    } catch (err) {}
  };
  let saveTimer = 0;
  function rememberPos() {
    if (!open) return;
    const n = Number(window.__crCh || 0);
    if (!n) return;
    try { localStorage.setItem(MAXCH, String(Math.max(Number(localStorage.getItem(MAXCH) || 0), n))); } catch (e) {}
    const max = view.scrollHeight - view.clientHeight;
    const ratio = max > 0 ? Math.min(1, view.scrollTop / max) : 0;
    writeProg({ n, ratio, at: Date.now() });
  }

  function restorePos(n, resume) {
    const saved = readProg();
    if (resume && saved && Number(saved.n) === Number(n) && saved.ratio > 0.02) {
      view.scrollTop = Math.round(saved.ratio * Math.max(0, view.scrollHeight - view.clientHeight));
    } else {
      view.scrollTop = 0;
    }
    paint();
  }

  async function openChapter(n, resume) {
    // 阅读层已经打开时（点章末的上一章/下一章、键盘、滑动）只换内容，不再播入场
    if (open) {
      rememberPos();
      window.__crCh = n;
      bumpMax(n);
      await renderChapter(n);
      restorePos(n, resume);
      if (location.hash !== "#ch" + n) history.pushState({ ch: n }, "", "#ch" + n);
      return;
    }
    open = true;
    lastY = window.scrollY;
    view.hidden = false;
    document.body.classList.add("is-reading");
    window.__crCh = n;
    bumpMax(n);
    await renderChapter(n);
    restorePos(n, resume);
    requestAnimationFrame(() => {
      view.classList.add("is-in");
      paint();
    });
    if (location.hash !== "#ch" + n) history.pushState({ ch: n }, "", "#ch" + n);
  }

  function closeChapter(push) {
    if (!open) return;
    rememberPos();
    open = false;
    view.classList.remove("is-in");
    if (bar) bar.parentElement.classList.remove("is-on");
    const done = () => {
      view.hidden = true;
      document.body.classList.remove("is-reading");
      if (lastY) window.scrollTo(0, lastY);
    };
    if (reduce) done();
    else setTimeout(done, 280);
    refreshContinue();
    if (push !== false && location.hash) history.pushState({}, "", location.pathname);
  }

  document.querySelectorAll(".chap[data-ch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = btn.dataset.ch;
      if (reduce) {
        openChapter(n);
        return;
      }
      if (list) list.style.transition = "opacity 180ms ease";
      if (list) list.style.opacity = "0.25";
      setTimeout(() => {
        if (list) {
          list.style.opacity = "";
          list.style.transition = "";
        }
        openChapter(n);
      }, 140);
    });
  });

  /* ---------- R2：字号 / 行宽 / 主题（存 localStorage，下次进来还是这套） ---------- */
  const SIZE = { s: "16px", m: "18px", l: "20px", xl: "22px" };
  const LEADING = { tight: "1.75", normal: "1.95", loose: "2.2" };
  const MEASURE = { narrow: 33, wide: 38 };
  const KEY = "cr.reader";
  const pref = { size: "m", measure: "wide", theme: "paper", leading: "normal" };
  try {
    Object.assign(pref, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (err) {}

  const tools = document.getElementById("rvTools");
  const panel = document.getElementById("rvPanel");
  const sizeBtns = panel ? [...panel.querySelectorAll("[data-size]")] : [];
  const measBtns = panel ? [...panel.querySelectorAll("[data-measure]")] : [];
  const themeBtns = panel ? [...panel.querySelectorAll("[data-theme]")] : [];
  const lhBtns = panel ? [...panel.querySelectorAll("[data-lh]")] : [];

  function applyPref() {
    view.style.setProperty("--rs", SIZE[pref.size] || SIZE.m);
    view.style.setProperty("--rm", String(MEASURE[pref.measure] || MEASURE.wide));
    view.style.setProperty("--rmf", pref.measure === "narrow" ? "0.72" : "1");
    view.style.setProperty("--rlh", LEADING[pref.leading] || LEADING.normal);
    view.dataset.theme = pref.theme === "night" ? "night" : "paper";
    sizeBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.size === pref.size)));
    measBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.measure === pref.measure)));
    themeBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === pref.theme)));
    lhBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lh === (pref.leading || "normal"))));
  }
  function savePref() {
    try {
      localStorage.setItem(KEY, JSON.stringify(pref));
    } catch (err) {}
  }
  if (panel) {
    applyPref();
    sizeBtns.forEach((b) =>
      b.addEventListener("click", () => {
        pref.size = b.dataset.size;
        applyPref();
        savePref();
      })
    );
    measBtns.forEach((b) =>
      b.addEventListener("click", () => {
        pref.measure = b.dataset.measure;
        applyPref();
        savePref();
      })
    );
    themeBtns.forEach((b) =>
      b.addEventListener("click", () => {
        pref.theme = b.dataset.theme;
        applyPref();
        savePref();
      })
    );
    lhBtns.forEach((b) =>
      b.addEventListener("click", () => {
        pref.leading = b.dataset.lh;
        applyPref();
        savePref();
      })
    );
    if (tools) {
      tools.addEventListener("click", () => {
        const open2 = tools.getAttribute("aria-expanded") === "true";
        tools.setAttribute("aria-expanded", String(!open2));
        panel.hidden = open2;
      });
    }
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== tools) {
        panel.hidden = true;
        tools?.setAttribute("aria-expanded", "false");
      }
    });
  }

  const back = document.getElementById("readerBack");
  if (back) back.addEventListener("click", (e) => {
    e.preventDefault();
    closeChapter();
  });

  view.addEventListener("scroll", () => {
    paint();
    if (saveTimer) return;
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      rememberPos();
    }, 500);
  }, { passive: true });
  window.addEventListener("resize", paint, { passive: true });
  window.addEventListener("keydown", (e) => {
    if (open && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const b = e.key === "ArrowRight" ? btnNext : btnPrev;
      if (b && !b.disabled) {
        e.preventDefault();
        b.click();
      }
      return;
    }
    if (e.key !== "Escape") return;
    if (panel && !panel.hidden) {
      panel.hidden = true;
      tools?.setAttribute("aria-expanded", "false");
      return;
    }
    closeChapter();
  });

  let tX = 0;
  let tY = 0;
  view.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    tX = t.clientX;
    tY = t.clientY;
  }, { passive: true });
  view.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - tX;
    const dy = t.clientY - tY;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 60) return;
    const b = dx < 0 ? btnNext : btnPrev;
    if (b && !b.disabled) b.click();
  }, { passive: true });

  window.addEventListener("popstate", () => {
    const m = /^#ch(\d+)$/.exec(location.hash);
    if (m) openChapter(m[1], true);
    else closeChapter(false);
  });

  /* ---------- R3：目录页「继续读」（关掉阅读层后要刷新一次） ---------- */
  const contBox = document.getElementById("continueBox");
  const contText = document.getElementById("continueText");
  const contBtn = document.getElementById("continueBtn");

  async function refreshContinue() {
    if (!contBox || !contText || !contBtn) return;
    const saved = readProg();
    if (!saved) {
      contBox.hidden = true;
      return;
    }
    await loadIndex();
    const meta = findMeta(saved.n);
    if (!meta) {
      contBox.hidden = true;
      return;
    }
    const pct = Math.round(saved.ratio * 100);
    contText.textContent =
      "第 " + meta.n + " 章 · " + meta.title + (pct >= 3 ? " · 已读 " + pct + "%" : " · 上次停在这里");
    contBox.hidden = false;
    if (!contBtn.dataset.wired) {
      contBtn.dataset.wired = "1";
      contBtn.addEventListener("click", () => {
        const p = readProg();
        if (p) openChapter(String(p.n), true);
      });
    }
  }
  refreshContinue();

  // 直接带 #ch1 打开时要能还原
  const m = /^#ch(\d+)$/.exec(location.hash);
  if (m) openChapter(m[1]);
})();


/* catalog-sync: 目录顺序以数据库为准（后台拖拽排序后不用重新部署） */
function paintCatalogProgress(nodes) {
  let maxch = 0;
  try { maxch = Number(localStorage.getItem('cr.maxch') || 0); } catch (e) {}
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('cr.progress') || 'null'); } catch (e) {}
  nodes.forEach(function (b) {
    const n = Number(b.getAttribute('data-ch'));
    const nameEl = b.querySelector('.chap__name') || b;
    let tag = nameEl.querySelector('.chap__prog');
    const hit = saved && Number(saved.n) === n && saved.ratio > 0.02;
    if (hit) {
      if (!tag) { tag = document.createElement('i'); tag.className = 'chap__prog'; nameEl.appendChild(tag); }
      tag.textContent = '读到 ' + Math.round(saved.ratio * 100) + '%';
    } else if (tag) { tag.remove(); }
    b.classList.toggle('is-read', !!maxch && n < maxch);
  });
  const head = document.querySelector('.vol__head');
  if (!head) return;
  let strip = head.querySelector('.vol__prog');
  if (!strip) { strip = document.createElement('span'); strip.className = 'vol__prog'; head.appendChild(strip); }
  const read = nodes.filter(function (b) { return Number(b.getAttribute('data-ch')) <= maxch; }).length;
  if (!maxch) { strip.textContent = ''; strip.hidden = true; return; }
  strip.hidden = false;
  strip.innerHTML = '<i>' + nodes.map(function (b) {
    return '<b class="' + (Number(b.getAttribute('data-ch')) <= maxch ? 'on' : '') + '"></b>';
  }).join('') + '</i><em>已读 ' + read + ' / ' + nodes.length + '</em>';
}

(function () {
  const nodes = [].slice.call(document.querySelectorAll('.chap'));
  if (nodes.length && nodes[0].getAttribute('data-ch')) paintCatalogProgress(nodes);
})();

(function () {
  const list = document.querySelector('.chap-list');
  if (!list) return;
  const nodes = [...list.querySelectorAll('.chap')];
  if (!nodes.length) return;
  const byTitle = new Map();
  nodes.forEach(function (b) {
    const t = (b.querySelector('.chap__name') || {}).textContent || '';
    if (t) byTitle.set(t.trim(), b);
  });
  fetch('/api/chapters', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !Array.isArray(d.chapters)) return;
      const items = d.chapters.filter(function (c) { return c.status === 'published'; })
        .sort(function (a, b) { return a.n - b.n; });
      if (!items.length) return;
      const matched = items.map(function (c) { return byTitle.get((c.title || '').trim()); });
      if (matched.some(function (n) { return !n; })) return;   // 有新章还没构建：交给静态版
      const cur = nodes.map(function (b) { return b.querySelector('.chap__name').textContent.trim(); });
      const want = items.map(function (c) { return (c.title || '').trim(); });
      if (cur.join('|') === want.join('|')) {
        items.forEach(function (c, i2) {
          const b = matched[i2];
          b.setAttribute('data-ch', String(c.n));
          const no = b.querySelector('.chap__no');
          if (no) no.textContent = '第 ' + c.n + ' 章';
        });
        return;
      }
      const frag = document.createDocumentFragment();
      items.forEach(function (c, i2) {
        const b = matched[i2];
        b.setAttribute('data-ch', String(c.n));
        const no = b.querySelector('.chap__no');
        if (no) no.textContent = '第 ' + c.n + ' 章';
        frag.appendChild(b);
      });
      list.appendChild(frag);
      const note = document.querySelector('.vol__note');
      if (note) {
        const total = nodes.reduce(function (a, b) {
          const st = (b.querySelector('.chap__state') || {}).textContent || '';
          const m = /([0-9,]+)\s*字/.exec(st);
          return a + (m ? Number(m[1].replace(/,/g, '')) : 0);
        }, 0);
        note.textContent = nodes.length + ' 章 · 共 ' + total.toLocaleString('en-US') + ' 字';
        paintCatalogProgress(nodes);
      }
    })
    .catch(function () {});
})();
