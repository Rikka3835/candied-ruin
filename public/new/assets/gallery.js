/* 图鉴解锁：读到第 N 章，该章出场的人物才亮起来；「剧透模式」一键全开 */
(() => {
  const MAXCH = "cr.maxch";
  const SPOILER = "cr.spoiler";
  const cards = [...document.querySelectorAll(".card[data-name]")];
  if (!cards.length) return;
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
    const counter = document.getElementById("galCount");
    if (counter) counter.textContent = "已解锁 " + open + " / " + cards.length;
  };
  const btn = document.getElementById("galSpoiler");
  const sync = () => btn && btn.setAttribute("aria-pressed", String(spoilerOn()));
  if (btn) btn.addEventListener("click", () => { write(SPOILER, spoilerOn() ? "0" : "1"); sync(); apply(); });
  sync(); apply();
  window.__galApply = apply;
  const useList = (d) => (d.chapters || []).map((c) => ({ n: c.n, cast: c.cast ? String(c.cast).split(/[、,，]/).filter(Boolean) : (c.cast || []) })).sort((a, b) => a.n - b.n);
  fetch("/api/chapters").then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (d && d.chapters && d.chapters.length) { chapters = useList(d); apply(); return; }
    return fetch("/novel/ch/index.json").then((r) => r.json()).then((x) => { chapters = useList(x); apply(); });
  }).catch(() => {});
})();
