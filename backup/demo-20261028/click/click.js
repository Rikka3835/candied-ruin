// 1D · 糖泡点击反馈（规格：docs/spec-candy-bubble-1D-T1.md）
// 几何：1 格 = 糖泡直径 D；臂宽 1.0D；每向伸出 5.0D；收势到 2.5D（无伤害）
// 时间：引信 5000ms；炸膜 0–40；涌出 40–120（过冲到 5.3D）；落位 120–150（5.0D）
//       顶住 150–300（伤害窗，平头，不抖）；收势 300–420（5.0→2.5，无伤害）；收掉 420–480
// 本体：WebGL2 解析球面（薄透糖膜 + 内部糖浆 + 压弹变形）；无 WebGL2 时退化为 2D 球

(function () {
  const FUSE = 5000;

  const T_MEMBRANE = 40;   // 炸膜
  const T_OUT = 120;       // 涌出到 5.3D
  const T_SETTLE = 150;    // 落回 5.0D
  const T_HOLD = 300;      // 顶住结束（伤害窗关闭）
  const T_BACK = 420;      // 收势到 2.5D
  const T_GONE = 480;      // 收干净

  const ARM_UNITS = 5.0;
  const OVER_UNITS = 5.3;
  const BACK_UNITS = 2.5;
  const ARM_W = 1.0;

  // 压弹（物理分配，见规格表 §2）
  const PRESS_CYCLES = 5;
  const PRESS_H = 0.10;    // 整体高度 −8%
  const PRESS_W = 0.05;    // 整体宽度 +4%
  const PRESS_DIP = 0.065;  // 顶部额外下陷（相对直径，肉眼可见）

  const bg = document.getElementById("bg");
  const fx = document.getElementById("fx");
  const glc = document.getElementById("gl");
  const tag = document.getElementById("tag");
  const hint = document.getElementById("hint");
  const bctx = bg.getContext("2d");
  const fctx = fx.getContext("2d");

  const ground = {
    bg: "#2a1a10",
    top: "#3d2716", mid: "#2a1a10", bottom: "#150d07",
    line: "rgba(255, 196, 140, .16)",
    floor0: "rgba(255, 170, 90, 0)", floor1: "rgba(255, 150, 70, .12)",
  };
  document.documentElement.style.setProperty("--ground", ground.bg);

  let W = 0, H = 0, DPR = 1;
  let gl = null;
  let glTried = false;
  const bubbles = [];
  let now = 0;
  let paused = false;
  let fpsAvg = 60;
  let lastT = 0;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  // 尺寸：规格 §1（桌面 48–56，手机 44–48）
  function bubbleSize() {
    const short = Math.min(W, H);
    const base = Math.round(short * 0.07);
    return clamp(base, W < 720 ? 44 : 48, W < 720 ? 48 : 56);
  }
  // 只保泡体在屏内，十字允许出屏
  function clampPos(x, y, d) {
    const pad = d * 0.5 + 2;
    return {
      x: W > pad * 2 ? clamp(x, pad, W - pad) : W / 2,
      y: H > pad * 2 ? clamp(y, pad, H - pad) : H / 2,
    };
  }

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [bg, fx]) {
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
      c.getContext("2d").setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    paintBackdrop();
    if (!glTried) {
      glTried = true;
      try {
        gl = window.BallGL ? window.BallGL.create(glc) : null;
      } catch (err) {
        gl = null;
        console.warn("BallGL failed:", err);
      }
      if (!gl) {
        glc.style.display = "none";
      }
    }
    if (gl && gl.ok) {
      gl.resize(W, H, DPR);
      gl.setBackground(bg);
    }
  }

  function paintBackdrop() {
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bctx.clearRect(0, 0, W, H);
    const g = bctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, Math.max(W, H) * 0.72);
    g.addColorStop(0, ground.top);
    g.addColorStop(0.55, ground.mid);
    g.addColorStop(1, ground.bottom);
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, W, H);
    bctx.strokeStyle = ground.line;
    bctx.lineWidth = 1.2;
    const cx = W / 2, cy = H * 0.78;
    for (let i = 0; i < 4; i += 1) {
      const r = Math.min(W, H) * (0.34 + i * 0.075);
      bctx.beginPath();
      bctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
      bctx.stroke();
    }
    const fg = bctx.createLinearGradient(0, H * 0.7, 0, H);
    fg.addColorStop(0, ground.floor0);
    fg.addColorStop(1, ground.floor1);
    bctx.fillStyle = fg;
    bctx.fillRect(0, H * 0.7, W, H * 0.3);
  }

  // ---------- 压弹（放置期 5 秒，5 次匀速） ----------
  // u∈[0,1)：0–0.55 压下去；0.55–1 带阻尼弹回（含一次上凸过冲）
  function pressAt(age) {
    if (age < 0) return 0;
    const cycle = 1000;
    const u = (age % cycle) / cycle;
    let p;
    if (u < 0.55) {
      p = ease(u / 0.55);
    } else {
      const t = (u - 0.55) / 0.45;
      p = Math.exp(-4.2 * t) * Math.cos(2 * Math.PI * 1.15 * t);
      if (p < 0) p *= 0.32; // 上凸过冲只给到 +2% 左右
    }
    return p;
  }

  function deform(age) {
    const p = pressAt(age);
    const down = Math.max(0, p);
    const up = Math.max(0, -p);
    return {
      sy: 1 - PRESS_H * down + PRESS_H * 0.25 * up,
      sx: 1 + PRESS_W * down - PRESS_W * 0.5 * up,
      dip: PRESS_DIP * down,
    };
  }

  // ---------- 十字：单一加号路径（平头，端面亮 8%） ----------
  function plusPath(ctx, arm, halfW) {
    ctx.beginPath();
    ctx.moveTo(-halfW, -arm); ctx.lineTo(halfW, -arm);
    ctx.lineTo(halfW, -halfW); ctx.lineTo(arm, -halfW);
    ctx.lineTo(arm, halfW); ctx.lineTo(halfW, halfW);
    ctx.lineTo(halfW, arm); ctx.lineTo(-halfW, arm);
    ctx.lineTo(-halfW, halfW); ctx.lineTo(-arm, halfW);
    ctx.lineTo(-arm, -halfW); ctx.lineTo(-halfW, -halfW);
    ctx.closePath();
  }

  // 糖柱：屏空间直接画（每条臂按“垂直于自身”的方向受光，整体光来自左上）
  function burstGeom(ms) {
    if (ms <= 0) return { arm: 0 };
    if (ms < T_MEMBRANE) return { arm: 0 };
    if (ms < T_OUT) {
      const k = (ms - T_MEMBRANE) / (T_OUT - T_MEMBRANE);
      return { arm: ARM_UNITS * ease(k) + (OVER_UNITS - ARM_UNITS) * Math.sin(k * Math.PI) };
    }
    if (ms < T_SETTLE) {
      const k = (ms - T_OUT) / (T_SETTLE - T_OUT);
      return { arm: OVER_UNITS + (ARM_UNITS - OVER_UNITS) * k };
    }
    if (ms < T_HOLD) return { arm: ARM_UNITS };
    if (ms < T_BACK) {
      const k = (ms - T_HOLD) / (T_BACK - T_HOLD);
      return { arm: ARM_UNITS + (BACK_UNITS - ARM_UNITS) * k };
    }
    if (ms < T_GONE) {
      const k = (ms - T_BACK) / (T_GONE - T_BACK);
      return { arm: BACK_UNITS * (1 - k) };
    }
    return { arm: 0 };
  }

  function linGrad(ctx, x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#FFE7B0");
    g.addColorStop(0.26, "#FFC963");
    g.addColorStop(0.68, "#E89030");
    g.addColorStop(1, "#A85A12");
    return g;
  }

  function plusPathAt(ctx, x, y, arm, half) {
    ctx.beginPath();
    ctx.moveTo(x - half, y - arm); ctx.lineTo(x + half, y - arm);
    ctx.lineTo(x + half, y - half); ctx.lineTo(x + arm, y - half);
    ctx.lineTo(x + arm, y + half); ctx.lineTo(x + half, y + half);
    ctx.lineTo(x + half, y + arm); ctx.lineTo(x - half, y + arm);
    ctx.lineTo(x - half, y + half); ctx.lineTo(x - arm, y + half);
    ctx.lineTo(x - arm, y - half); ctx.lineTo(x - half, y - half);
    ctx.closePath();
  }

  // 稳定伪随机（同一毫秒出同样的颗粒，不会闪）
  function h2(i) {
    let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  
// 爆炸碎屑：确定性伪随机，不占状态；只在 50–620ms 可见
function drawChunks(ctx, b, ms) {
  const D = b.d;
  const t = (ms - 60) / 1000;
  if (t <= 0) return;
  const fade = 1 - smoothstep(380, 620, ms);
  if (fade <= 0.01) return;
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const a = h2(i * 7.3 + 1.7) * Math.PI * 2;
    const sp = D * (3.4 + h2(i * 3.1 + 9.2) * 2.8);
    const sz = D * (0.075 + h2(i * 5.7 + 3.3) * 0.085);
    const gx = Math.cos(a) * sp * t;
    const gy = Math.sin(a) * sp * t + 0.5 * D * 9.0 * t * t;
    const rot = h2(i * 2.9 + 5.1) * 6.28 + t * (4 + h2(i) * 6);
    ctx.globalAlpha = fade;
    ctx.translate(b.x + gx, b.y + gy);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(-sz, -sz, sz, sz);
    g.addColorStop(0, "#FFE7B4");
    g.addColorStop(1, "#B3650F");
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-sz, -sz * 0.8, sz * 2, sz * 1.6, sz * 0.35);
    else ctx.rect(-sz, -sz * 0.8, sz * 2, sz * 1.6);
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  ctx.restore();
}

