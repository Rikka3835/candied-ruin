/* 档案页：一屏一人。索引条点谁显示谁；读到第 N 章该章出场的人物才亮，「剧透模式」一键全开。
   人物资料只存一份（隐藏的 .card 作为数据源），面板从它取；避免同一批名字在一页里重复三次。 */
(() => {
  const MAXCH = "cr.maxch";
  const SPOILER = "cr.spoiler";
  const cards = [...document.querySelectorAll(".card[data-name]")];
  const castEl = document.getElementById("cast");
  if (!cards.length || !castEl) return;

  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const maxch = () => Number(read(MAXCH) || 0) || 0;
  const spoilerOn = () => read(SPOILER) === "1";
  const parts = (s) => { const out = [String(s)]; const m = String(s).match(/^(.+?)（(.+?)）$/); if (m) out.push(m[1].trim(), m[2].trim()); return out; };
  const toList = (cast) => Array.isArray(cast) ? cast : String(cast == null ? "" : cast).split(/[、,，/]/).map((s) => s.trim()).filter(Boolean);
  const hit = (cast, name) => { const ns = parts(name); return toList(cast).some((c) => parts(c).some((x) => ns.some((y) => x === y || x.includes(y) || y.includes(x)))); };

  const uploadedPlates = new Set();
  fetch("/api/plates", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.slots) { j.slots.forEach((n) => uploadedPlates.add(n)); render(); } })
    .catch(() => {});

  let chapters = [];
  const cardFor = (btn) => (btn ? document.querySelector('.card[data-name="' + btn.dataset.name + '"]') : null);

  function q(sel) { return castEl.querySelector(sel); }
  function hideArt(noteText) {
    const a = q("#castPlate"), im = q("#castImg"), webp = q("#castWebp"), mono = q("#castMono"), ph = q("#castPh"), note = q("#castNote");
    if (a) { a.hidden = true; a.style.display = "none"; a.setAttribute("href", ""); }
    if (webp) webp.setAttribute("srcset", "");
    if (im) im.setAttribute("src", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    if (ph) { ph.hidden = true; ph.style.display = "none"; }
    if (mono) { mono.hidden = false; mono.textContent = "？"; }
    if (note) note.textContent = noteText || "读到该章，立绘才亮";
  }
  function showPlate(btn, idx, uploaded) {
    const a = q("#castPlate"), im = q("#castImg"), webp = q("#castWebp"), mono = q("#castMono"), ph = q("#castPh"), note = q("#castNote");
    const src = uploaded ? "/api/plate/" + idx : "/new/assets/cast/c" + idx + "/plate-1200.jpg";
    if (im) {
      im.onerror = function () { showPlaceholder("原稿加载失败 · 点下面重试可刷新"); };
      if (im.getAttribute("src") !== src) im.setAttribute("src", src);
    }
    if (webp) webp.setAttribute("srcset", uploaded ? "" : "/new/assets/cast/c" + idx + "/plate-1200.webp");
    if (a) { a.setAttribute("href", uploaded ? src : "/new/assets/cast/c" + idx + "/plate-2000.jpg"); a.hidden = false; a.style.display = ""; }
    if (ph) { ph.hidden = true; ph.style.display = "none"; }
    if (mono) mono.hidden = true;
    if (note) note.textContent = "点开看原稿全尺寸";
  }
  function showPlaceholder(noteText) {
    const a = q("#castPlate"), im = q("#castImg"), webp = q("#castWebp"), mono = q("#castMono"), ph = q("#castPh"), note = q("#castNote");
    if (a) { a.hidden = true; a.style.display = "none"; }
    if (webp) webp.setAttribute("srcset", "");
    if (im) im.setAttribute("src", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    if (mono) mono.hidden = true;
    if (ph) {
      const nm = document.querySelector(".cast__rb.is-on");
      ph.innerHTML = '<span class="ph__n">' + ((nm && nm.dataset.name) || "？") + '</span><span class="ph__s">' + (noteText || "立绘待补") + "</span>";
      ph.hidden = false; ph.style.display = "grid";
    }
    if (note) note.textContent = "原稿尚在绘制";
  }

  function render() {
    // 索引条在 #cast 之外，必须从整个文档找选中项；只在 #cast 里找会永远回落到第一位。
    const on = document.querySelector(".cast__rb.is-on") || document.querySelector(".cast__rb");
    if (!on) return;
    const card = cardFor(on);
    const locked = !spoilerOn() && (!card || card.classList.contains("is-locked"));
    const idx = Number(on.dataset.idx) || 0;
    const uploaded = uploadedPlates.has(idx);
    const hasPlate = on.dataset.plate === "1" || uploaded;
    const nameEl = q("#castName"), tagEl = q("#castTag"), noEl = q("#castNo"), lockEl = q("#castLocked"), fieldsEl = q("#castFields");
    castEl.classList.toggle("is-locked", !!locked);
    if (noEl) noEl.textContent = String(idx).padStart(2, "0");
    if (locked) {
      if (nameEl) nameEl.textContent = "？？？";
      if (tagEl) tagEl.textContent = on.dataset.hint || "";
      if (lockEl) lockEl.textContent = card && card.dataset.at ? "读到第 " + card.dataset.at + " 章解锁" : "还没出场";
      if (fieldsEl) fieldsEl.innerHTML = "";
      hideArt("读到该章，立绘才亮");
      return;
    }
    if (nameEl) nameEl.textContent = on.dataset.name || "？？？";
    if (tagEl) tagEl.textContent = on.dataset.tag || "";
    if (lockEl) lockEl.textContent = "";
    if (fieldsEl) {
      const src = card ? card.querySelector(".card__fields") : null;
      fieldsEl.innerHTML = src ? src.innerHTML : "";
    }
    if (hasPlate) showPlate(on, idx, uploaded);
    else showPlaceholder("立绘待补");
  }

  // 解锁状态：每张卡记下「首次出场的章」，供面板显示「读到第 N 章解锁」。
  const applyInner = () => {
    const top = maxch(); const all = spoilerOn(); let open = 0;
    cards.forEach((card) => {
      const nameEl = card.querySelector(".card__name");
      if (!card.dataset.orig && nameEl) card.dataset.orig = nameEl.textContent;
      const name = card.dataset.name;
      let at = null;
      for (const ch of chapters) if (hit(ch.cast, name)) { at = ch.n; break; }
      card.dataset.at = at === null ? "" : String(at);
      const unlocked = all || (at !== null && top >= at);
      card.classList.toggle("is-locked", !unlocked);
      if (unlocked) open++;
      if (nameEl) nameEl.textContent = unlocked ? card.dataset.orig : "？？？";
    });
    document.querySelectorAll(".cast__rb").forEach((b) => {
      const c = cardFor(b);
      b.classList.toggle("is-locked", !!c && c.classList.contains("is-locked"));
    });
    render();
    const counter = document.getElementById("galCount");
    if (counter) counter.textContent = "已解锁 " + open + " / " + cards.length;
  };
  const apply = () => {
    try { applyInner(); }
    catch (e) {
      document.documentElement.dataset.galErr = String((e && e.message) || e);
      document.querySelectorAll(".card").forEach((c) => c.classList.add("is-locked"));
    }
  };

  function select(btn) {
    if (!btn) return;
    document.querySelectorAll(".cast__rb").forEach((b) => b.classList.toggle("is-on", b === btn));
    render();
  }
  document.querySelectorAll(".cast__rb").forEach((b) => b.addEventListener("click", () => select(b)));

  const spBtn = document.getElementById("galSpoiler");
  const syncSp = () => spBtn && spBtn.setAttribute("aria-pressed", String(spoilerOn()));
  if (spBtn) spBtn.addEventListener("click", () => { write(SPOILER, spoilerOn() ? "0" : "1"); syncSp(); apply(); });
  syncSp();

  const useList = (d) => (d.chapters || []).map((c) => ({ n: c.n, cast: c.cast })).sort((a, b) => a.n - b.n);
  select(document.querySelector(".cast__rb"));
  apply();
  fetch("/api/chapters").then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (d && d.chapters && d.chapters.length) { chapters = useList(d); apply(); return; }
    return fetch("/novel/ch/index.json").then((r) => r.json()).then((x) => { chapters = useList(x); apply(); });
  }).catch(() => {});
  window.__galApply = apply;
})();
