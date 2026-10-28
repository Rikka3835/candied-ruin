// 标题点火：糖泡在指针处凝出来，十字爆开，光沿书名扫过一遍
(() => {
  const title = document.querySelector(".hero__title");
  if (!title) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let last = 0;

  function ignite(x, y) {
    const now = performance.now();
    if (now - last < 650) return;
    last = now;

    const dot = document.createElement("span");
    dot.className = "ignite";
    dot.setAttribute("aria-hidden", "true");
    dot.style.left = Math.round(x) + "px";
    dot.style.top = Math.round(y) + "px";
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 1300);

    title.classList.remove("is-lit");
    void title.offsetWidth;
    title.classList.add("is-lit");
    setTimeout(() => title.classList.remove("is-lit"), 900);
  }

  title.addEventListener("pointerenter", (e) => ignite(e.clientX, e.clientY));
  title.addEventListener("pointerdown", (e) => ignite(e.clientX, e.clientY));
})();
