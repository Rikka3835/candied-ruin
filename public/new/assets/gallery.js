/* 图鉴解锁：读到第 N 章，该章出场的人物才亮起来；「剧透模式」一键全开 */
(() => {
  const MAXCH = "cr.maxch";
  const SPOILER = "cr.spoiler";
  const cards = [...document.querySelectorAll(".card[data-name]")];
  if (!cards.length) return;
  const castEl = document.getElementById("cast");
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const maxch = () => Number(read(MAXCH) || 0) || 0;
  const spoilerOn = () => read(SPOILER) === "1";
  const parts = (s) => { const out = [s]; const m = s.match(/^(.+?)（(.+?)）$/); if (m) out.push(m[1].trim(), m[2].trim()); return out; };
  const hit = (cast, name) => { const ns = parts(name); return (cast || []).some((c) => parts(c).some((x) => ns.some((y) => x === y || x.includes(y) || y.includes(x)))); };
  let chapters = [];
  const apply = () => {
    const top = maxch(); const all = spoilerOn(); let open = 0;
    cards.forEach((card) => {
      const nameEl = card.querySelector(".card__name");
      if (!card.dataset.orig) card.dataset.orig = nameEl ? nameEl.textContent : card.dataset.name;
      const name = card.dataset.name;
      let at = null;
      for (const ch of chapters) if (hit(ch.cast, name)) { at = ch.n; break; }
      const unlocked = all || (at !== null && top >= at);
      card.classList.toggle("is-locked", !unlocked);
      if (unlocked) open++;
      if (nameEl) nameEl.textContent = unlocked ? card.dataset.orig : "？？？";
      const rail = document.querySelector('.rail__a[href="#' + card.id + '"]');
      if (rail) {
        if (!rail.dataset.orig) rail.dataset.orig = rail.textContent;
        rail.textContent = unlocked ? rail.dataset.orig : "···";
        rail.classList.toggle("is-locked", !unlocked);
        if (unlocked) rail.removeAttribute("aria-disabled"); else rail.setAttribute("aria-disabled", "true");
      }
      let lock = card.querySelector(".lock");
      if (unlocked) { if (lock) lock.remove(); return; }
      if (!lock) {
        lock = document.createElement("div");
        lock.className = "lock";
        lock.innerHTML = '<p class="lock__h"></p><p class="lock__r"></p>';
        const head = card.querySelector(".card__head");
        (head || card).insertAdjacentElement("afterend", lock);
      }
      lock.querySelector(".lock__h").textContent = card.dataset.hint || "";
      lock.querySelector(".lock__r").textContent = at === null ? "还没出场" : "读到第 " + at + " 章解锁";
    });
    const railBox = document.querySelector(".arch__rail");
    const wrap = document.querySelector(".arch__wrap");
    if (railBox) {
      const anyOpen = !!railBox.querySelector(".rail__a:not(.is-locked)");
      railBox.classList.toggle("is-empty", !anyOpen);
      if (wrap) wrap.classList.toggle("no-rail", !anyOpen);
      railBox.querySelectorAll(".rail__g").forEach(function (g) {
        let ok = false, n = g.nextElementSibling;
        while (n && !n.classList.contains("rail__g")) {
          if (n.classList.contains("rail__a") && !n.classList.contains("is-locked")) { ok = true; break; }
          n = n.nextElementSibling;
        }
        g.style.display = ok ? "" : "none";
      });
    }

    document.querySelectorAll(".cast__rb").forEach(function (b) {
      const c2 = document.querySelector('.card[data-name="' + b.dataset.name + '"]');
      b.classList.toggle("is-locked", !!c2 && c2.classList.contains("is-locked"));
    });
    fitCast();
    const counter = document.getElementById("galCount");
    if (counter) counter.textContent = "已解锁 " + open + " / " + cards.length;
  };
  const btn = document.getElementById("galSpoiler");
  const sync = () => btn && btn.setAttribute("aria-pressed", String(spoilerOn()));
  if (btn) btn.addEventListener("click", () => { write(SPOILER, spoilerOn() ? "0" : "1"); sync(); apply(); });
  sync(); apply();
  window.__galApply = apply;
  function selectCast(btn) {
    if (!castEl || !btn) return;
    castEl.dataset.idx = btn.dataset.idx;
    const q = (s2) => castEl.querySelector(s2);
    q("#castName").textContent = btn.dataset.name || "？？？";
    q("#castTag").textContent = btn.dataset.tag || "";
    q("#castNo").textContent = btn.dataset.idx;
    q("#castMono").textContent = (btn.dataset.name || "？").slice(0, 1);
    castEl.querySelectorAll(".cast__meta dd").forEach(function (dd) {
      dd.textContent = (btn.dataset[dd.dataset.k] || "—");
    });
    document.querySelectorAll(".cast__rb").forEach(function (b) { b.classList.toggle("is-on", b === btn); });
    fitCast();
  }
  function syncPlate(b) {
    const a = castEl.querySelector("#castPlate");
    const im = castEl.querySelector("#castImg");
    const mono = castEl.querySelector("#castMono");
    const note = castEl.querySelector("#castNote");
    const has = b && b.dataset.plate === "1";
    if (has) {
      const src = "/new/assets/cast/c" + b.dataset.idx + "/plate-1200.jpg";
      if (im && im.getAttribute("src") !== src) im.setAttribute("src", src);
      if (a) { a.setAttribute("href", "/new/assets/cast/c" + b.dataset.idx + "/plate-2000.jpg"); a.hidden = false; }
      if (mono) mono.hidden = true;
      if (note) note.textContent = "设定原稿 · 点开看细节";
    } else {
      if (a) a.hidden = true;
      if (mono) mono.hidden = false;
      if (note) note.textContent = "原稿待补";
    }
  }
  function fitCast() {
    if (!castEl) return;
    const on = castEl.querySelector(".cast__rb.is-on");
    const cardFor = on ? document.querySelector('.card[data-name="' + on.dataset.name + '"]') : null;
    const locked = !spoilerOn() && !!cardFor && cardFor.classList.contains("is-locked") && on.dataset.plate !== "1";
    castEl.classList.toggle("is-locked", !!locked);
    if (locked) {
      castEl.querySelector("#castName").textContent = "？？？";
      castEl.querySelector("#castTag").textContent = on.dataset.hint || "还没出场";
      castEl.querySelectorAll(".cast__meta dd").forEach(function (dd) { dd.textContent = "—"; });
    }
    syncPlate(on);
  }
  document.querySelectorAll(".cast__rb").forEach(function (b) { b.addEventListener("click", function () { selectCast(b); }); });
  selectCast(document.querySelector('.cast__rb[data-plate="1"]') || document.querySelector(".cast__rb"));
  setTimeout(fitCast, 0);

  const useList = (d) => (d.chapters || []).map((c) => ({ n: c.n, cast: c.cast ? String(c.cast).split(/[、,，]/).filter(Boolean) : (c.cast || []) })).sort((a, b) => a.n - b.n);
  fetch("/api/chapters").then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (d && d.chapters && d.chapters.length) { chapters = useList(d); apply(); return; }
    return fetch("/novel/ch/index.json").then((r) => r.json()).then((x) => { chapters = useList(x); apply(); });
  }).catch(() => {});
})();