function drawBurst(ctx, b, ms) {
    const g = burstGeom(ms);
    if (!g.arm || g.arm <= 0.001) return;
    const arm = g.arm * b.d;
    const half = (ARM_W * b.d) / 2;
    const x = b.x;
    const y = b.y;

    // 第 1 步：十字改走 WebGL + SDF（与糖泡同一套逐像素渲染），Canvas 2D 版本只留作降级
    if (gl && gl.ok && gl.drawCross && arm > half) {
      // 前冲：端头在 40–140ms 鼓出来一点，顶住后回平
      const cap = smoothstep(40, 110, ms) * (1 - smoothstep(150, 250, ms));
      // 顶住微颤：150–300ms 之间 0.6px 级别的高频抖动
      const shake = ms > 150 && ms < 300 ? Math.sin(ms * 0.085) * 0.55 : 0;
      // 收势时臂同步变细（不是等宽平移），像糖被拉断
      const wf = 1 - 0.32 * smoothstep(300, 470, ms);
      gl.drawCross({ x, y, arm, hw: half * wf, time: ms / 1000, cap, shake });
      // 碎屑：8 块糖碴从中心甩出、带重力（破掉“十字图标”的对称）
      // 碎屑待定：先不画，避免半成品
      return;
    }

    // ---- 收势末尾：臂短于接头时只画一块缩小的糖块 ----
    if (arm <= half) {
      const sz = Math.max(2, arm * 2);
      const sg = ctx.createRadialGradient(x - sz * 0.18, y - sz * 0.22, 1, x, y, sz * 0.95);
      sg.addColorStop(0, "#FFF0C6");
      sg.addColorStop(0.45, "#F8B14E");
      sg.addColorStop(1, "#A85A12");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.rect(x - sz / 2, y - sz / 2, sz, sz);
      ctx.fill();
      return;
    }

    // ---- 1) 整条十字一次性填充：单一路径 + 135° 渐变，中心天然没有接缝 ----
    ctx.save();
    plusPathAt(ctx, x, y, arm, half);
    ctx.clip();
    // 竖向渐变：整条十字共用“上亮下暗”，四条臂受光一致（斜向渐变会让左白右褐）
    const gg = ctx.createLinearGradient(0, y - arm, 0, y + arm);
    gg.addColorStop(0, "#FFEDBE");
    gg.addColorStop(0.28, "#FFD480");
    gg.addColorStop(0.62, "#F2A23A");
    gg.addColorStop(1, "#B3650F");
    ctx.fillStyle = gg;
    ctx.fillRect(x - arm, y - arm, arm * 2, arm * 2);

    // 再压一层横向的左亮右暗（12%），保留“光从左上”的方向感
    const lg = ctx.createLinearGradient(x - half, 0, x + half, 0);
    lg.addColorStop(0, "rgba(255,246,214,.22)");
    lg.addColorStop(1, "rgba(90,45,6,.20)");
    ctx.fillStyle = lg;
    ctx.fillRect(x - arm, y - arm, arm * 2, arm * 2);

    // 2) 纵向加重：上亮下暗，让"糖条"有厚度
    const vg = ctx.createLinearGradient(0, y - arm, 0, y + arm);
    vg.addColorStop(0, "rgba(255,240,200,.16)");
    vg.addColorStop(0.45, "rgba(255,220,160,0)");
    vg.addColorStop(1, "rgba(120,60,8,.28)");
    ctx.fillStyle = vg;
    ctx.fillRect(x - arm, y - arm, arm * 2, arm * 2);

    // 3) 糖霜颗粒（只在裁切区内，密度按面积）
    const area = 4 * arm * half - 4 * half * half;
    const n = Math.max(50, Math.min(300, Math.round(area / 150)));
    for (let i = 0; i < n; i += 1) {
      const px = x - arm + h2(i * 3 + 1) * arm * 2;
      const py = y - arm + h2(i * 3 + 2) * arm * 2;
      const inside = Math.abs(px - x) <= half || Math.abs(py - y) <= half;
      if (!inside) continue;
      const rr = 0.7 + h2(i * 3 + 3) * 1.9;
      ctx.fillStyle = "rgba(255,244,212," + (0.16 + h2(i * 5) * 0.42).toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ---- 4) 轮廓：1px 深收口 + 外侧一圈糖壳疙瘩（打断直边） ----
    ctx.strokeStyle = "rgba(104,52,8,.55)";
    ctx.lineWidth = 1;
    plusPathAt(ctx, x, y, arm - 0.5, half - 0.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,226,150,.75)";
    const step = Math.max(4.5, b.d * 0.11);
    const crust = (cx0, cy0, dx, dy, len) => {
      const dir = Math.sign(len) || 1;
      const total = Math.abs(len);
      for (let d0 = step * 0.3; d0 < total; d0 += step) {
        const j = h2(Math.round(cx0 * 3 + cy0 * 5 + d0 * 11));
        const j2 = h2(Math.round(cx0 * 7 + cy0 * 3 + d0 * 13));
        const off = (j - 0.5) * 3.4;              // 沿法线随机进出，别排成虚线
        const at = d0 * dir + (j2 - 0.5) * step * 0.9;
        const bx = cx0 + (dx ? at : off);
        const by = cy0 + (dy ? at : off);
        ctx.beginPath();
        ctx.arc(bx, by, 0.9 + j2 * 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    crust(x, y - half, 1, 0, arm);      // 上臂左边
    crust(x, y + half, 1, 0, arm);      // 下臂左边
    crust(x + half, y, 0, 1, arm);      // 右臂上边
    crust(x - half, y, 0, 1, arm);      // 左臂上边
    crust(x, y + half, 1, 0, -arm);     // 反向（左臂下边）
    crust(x, y - half, 1, 0, -arm);
    crust(x - half, y, 0, 1, -arm);
    crust(x + half, y, 0, 1, -arm);

    // ---- 5) 四个端面：平头，切面亮一条 ----
    const t = Math.max(1.5, b.d * 0.05);
    ctx.fillStyle = "rgba(255,240,206,.42)";
    ctx.fillRect(x + arm - t, y - half + 1, t, half * 2 - 2);
    ctx.fillRect(x - arm, y - half + 1, t, half * 2 - 2);
    ctx.fillRect(x - half + 1, y - arm, half * 2 - 2, t);
    ctx.fillRect(x - half + 1, y + arm - t, half * 2 - 2, t);

    // ---- 6) 中心：一点热核心（很淡，只压一层） ----
    const cg = ctx.createRadialGradient(x, y, 1, x, y, half * 2.1);
    cg.addColorStop(0, "rgba(255,252,236,.55)");
    cg.addColorStop(0.5, "rgba(255,226,162,.18)");
    cg.addColorStop(1, "rgba(255,210,140,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(x - half * 2.2, y - half * 2.2, half * 4.4, half * 4.4);
  }

  // ---------- 连锁 ----------
  function hits(b, other) {
    const arm = ARM_UNITS * b.d;
    const halfW = (ARM_W * b.d) / 2 + other.d / 2;
    const dx = other.x - b.x;
    const dy = other.y - b.y;
    const inH = Math.abs(dy) <= halfW && Math.abs(dx) <= arm + other.d / 2;
    const inV = Math.abs(dx) <= halfW && Math.abs(dy) <= arm + other.d / 2;
    return inH || inV;
  }

  function spawn(x, y) {
    const d = bubbleSize();
    const p = clampPos(x, y, d);
    bubbles.push({
      x: p.x, y: p.y, d,
      born: performance.now(),
      fuse: FUSE,
      state: "fuse",
      burstAt: 0,
    });
    hint.style.opacity = "0";
  }

  function update(t) {
    for (const b of bubbles) {
      if (b.state === "fuse" && t - b.born >= b.fuse) {
        b.state = "burst";
        b.burstAt = t;
      }
      if (b.state === "burst") {
        const ms = t - b.burstAt;
        if (ms >= T_SETTLE && ms < T_HOLD) {
          for (const o of bubbles) {
            if (o === b || o.state !== "fuse") continue;
            if (hits(b, o)) {
              o.state = "burst";
              o.burstAt = t + 60 + Math.random() * 30;
            }
          }
        }
        if (ms > T_GONE) b.state = "done";
      }
    }
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      if (bubbles[i].state === "done") bubbles.splice(i, 1);
    }
  }

  // 2D 退化球（无 WebGL2）
  function drawBall2D(ctx, b, t) {
    const age = t - b.born;
    const df = deform(age);
    const R = b.d / 2;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(df.sx, df.sy);
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, "#FFE9B8");
    g.addColorStop(0.45, "#FFD276");
    g.addColorStop(0.8, "#E08A2A");
    g.addColorStop(1, "#8A4A0E");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,246,220,.75)";
    ctx.lineWidth = Math.max(1, R * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.97, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBalls(t) {
    if (gl && gl.ok) {
      gl.begin();
      for (const b of bubbles) {
        if (b.state !== "fuse") continue;
        const age = t - b.born;
        const df = deform(age);
        gl.draw({ x: b.x, y: b.y + (b.d / 2) * (1 - df.sy), R: b.d / 2, sx: df.sx, sy: df.sy, dip: df.dip, flash: 0, time: age / 1000 });
      }
    } else {
      for (const b of bubbles) if (b.state === "fuse") drawBall2D(fctx, b, t);
    }
  }

  function frame(t) {
    if (paused) return;
    if (lastT) fpsAvg = fpsAvg * 0.9 + (1000 / Math.max(1, t - lastT)) * 0.1;
    lastT = t;
    now = t;
    update(t);
    drawBalls(t);
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fx.width, fx.height);
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const b of bubbles) {
      if (b.state === "burst") drawBurst(fctx, b, t - b.burstAt);
    }
    tag.textContent = "1D · click bubble · " + bubbles.length + " 颗 · D=" + Math.round(bubbleSize()) + " · " + (gl && gl.ok ? "webgl2" : "2d") + " · " + Math.round(fpsAvg) + "fps";
    requestAnimationFrame(frame);
  }

  // ---------- 审稿接口 ----------
  window.__click = {
    spawn,
    clear() { bubbles.length = 0; },
    // 定格：一颗在球心，给定「引信时间 age」或「爆炸毫秒 ms」
    still(ms, opts) {
      const o = opts || {};
      bubbles.length = 0;
      const d = bubbleSize();
      const p = clampPos(W / 2, H / 2, d);
      if (o.age != null) {
        bubbles.push({ x: p.x, y: p.y, d, born: -o.age, fuse: FUSE, state: "fuse", burstAt: 0 });
        paused = true;
        hint.style.opacity = "0";
        drawBalls(0);
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.clearRect(0, 0, fx.width, fx.height);
        tag.textContent = "1D · still age=" + o.age + "ms · D=" + Math.round(d);
        return { age: o.age, d: Math.round(d) };
      }
      bubbles.push({ x: p.x, y: p.y, d, born: 0, fuse: FUSE, state: "burst", burstAt: -ms });
      if (o.chain) {
        const q = clampPos(W / 2 - d * 3.4, H / 2, d);
        bubbles.push({ x: q.x, y: q.y, d, born: -1000, fuse: FUSE, state: "fuse", burstAt: 0 });
      }
      paused = true;
      hint.style.opacity = "0";
      if (gl && gl.ok) { gl.begin(); }
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, fx.width, fx.height);
      fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const b of bubbles) {
        if (b.state === "fuse") {
          if (gl && gl.ok) {
            const df = deform(0);
            gl.draw({ x: b.x, y: b.y + (b.d / 2) * (1 - df.sy), R: b.d / 2, sx: df.sx, sy: df.sy, dip: df.dip, flash: 0, time: 0 });
          } else drawBall2D(fctx, b, 0);
        } else drawBurst(fctx, b, ms);
      }
      tag.textContent = "1D · still " + ms + "ms · D=" + Math.round(d);
      return { ms, d: Math.round(d), count: bubbles.length };
    },
    resume() { paused = false; requestAnimationFrame(frame); },
    state() {
      return bubbles.map((b) => ({
        x: Math.round(b.x), y: Math.round(b.y), d: Math.round(b.d),
        state: b.state, age: Math.round(now - b.born),
      }));
    },
    geom() {
      const d = bubbleSize();
      const tex = barTex(d, DPR);
      return { d, arm: ARM_UNITS * d, span: 2 * ARM_UNITS * d, width: ARM_W * d, texLen: tex.len, texTh: tex.th };
    },
    kind() { return gl && gl.ok ? "webgl2" : "2d"; },
    debug(age) { return { press: pressAt(age), ...deform(age) }; },
    // 同步压测：连续画 n 帧、每帧 m 颗球，返回每帧耗时（ms）
    bench(n, m) {
      const frames = n || 120;
      const count = m || 12;
      if (!gl || !gl.ok) return { kind: "2d" };
      const t0 = performance.now();
      for (let i = 0; i < frames; i += 1) {
        gl.begin();
        for (let k = 0; k < count; k += 1) {
          gl.draw({ x: 120 + k * 90, y: 300, R: 28, sx: 1, sy: 1, dip: 0, flash: 0, time: i / 60 });
        }
      }
      gl.finish && gl.finish();
      const ms = performance.now() - t0;
      return { kind: "webgl2", frames, count, total: +ms.toFixed(1), perFrame: +(ms / frames).toFixed(3) };
    },
  };

  window.addEventListener("resize", layout);
  window.addEventListener("pointerdown", (e) => spawn(e.clientX, e.clientY));
  layout();
  requestAnimationFrame(frame);
})();







