/* 冒险者通行证 —— 入口按钮（演示 v2）
   交互时间轴（点击封蜡后）：
     0ms     封蜡碎成 6 块，2 条糖浆拉丝甩出（180–520ms）
     0ms     用户录音起播（+100ms，避免和碎蜡同帧抢注意力）
     60ms    卡片被“抽走”：上移 26px + 放大 4% + 淡出（460ms）
     620ms   过曝 420ms（遮住“抽卡 → 加载”这一下）
     760ms   加载层出现（糖泡占位）
   微视差：指针在卡片上移动时 ±2°，离开复位。
   减弱动效：不 tilt、不碎蜡，直接淡出 → 过曝 → 加载。 */

const $ = (sel) => document.querySelector(sel);

const stage = document.body;
const pass = $("#pass");
const card = $("#card");
const seal = $("#seal");
const shardsLayer = $("#shards");
const flash = $("#flash");
const loading = $("#loading");
const skip = $("#skip");
const audio = new Audio("audio/gate-grind.m4a");
audio.preload = "auto";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let opened = false;
let timers = [];

const later = (fn, ms) => {
  const id = window.setTimeout(fn, ms);
  timers.push(id);
  return id;
};

/* ---------- 微视差 ---------- */
const TILT = 2; // 度

function onPointerMove(e) {
  if (opened || reduceMotion.matches) return;
  const r = card.getBoundingClientRect();
  const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const cx = Math.max(-1, Math.min(1, nx));
  const cy = Math.max(-1, Math.min(1, ny));
  card.style.setProperty("--ry", `${(cx * TILT).toFixed(2)}deg`);
  card.style.setProperty("--rx", `${(-cy * TILT).toFixed(2)}deg`);
}

function resetTilt() {
  card.style.setProperty("--ry", "0deg");
  card.style.setProperty("--rx", "0deg");
}

pass.addEventListener("pointermove", onPointerMove);
pass.addEventListener("pointerleave", resetTilt);

/* ---------- 碎蜡 ---------- */
const SHARD_SHAPES = [
  "polygon(50% 0%, 100% 38%, 74% 100%, 18% 82%, 0% 30%)",
  "polygon(20% 0%, 92% 14%, 100% 70%, 44% 100%, 0% 62%)",
  "polygon(0% 22%, 62% 0%, 100% 48%, 66% 100%, 12% 88%)",
  "polygon(34% 0%, 100% 26%, 82% 92%, 24% 100%, 0% 52%)",
  "polygon(12% 8%, 78% 0%, 100% 62%, 54% 100%, 0% 74%)",
  "polygon(44% 0%, 100% 30%, 88% 84%, 30% 100%, 0% 44%)"
];

