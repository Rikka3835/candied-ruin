// 1D · 糖泡点击反馈的十字爆炸（v3，按《规格表 v3》重写）
// 关键口径（改了任何一条都要同步改这里，并重新量读数）：
//   D = 糖泡直径；R = D/2
//   臂宽 = 0.38D      臂长（满）= 0.95D      中心核方块边 = 0.62D
//   帧序：0ms 白闪 → 0–40ms 冲出 → 40–70ms 保持 → 70–130ms 缩回 50% → 130–180ms 收掉
//   碎屑：180ms 后独立存活 300–700ms；抖动 5px 衰减 180ms

(function () {
  const T_OUT = 40; // 冲出结束
  const T_HOLD = 70; // 保持结束
  const T_BACK = 130; // 缩回到 50%
  const T_GONE = 180; // 收掉
  const BACK_TO = 0.5; // 缩回到满长的 50%

  const ARM_W = 0.38; // × D
  const ARM_LEN = 0.95; // × D（单侧）
  const CORE = 0.50; // × D（方块核边长；原版核比臂略宽，但不该盖住半条臂）

  const COLORS = ["#FFD35A", "#FFB347", "#FF9A2E", "#E88E1F"];

  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  // 确定性随机：同一个 i 永远同一个值，保证“同一 ms 像素一致”
  function rnd(seed, i) {
    const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function ease(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // 长度包络（1 = 满长）
  function envelope(ms) {
    if (ms <= 0) return 0;
    if (ms < T_OUT) return ease(ms / T_OUT);
    if (ms < T_HOLD) return 1;
    if (ms < T_BACK) return lerp(1, BACK_TO, (ms - T_HOLD) / (T_BACK - T_HOLD));
    if (ms < T_GONE) return lerp(BACK_TO, 0.22, (ms - T_BACK) / (T_GONE - T_BACK));
    return 0;
  }
  function alphaAt(ms) {
    // 收掉要快：150ms 之前保持全亮，之后 30ms 内消失在亮里（不要留半透明土黄）
    if (ms >= T_GONE) return 0;
    if (ms < 150) return 1;
    return clamp(1 - (ms - 150) / (T_GONE - 150), 0, 1);
  }
  function flashAt(ms) {
    if (ms > 70) return 0;
    return clamp(1 - ms / 70, 0, 1);
  }
  function shakeAt(ms, amp) {
    if (ms > 180) return 0;
    return amp * Math.pow(1 - ms / 180, 2);
  }

  // 糖霜颗粒瓦片：一次生成，之后只做 source-atop
  let grainTile = null;
  function grain(w) {
    if (grainTile) return grainTile;
    const c = document.createElement("canvas");
    c.width = c.height = w;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, w);
    const n = Math.round(w * 0.55);
    for (let i = 0; i < n; i += 1) {
      const x = rnd(7, i) * w;
      const y = rnd(13, i) * w;
      const r = 0.6 + rnd(17, i) * 2.1;
      const a = 0.25 + rnd(23, i) * 0.6;
      g.fillStyle = "rgba(255,255,255," + a.toFixed(2) + ")";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    grainTile = c;
    return c;
  }

  // 画本体到离屏画布（中心对齐）
  function paintMass(D, env, alpha) {
    const S = Math.ceil(D * 2.6);
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const cx = S / 2;
    const cy = S / 2;
    const halfW = (ARM_W * D) / 2;
    const len = ARM_LEN * D * env;
    const coreS = CORE * D * (0.7 + 0.3 * env);

    // 四条方柱：平头、拐角 2px
    const armFill = g.createRadialGradient(cx, cy, 0, cx, cy, len + coreS * 0.5);
    armFill.addColorStop(0, "rgba(255, 246, 208, 1)");
    armFill.addColorStop(0.55, "rgba(255, 208, 110, 1)");
    armFill.addColorStop(1, "rgba(255, 172, 64, 1)");
    g.fillStyle = armFill;
    const r = Math.max(2, D * 0.01);
    for (let k = 0; k < 4; k += 1) {
      const w = k % 2 === 0 ? halfW * 2 : halfW * 2;
      const h = len;
      g.save();
      g.translate(cx, cy);
      g.rotate((k * Math.PI) / 2);
      g.beginPath();
      // 从中心往外：宽 2*halfW、高 len 的方柱，末端平
      g.roundRect(-w / 2, 0, w, h, r);
      g.fill();
      g.restore();
    }

    // 中心方块核（与四臂熔接）
    g.fillStyle = "rgba(255, 238, 190, 1)";
    g.beginPath();
    g.roundRect(cx - coreS / 2, cy - coreS / 2, coreS, coreS, r);
    g.fill();

    // 糖霜颗粒（只在团块内部）
    g.globalCompositeOperation = "source-atop";
    const tile = grain(96);
    const pat = g.createPattern(tile, "repeat");
    if (pat) {
      g.globalAlpha = 0.5;
      g.fillStyle = pat;
      g.fillRect(0, 0, S, S);
    }
    // 焦糖流纹
    g.globalAlpha = 0.16;
    g.strokeStyle = "#B25A12";
    g.lineWidth = Math.max(1, D * 0.012);
    for (let k = 0; k < 4; k += 1) {
      g.save();
      g.translate(cx, cy);
      g.rotate((k * Math.PI) / 2);
      g.beginPath();
      g.moveTo(-halfW * 0.55, 0);
      g.lineTo(-halfW * 0.55, len * 0.92);
      g.stroke();
      g.restore();
    }
    // 边缘糖壳：沿四条臂的外缘长一圈大小不一的糖疙瘩，打断 roundRect 的直边
    g.globalAlpha = 0.6;
    g.fillStyle = "rgba(255, 200, 110, 1)";
    for (let k = 0; k < 4; k += 1) {
      for (let side = -1; side <= 1; side += 2) {
        const step = Math.max(6, D * 0.055);
        for (let d = step * 0.4; d < len; d += step) {
          const rr = (0.018 + rnd(61 + k, Math.round(d)) * 0.032) * D;
          const jitter = (rnd(67 + k + side, Math.round(d)) - 0.5) * D * 0.02;
          g.save();
          g.translate(cx, cy);
          g.rotate((k * Math.PI) / 2);
          g.beginPath();
          g.arc(side * (halfW + jitter), d, rr, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
    }

    // 外侧糖渣：只加在臂的侧边上，间距随机，避免“等距珠边”
    g.globalAlpha = 0.85;
    g.fillStyle = "rgba(255, 200, 96, 1)";
    for (let k = 0; k < 4; k += 1) {
      for (let side = -1; side <= 1; side += 2) {
        const count = 3;
        for (let i = 0; i < count; i += 1) {
          const t = 0.35 + i * 0.22 + rnd(31 + k * 7 + side, i) * 0.12;
          const rr = (0.09 + rnd(37 + k + side, i) * 0.07) * D;
          const off = halfW + rr * 1.02;
          g.save();
          g.translate(cx, cy);
          g.rotate((k * Math.PI) / 2);
          g.beginPath();
          g.arc(side * off, len * t, rr, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    // 白色毛边：自身的模糊副本叠在上面
    const edge = document.createElement("canvas");
    edge.width = edge.height = S;
    const eg = edge.getContext("2d");
    eg.filter = "blur(" + Math.max(2, D * 0.02).toFixed(1) + "px)";
    eg.drawImage(c, 0, 0);
    eg.filter = "none";
    eg.globalCompositeOperation = "source-in";
    eg.fillStyle = "rgba(255, 250, 230, 0.85)";
    eg.fillRect(0, 0, S, S);

    // 白核光（压在最上）
    const hot = g.createRadialGradient(cx, cy, 0, cx, cy, coreS * 0.60);
    hot.addColorStop(0, "rgba(255,255,255,1)");
    hot.addColorStop(0.5, "rgba(255,248,214,.72)");
    hot.addColorStop(1, "rgba(255,240,190,0)");
    g.fillStyle = hot;
    g.beginPath();
    g.arc(cx, cy, coreS * 0.60, 0, Math.PI * 2);
    g.fill();

    return { canvas: c, fringe: edge, size: S };
  }

  function drawDebris(ctx, D, ms, cx, cy) {
    const t = ms - T_GONE;
    if (t < 0) return;
    const g = 2100;
    const tiers = [
      { n: 4, r: 0.105, sp: 1.5, life: 900 },
      { n: 10, r: 0.062, sp: 2.1, life: 820 },
      { n: 34, r: 0.032, sp: 2.6, life: 700 },
    ];
    let idx = 0;
    for (const tier of tiers) {
      for (let i = 0; i < tier.n; i += 1) {
        const life = tier.life * (0.7 + rnd(41, idx) * 0.5);
        if (t > life) {
          idx += 1;
          continue;
        }
        const a = rnd(43, idx) * Math.PI * 2;
        const sp = (0.8 + rnd(47, idx) * 1.8) * D * tier.sp * 0.5;
        const k = 0.55;
        const tt = t / 1000;
        const ease2 = (1 - Math.exp(-k * t)) / k / 1000;
        const x = cx + Math.cos(a) * sp * ease2 * 1000 * 0.5;
        const y = cy + Math.sin(a) * sp * ease2 * 1000 * 0.5 + 0.5 * g * tt * tt;
        const fade = clamp(1 - t / life, 0, 1);
        ctx.globalAlpha = fade;
        ctx.fillStyle = COLORS[idx % COLORS.length];
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, tier.r * D * (0.7 + rnd(53, idx) * 0.6)), 0, Math.PI * 2);
        ctx.fill();
        idx += 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFlash(ctx, D, ms, cx, cy) {
    const f = flashAt(ms);
    if (f <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const rr = D * (0.5 + 0.7 * (1 - f));
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    grad.addColorStop(0, "rgba(255,255,255," + (0.95 * f).toFixed(3) + ")");
    grad.addColorStop(0.45, "rgba(255,246,214," + (0.55 * f).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(255,214,140,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 爆前 90ms 泡体放大 8%（bubble.js 会读它来缩球）
  function preScale(ms) {
    if (ms < 0 || ms > 90) return 1;
    return 1 + 0.08 * (ms / 90);
  }

  const Burst = {
    render(canvas, ms, opts) {
      const o = opts || {};
      // 画布按 CSS 像素对齐（DPR 只影响清晰度，不影响坐标），否则会被浏览器拉伸
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth;
      const H = window.innerHeight;
      const bw = Math.round(W * dpr);
      const bh = Math.round(H * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, bw, bh);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const D = o.r ? o.r * 2 : Math.min(W, H) * 0.22;
      const cx = o.cx === undefined ? W / 2 : o.cx;
      const cy = o.cy === undefined ? H / 2 : o.cy;
      const sh = shakeAt(ms, o.shake === undefined ? 5 : o.shake);
      ctx.translate(Math.sin(ms * 0.9) * sh, Math.cos(ms * 1.3) * sh);

      const env = envelope(ms);
      const al = alphaAt(ms);
      if (ms >= 140 && env > 0 && al > 0) {
        // 收尾 40ms：只留一个纯亮的小十字（再叠纹理会在紫底上发土黄）
        const hw = (ARM_W * D) / 2;
        const ln = ARM_LEN * D * env;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = al;
        ctx.fillStyle = "#FFE9A8";
        for (let k = 0; k < 4; k += 1) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((k * Math.PI) / 2);
          ctx.beginPath();
          ctx.roundRect(-hw, 0, hw * 2, ln, Math.max(2, D * 0.01));
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      } else if (env > 0 && al > 0) {
        const m = paintMass(D, env, al);
        // 消散阶段用 lighter，避免半透明棕色叠在紫底上变“土”
        if (al < 0.999) ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = al;
        ctx.drawImage(m.canvas, cx - m.size / 2, cy - m.size / 2);
        if (al < 0.999) ctx.globalCompositeOperation = "source-over";
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = al * 0.55;
        ctx.drawImage(m.fringe, cx - m.size / 2, cy - m.size / 2);
        ctx.globalAlpha = al * 0.28;
        ctx.filter = "blur(" + (D * 0.09).toFixed(1) + "px)";
        ctx.drawImage(m.canvas, cx - m.size / 2, cy - m.size / 2);
        ctx.filter = "none";
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      drawFlash(ctx, D, ms, cx, cy);
      if (ms > T_HOLD) drawDebris(ctx, D, ms, cx, cy);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    T: { T_OUT, T_HOLD, T_BACK, T_GONE, ARM_W, ARM_LEN, CORE },
    envelope,
    alphaAt,
    preScale,
  };

  window.Burst = Burst;
})();



