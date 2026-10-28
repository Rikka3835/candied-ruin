// 顶部「← 返回」：优先回浏览器历史，直接粘网址进来（无历史）就回首页
// 只在非首页的页面引入；改法：改 navBack() 里的兜底地址即可。
(() => {
  const btn = document.querySelector(".nav__back");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (history.length > 1) history.back();
    else location.assign("/");
  });
})();