function burst() {
  const frag = document.createDocumentFragment();
  const r = seal.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  // 6 块碎蜡：向上/两侧飞出，带旋转与重力回落
  for (let i = 0; i < SHARD_SHAPES.length; i += 1) {
    const el = document.createElement("i");
    el.className = "shard";
    el.style.clipPath = SHARD_SHAPES[i];
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.width = `${18 + Math.random() * 14}px`;
    el.style.height = `${15 + Math.random() * 12}px`;
    frag.appendChild(el);

    const angle = (Math.PI * 2 * i) / SHARD_SHAPES.length + Math.random() * 0.5;
    const dist = 60 + Math.random() * 90;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.7 - 40;
    const spin = (Math.random() * 220 - 110).toFixed(0);

    el.animate(
      [
        { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy}px) rotate(${spin * 0.4}deg) scale(.92)`, opacity: 1, offset: 0.42 },
        { transform: `translate(${dx}px, ${dy + 120}px) rotate(${spin}deg) scale(.55)`, opacity: 0 }
      ],
      { duration: 900 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }
    );
  }

  // 2 条糖浆拉丝：先从中心拉开再断
  for (let i = 0; i < 2; i += 1) {
    const s = document.createElement("i");
    s.className = "strand";
    s.style.left = `${cx}px`;
    s.style.top = `${cy - 20}px`;
    s.style.transformOrigin = i === 0 ? "50% 0%" : "50% 100%";
    frag.appendChild(s);
    const dir = i === 0 ? -1 : 1;
    s.animate(
      [
        { transform: "translate(0,0) scaleY(.1)", opacity: 0 },
        { transform: `translate(${dir * 8}px, ${-10 * dir}px) scaleY(1)`, opacity: 0.95, offset: 0.45 },
        { transform: `translate(${dir * 14}px, ${-30 * dir}px) scaleY(.35)`, opacity: 0 }
      ],
      { duration: 460, easing: "ease-out", fill: "forwards" }
    );
  }

  shardsLayer.appendChild(frag);

  later(() => {
    shardsLayer.textContent = "";
  }, 1500);
}

/* ---------- 进入 ---------- */
function open() {
  if (opened) return;
  opened = true;
  resetTilt();
  stage.classList.add("is-open");

  if (reduceMotion.matches) {
    flash.classList.add("is-on");
    later(() => showLoading(), 240);
    return;
  }

  burst();
  seal.classList.add("is-gone");
  // 卡片等碎蜡飞出去一点再走，否则只看见一张淡掉的纸
  later(() => pass.classList.add("is-open"), 220);
  later(() => {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, 100);
  later(() => flash.classList.add("is-on"), 900);
  later(() => showLoading(), 1040);
}

function showLoading() {
  loading.classList.add("is-on");
  loading.setAttribute("aria-hidden", "false");
  drawBubble();
}

/* ---------- 糖泡占位（真糖泡下一节做） ---------- */
let bubbleRaf = 0;
let bubbleStart = 0;

function drawBubble() {
  const canvas = $("#bubble");
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth || 200;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;

  const tick = (t) => {
    if (!bubbleStart) bubbleStart = t;
    const p = (t - bubbleStart) / 1000;
    ctx.clearRect(0, 0, size, size);

    // 光晕必须在画布边界前收到 0，否则会露一个方框
    const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, Math.min(size / 2, r * 1.5));
    glow.addColorStop(0, "rgba(255,179,71,.26)");
    glow.addColorStop(0.55, "rgba(255,150,60,.12)");
    glow.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    const body = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.36, r * 0.1, cx, cy, r);
    body.addColorStop(0, "#FFE7BC");
    body.addColorStop(0.46, "#FFC470");
    body.addColorStop(1, "rgba(190,96,24,.92)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    // 糖浆涡流
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(p * 0.6);
    ctx.strokeStyle = "rgba(255,246,226,.5)";
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 1.15);
    ctx.stroke();
    ctx.restore();

    // 高光
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.34, cy - r * 0.4, r * 0.2, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,253,246,.85)";
    ctx.fill();

    bubbleRaf = window.requestAnimationFrame(tick);
  };

  cancelAnimationFrame(bubbleRaf);
  bubbleRaf = window.requestAnimationFrame(tick);
}

/* ---------- 重置 / 跳过 ---------- */
function reset() {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
  opened = false;
  seal.classList.remove("is-gone");
  pass.classList.remove("is-open");
  stage.classList.remove("is-open");
  flash.classList.remove("is-on");
  loading.classList.remove("is-on");
  loading.setAttribute("aria-hidden", "true");
  shardsLayer.textContent = "";
  cancelAnimationFrame(bubbleRaf);
  bubbleStart = 0;
  resetTilt();
}

/* ---------- 事件 ---------- */
seal.addEventListener("click", open);
skip.addEventListener("click", () => {
  loading.classList.remove("is-on");
  loading.setAttribute("aria-hidden", "true");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") reset();
});

/* 截图脚本用的小接口：open() 走完整时间轴，reset() 回到初始 */
window.__demo = {
  open,
  reset,
  state: () => ({
    open: opened,
    loading: loading.classList.contains("is-on"),
    y: getComputedStyle(pass).top
  })
};

/* 入场：卡片轻轻浮上来一次 */
if (!reduceMotion.matches) {
  card.animate(
    [
      { transform: "translateY(14px) scale(.985)", opacity: 0 },
      { transform: "translateY(0) scale(1)", opacity: 1 }
    ],
    { duration: 760, easing: "cubic-bezier(.22,.9,.24,1)", delay: 140, fill: "backwards" }
  );
}

/* ---------- 浮尘（让背景有空间感） ---------- */
function startDust() {
  const canvas = $("#dust");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  let dpr = 1;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener("resize", size);

  const count = reduceMotion.matches ? 20 : Math.round(Math.min(90, Math.max(36, (w * h) / 26000)));
  const motes = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 0.5 + Math.random() * 1.7,
    a: 0.12 + Math.random() * 0.4,
    vx: (Math.random() - 0.5) * 0.06,
    vy: -0.05 - Math.random() * 0.16,
    ph: Math.random() * Math.PI * 2
  }));

  function frame(t) {
    ctx.clearRect(0, 0, w, h);
    for (const m of motes) {
      m.ph += 0.006;
      m.x += m.vx + Math.sin(m.ph) * 0.14;
      m.y += m.vy;
      if (m.y < -8) { m.y = h + 8; m.x = Math.random() * w; }
      if (m.x < -8) m.x = w + 8;
      if (m.x > w + 8) m.x = -8;
      const tw = 0.62 + Math.sin(m.ph * 1.7) * 0.38;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 226, 176, ${(m.a * tw).toFixed(3)})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

startDust();



