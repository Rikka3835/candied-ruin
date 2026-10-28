// 首页「继续读」：只在 cr.progress 有进度时出现；没有进度就保持隐藏（不再显示「最新一章」，避免首屏多一条提示）。
// 改法：只改 render() 里的文案拼装。
(() => {
  const box = document.getElementById("resume");
  const txt = document.getElementById("resumeT");
  if (!box || !txt) return;

  const readProg = () => {
    try { return JSON.parse(localStorage.getItem("cr.progress") || "null"); } catch (e) { return null; }
  };

  fetch("/novel/ch/index.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : { chapters: [] }))
    .then((data) => {
      const list = (data.chapters || []).slice().sort((a, b) => a.n - b.n);
      if (!list.length) return;
      const p = readProg();
      const hit = p ? list.find((c) => c.n === Number(p.n)) : null;
      if (hit) {
        const pct = Math.round((p.ratio || 0) * 100);
        txt.textContent = "第 " + hit.n + " 章 · " + hit.title + (pct >= 3 ? " · 已读 " + pct + "%" : "");
        box.setAttribute("href", "/novel/#ch" + hit.n);
        box.hidden = false;
      }
    })
    .catch(() => {});
})();
