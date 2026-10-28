/* 1B · 糖泡静止帧（WebGL2 主 / Canvas 2D 降级）
   做法：先用 2D 画一张“球背后的画面”（临时石拱，等真门图替换），
        再把这张画当纹理喂给 WebGL，球体在 shader 里做解析求交 + 折射 + 色散 + 菲涅尔。
   参数全部集中在 CONFIG，方便对照《糖泡还原规格书》。 */

const CONFIG = {
  ior: 1.42,          // 糖浆折射率
  dispersion: 0.012,  // 边缘色散强度
  refraction: 0.55,   // 折射位移缩放
  centerAlpha: 0.58,
  edgeAlpha: 0.88,
  glow: 0.28,
  sweet: 0.34,        // 琥珀染色占比
  swirl: 0.55,        // 内部糖浆对流强度
  specPower: 240.0,
  specPos: [-0.32, -0.38]
};

const qs = new URLSearchParams(location.search);
const forceFallback = qs.get("fallback") === "1";
const freezeT = qs.has("t") ? Number(qs.get("t")) : null;   // 审稿用：固定时间戳
const pushFixed = qs.has("push") ? qs.get("push").split(",").map(Number) : null; // 审稿用：模拟指针

let pointer = { x: 0, y: 0 };   // 归一化“推力”方向（未被指到时为 0）
window.addEventListener("pointermove", (e) => {
  const dx = e.clientX - window.innerWidth / 2;
  const dy = e.clientY - window.innerHeight / 2;
  const dist = Math.hypot(dx, dy) || 1;
  const near = Math.max(0, 1 - dist / (diameter * 1.7 || 1));
  pointer = near < 0.02 ? { x: 0, y: 0 } : { x: (dx / dist) * near, y: (dy / dist) * near };
});

const bg = document.getElementById("bg");
const glCanvas = document.getElementById("gl");
const ghostCanvas = document.getElementById("ghost");
const fxCanvas = document.getElementById("fx");
const tag = document.getElementById("tag");

let W = 0;
let H = 0;
let DPR = 1;
let diameter = 0;

function layout() {
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  // 桌面：短边 22%；手机：高度 18%（≈宽度 39%），与规格书的 198 / 152 对齐
  diameter = W < 720
    ? Math.round(Math.min(H * 0.18, W * 0.42))
    : Math.round(Math.min(W, H) * 0.22);
  for (const c of [bg, glCanvas, ghostCanvas]) {
    c.width = Math.round(W * DPR);
    c.height = Math.round(H * DPR);
  }
  for (const c of [glCanvas, ghostCanvas]) {
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
  }
}

/* ---------- 临时背景（球背后的画面，等真门图替换） ---------- */
function paintBackdrop() {
  const ctx = bg.getContext("2d");
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0B0917");
  g.addColorStop(0.46, "#141029");
  g.addColorStop(1, "#07060E");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.55);
  glow.addColorStop(0, "rgba(78, 60, 140, .55)");
  glow.addColorStop(1, "rgba(78, 60, 140, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const warm = ctx.createRadialGradient(W / 2, H * 0.92, 0, W / 2, H * 0.92, Math.max(W, H) * 0.42);
  warm.addColorStop(0, "rgba(255, 150, 70, .16)");
  warm.addColorStop(1, "rgba(255, 150, 70, 0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, H);

  // 石拱：给折射一点可读的结构（三层收进的拱线 + 竖向石块缝）
  ctx.save();
  ctx.translate(W / 2, H * 0.52);
  const R = Math.min(W, H) * 0.44;
  ctx.strokeStyle = "rgba(196, 176, 236, .18)";
  ctx.lineWidth = 2;
  for (const k of [1, 0.82, 0.64]) {
    ctx.beginPath();
    ctx.arc(0, R * 0.28, R * k, Math.PI * 1.06, Math.PI * 1.94);
    ctx.stroke();
  }
  // 石块缝：沿拱做的径向短线
  ctx.strokeStyle = "rgba(150, 132, 200, .13)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i <= 16; i += 1) {
    const a = Math.PI * 1.06 + (Math.PI * 0.88 * i) / 16;
    const r0 = R * 0.64;
    const r1 = R * 1.0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, R * 0.28 + Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, R * 0.28 + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();

  // 地面石缝（横向短线，增加折射可见度）
  ctx.strokeStyle = "rgba(180, 162, 230, .10)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 14; i += 1) {
    const y = H * 0.72 + i * (H * 0.02);
    ctx.beginPath();
    ctx.moveTo(W * 0.08, y);
    ctx.lineTo(W * 0.92, y);
    ctx.stroke();
  }

  // 浮尘
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.5 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 226, 176, ${(0.1 + Math.random() * 0.35).toFixed(3)})`;
    ctx.fill();
  }
}

/* ---------- WebGL ---------- */
const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D uBg;
uniform vec2 uRes;      // 逻辑像素尺寸
uniform vec2 uCenter;   // 球心（逻辑像素，会随浮动/呼吸/指针偏移）
uniform vec2 uRad;      // 横/纵半径（呼吸与挤压都改它）
uniform vec2 uLight;    // 主光方向（xy，z 固定 0.55），缓慢漂移
uniform float uR;       // 基准半径（只给发光用）
uniform float uTime;

uniform float uIor;
uniform float uDisp;
uniform float uRefr;
uniform float uCenterAlpha;
uniform float uEdgeAlpha;
uniform float uGlow;
uniform float uSweet;
uniform float uSwirl;
uniform float uSpecPower;
uniform vec2 uSpecPos;
uniform float uOnly;    // 1.0 = 只输出球体（给拖影层用，不重画背景）
uniform float uBall;    // 0.0 = 画背景但不画球（爆炸时用）

out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * noise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 bgCol = texture(uBg, uv).rgb;

  if (uBall < 0.5) {
    fragColor = vec4(bgCol, 1.0);
    return;
  }

  vec2 d = (gl_FragCoord.xy - uCenter) / uRad;
  float r2 = dot(d, d);

  // 球外：只加一圈外发光
  if (r2 > 1.0) {
    float g = exp(-(sqrt(r2) - 1.0) * 3.4) * uGlow;
    vec3 c = bgCol + vec3(1.0, 0.70, 0.28) * g;
    if (uOnly > 0.5) {
      fragColor = vec4(vec3(1.0, 0.70, 0.28) * g, g * 0.85);
    } else {
      fragColor = vec4(c, 1.0);
    }
    return;
  }

  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 n = normalize(vec3(d, z));

  // 折射：球体表面法线把视线折进去
  vec3 I = vec3(0.0, 0.0, -1.0);
  vec3 T = refract(I, n, 1.0 / uIor);
  vec2 off = T.xy / max(0.18, -T.z);
  vec2 uvOff = off * uR * uRefr / uRes;

  // 色散：只在边缘环带明显（r2 越大分离越强）
  float rim = smoothstep(0.35, 1.0, r2);
  float disp = uDisp * rim;
  vec3 refr;
  refr.r = texture(uBg, clamp(uv + uvOff * (1.0 + disp), 0.0, 1.0)).r;
  refr.g = texture(uBg, clamp(uv + uvOff, 0.0, 1.0)).g;
  refr.b = texture(uBg, clamp(uv + uvOff * (1.0 - disp), 0.0, 1.0)).b;

  // 内部糖浆：两层反向噪声，做出“里面在晃”
  vec2 sp = gl_FragCoord.xy / uR;
  float s1 = fbm(sp * 1.7 + vec2(uTime * 0.06, -uTime * 0.045));
  float s2 = fbm(sp * 2.6 - vec2(uTime * 0.052, uTime * 0.038));
  float syrup = (s1 * 0.6 + s2 * 0.4) * uSwirl;
  // 亮带 + 暗带一起做，才有糖浆在翻的体积
  vec3 syrupCol = vec3(1.0, 0.66, 0.28) * (syrup * 0.55) - vec3(0.20, 0.10, 0.02) * max(0.0, 0.42 - syrup);

  // 本体色：中心浅蜜黄 → 边缘焦糖（球必须“实”，否则会像一个玻璃环）
  vec3 bodyCol = mix(vec3(1.0, 0.80, 0.50), vec3(0.72, 0.40, 0.08), smoothstep(0.02, 1.0, r2));

  // 折射只做“透出来的一层”，主体还是糖浆
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.80, 0.50), uSweet);
  vec3 col = mix(bodyCol, refr * tint, 0.14) + syrupCol;
  // 折射只留在边缘：中心要暖、要实，边缘才透
  col = mix(col, refr * tint, 0.55 * pow(1.0 - z, 2.0));

  // 球面坐标上的糖浆纹路：两层频率相反的环流，才有 3D 的“里面在翻”
  float ang = atan(n.y, n.x);
  float swA = fbm(vec2(ang * 1.9 + uTime * 0.20, (1.0 - z) * 3.2 - uTime * 0.10));
  float swB = fbm(vec2(ang * 3.4 - uTime * 0.14, (1.0 - z) * 5.0 + uTime * 0.06));
  float band = smoothstep(0.30, 0.74, swA * 0.64 + swB * 0.36);
  vec3 swirlTint = mix(vec3(0.60, 0.24, 0.02), vec3(1.0, 0.90, 0.62), band);
  // 越靠边越薄，糖浆纹路越明显；中心留干净
  col = mix(col, swirlTint, 0.66 * smoothstep(0.03, 0.78, r2) * (0.5 + 0.5 * (1.0 - z)));

  // 边缘亮边：用角度上的噪声打断，避免做成“硬币边”
  float rimN = 0.5 + 0.95 * noise(vec2(ang * 5.5, uTime * 0.18));
  float fres = pow(1.0 - z, 4.6) * rimN;
  col += vec3(1.0, 0.86, 0.62) * fres * 0.5;

  // 中心提亮收窄，别糊成奶白
  col += vec3(1.0, 0.82, 0.52) * pow(max(0.0, 1.0 - r2), 3.4) * 0.12;

  // 漫反射：让球“有朝向”，否则永远是平的贴纸
  vec3 L = normalize(vec3(uLight, 0.55));
  float diff = max(dot(n, L), 0.0);
  col *= 0.80 + 0.42 * diff;
  // 背光侧压一点冷，别整颗黄掉
  col += vec3(0.10, 0.06, 0.16) * pow(1.0 - diff, 2.0) * 0.5;

  vec3 hv = normalize(vec3(uSpecPos, 0.86));
  float spec = pow(max(dot(n, hv), 0.0), uSpecPower);
  col += vec3(1.0, 0.99, 0.95) * spec * 0.75;
  // 右下再补一颗小的，玻璃感才对
  vec3 hv2 = normalize(vec3(0.30, 0.20, 0.90));
  col += vec3(1.0, 0.98, 0.92) * pow(max(dot(n, hv2), 0.0), 320.0) * 0.35;

  // 极边一圈暗边，模拟表面张力
  col *= mix(1.0, 0.72, smoothstep(0.86, 1.0, r2));

  // 中心略透（能看见背后的光），边缘更实（表面张力）
  float a = mix(0.70, 0.96, smoothstep(0.08, 0.95, r2));
  if (uOnly > 0.5) {
    fragColor = vec4(col, a);
  } else {
    fragColor = vec4(mix(bgCol, col, a), 1.0);
  }
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
  }
  return sh;
}

function initWebGL(target, overlay) {
  const canvas = target || glCanvas;
  // 拖影层要带 alpha，且只画球、不重画背景
  const gl = canvas.getContext("webgl2", {
    alpha: !!overlay,
    antialias: true,
    premultipliedAlpha: false
  });
  if (!gl) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || "link failed");
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bg);

  const u = {};
  for (const name of ["uBg", "uRes", "uCenter", "uRad", "uLight", "uR", "uTime", "uIor", "uDisp", "uRefr",
    "uCenterAlpha", "uEdgeAlpha", "uGlow", "uSweet", "uSwirl", "uSpecPower", "uSpecPos", "uOnly", "uBall"]) {
    u[name] = gl.getUniformLocation(prog, name);
  }

  gl.uniform1i(u.uBg, 0);
  gl.uniform2f(u.uRes, W * DPR, H * DPR);
  gl.uniform2f(u.uCenter, (W / 2) * DPR, (H / 2) * DPR);
  gl.uniform2f(u.uRad, (diameter / 2) * DPR, (diameter / 2) * DPR);
  gl.uniform2f(u.uLight, -0.55, 0.62);
  gl.uniform1f(u.uR, (diameter / 2) * DPR);
  gl.uniform1f(u.uIor, CONFIG.ior);
  gl.uniform1f(u.uDisp, CONFIG.dispersion);
  gl.uniform1f(u.uRefr, CONFIG.refraction);
  gl.uniform1f(u.uCenterAlpha, CONFIG.centerAlpha);
  gl.uniform1f(u.uEdgeAlpha, CONFIG.edgeAlpha);
  gl.uniform1f(u.uGlow, CONFIG.glow);
  gl.uniform1f(u.uSweet, CONFIG.sweet);
  gl.uniform1f(u.uSwirl, CONFIG.swirl);
  gl.uniform1f(u.uSpecPower, CONFIG.specPower);
  gl.uniform2f(u.uSpecPos, CONFIG.specPos[0], CONFIG.specPos[1]);
  gl.uniform1f(u.uOnly, overlay ? 1 : 0);
  gl.uniform1f(u.uBall, 1);

  if (overlay) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  gl.viewport(0, 0, W * DPR, H * DPR);

  // 每帧只更新“会动”的量：球心、半径（呼吸/挤压）、主光、高光位置
  function draw(state, showBall) {
    gl.uniform1f(u.uBall, showBall === false ? 0 : 1);
    if (overlay) gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.uTime, state.t);
    gl.uniform2f(u.uCenter, state.cx * DPR, state.cy * DPR);
    gl.uniform2f(u.uRad, state.rx * DPR, state.ry * DPR);
    gl.uniform2f(u.uLight, state.lx, state.ly);
    gl.uniform2f(u.uSpecPos, state.sx, state.sy);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { gl, draw, kind: "webgl2" };
}

/* ---------- Canvas 2D 降级 ---------- */
function initFallback() {
  const ctx = glCanvas.getContext("2d");
  const cx = W / 2;
  const cy = H / 2;
  const r = diameter / 2;

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);

    const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.9);
    glow.addColorStop(0, "rgba(255, 179, 71, .28)");
    glow.addColorStop(1, "rgba(255, 179, 71, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.36, r * 0.1, cx, cy, r);
    body.addColorStop(0, "rgba(255, 231, 188, .72)");
    body.addColorStop(0.5, "rgba(255, 196, 112, .80)");
    body.addColorStop(1, "rgba(200, 108, 30, .90)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(255, 246, 226, .34)";
    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0.3, Math.PI * 1.25);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 215, 154, .75)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.2, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 253, 246, .85)";
    ctx.fill();
  }

  return { draw, kind: "canvas2d" };
}

/* ---------- 1C 动效：自转 / 呼吸 / 浮动 / 高光漂移 / 指针推开 ---------- */
function motionState(t) {
  const R = diameter / 2;
  // 呼吸：幅度提到 3%（原 1.7%），周期 4.65s —— 要能一眼看出来在“吸”
  const breathe = 1 + 0.030 * Math.sin(t * 1.35);
  // 浮动：周期 11.4s（慢而有重量）。幅度按用户口径“越夸张越好”定为 7%R，
  // 注意 p2p(直径占比) = 幅度(半径占比)，所以这里就是峰-峰 7% 直径；
  // QQ堂 原版实测约 4%，即刻意做到约 1.75 倍。审稿可用 ?float=0.04 退回原版。
  const floatAmp = Number(qs.get("float") || 0.070);
  const floatY = Math.sin(t * 0.55) * (R * floatAmp);
  // 横摆：周期 16.5s，与浮动错相，避免走成一条斜线
  const swayX = Math.sin(t * 0.38 + 1.1) * (R * 0.040);

  const p = pushFixed ? { x: pushFixed[0], y: pushFixed[1] } : pointer;
  const amt = Math.min(1, Math.hypot(p.x, p.y));
  // 推开：位移 0.28R（原 0.16R），压扁 14%（原 7%）
  const pushDist = amt * R * 0.28;
  const cx = W / 2 + swayX + p.x * pushDist;
  const cy = H / 2 + floatY + p.y * pushDist;

  const squash = amt * 0.14;
  const rx = R * breathe * (1 - squash * Math.abs(p.x));
  const ry = R * breathe * (1 - squash * Math.abs(p.y));

  // 主光与高光缓慢漂移（高光跟着光源走）
  const lx = -0.55 + Math.sin(t * 0.7) * 0.10;
  const ly = 0.62 + Math.cos(t * 0.62) * 0.08;
  const sx = lx * 1.05 + Math.sin(t * 1.3) * 0.05;
  const sy = ly * 1.05 + Math.cos(t * 1.1) * 0.04;

  return { t, cx, cy, rx, ry, lx, ly, sx, sy, amt };
}

/* ---------- 启动 ---------- */
function boot() {
  layout();
  paintBackdrop();

  let renderer = null;
  if (!forceFallback) {
    try {
      renderer = initWebGL(glCanvas);
    } catch (err) {
      console.warn("[bubble] webgl 失败，退 2D:", err.message);
      renderer = null;
    }
  }
  if (!renderer) renderer = initFallback();

  // 拖影层：同一颗球、时间延迟 55ms、轻微模糊 —— 让 60Hz 也不“跳”
  const trailOn = qs.get("trail") !== "0";
  let ghost = null;
  if (trailOn && renderer.kind === "webgl2") {
    try {
      ghost = initWebGL(ghostCanvas, true);
    } catch (err) {
      console.warn("[bubble] 拖影层失败:", err.message);
      ghost = null;
    }
  }
  if (!ghost) ghostCanvas.hidden = true;

  const t0 = performance.now();
  let frames = 0;
  let fps = 0;
  // 审稿可用 ?lag=0.4 放大拖影距离，看清机制（默认 55ms）
  const TRAIL_LAG = Math.max(0.02, Number(qs.get("lag") || 0.055));

  let lastState = null;
  let ghostVisible = false;
  // 1D：爆炸状态（null = 还没爆）
  let boomAt = null;
  let boomDone = false;

  function readBoom() {
    if (typeof Burst === "undefined") return;
    const ms = freezeT === null ? performance.now() - boomAt : Number(qs.get("boom") || 0);
    Burst.render(fxCanvas, ms, { r: diameter / 2, shake: W < 720 ? 3 : 5 });
    // 球在爆前放大一下再消失；之后只画背景，不画球
    // 球只在爆前 90ms 内还在（之前 Boolean(pre) 在 >90ms 时为 true，会把球又画回来）
    const showBall = ms < 90;
    const st = motionState(0);
    if (showBall) {
      const s = Burst.preScale(ms);
      st.rx *= s;
      st.ry *= s;
    }
    renderer.draw(st, showBall);
    const hintEl = document.getElementById("hint");
    if (hintEl) hintEl.style.opacity = "0";
    tag.textContent = `1D · burst · ${Math.round(ms)}ms`;
    if (ms > 1100) boomDone = true;
  }

  function fire() {
    if (boomAt !== null) return;
    boomAt = performance.now();
    readBoom();
  }

  glCanvas.addEventListener("pointerdown", fire);

  // 审稿：?boom=120 直接定格在爆炸后 120ms（同一毫秒每次像素一致）
  const boomStill = (ms) => {
    boomAt = performance.now();
    boomDone = true;
    Burst.render(fxCanvas, ms, { r: diameter / 2, shake: W < 720 ? 3 : 5 });
    // 球只在爆前 90ms 内还在（之前 Boolean(pre) 在 >90ms 时为 true，会把球又画回来）
    const showBall = ms < 90;
    const st = motionState(0);
    if (showBall) {
      const s = Burst.preScale(ms);
      st.rx *= s;
      st.ry *= s;
    }
    renderer.draw(st, showBall);
    const hintEl = document.getElementById("hint");
    if (hintEl) hintEl.style.opacity = "0";
    tag.textContent = `1D · burst · ${ms}ms`;
    return { ms, r: diameter / 2 };
  };
  if (qs.has("boom")) boomStill(Number(qs.get("boom")));
  window.__burst = { fire, still: boomStill };

  function loop(now) {
    const t = freezeT === null ? (now - t0) / 1000 : freezeT;
    lastState = motionState(t);
    if (boomAt !== null) {
      if (!boomDone) readBoom();
      requestAnimationFrame(loop);
      return;
    }
    if (ghost) {
      const lagged = motionState(Math.max(0, t - TRAIL_LAG));
      // 审稿用 ?ghostdemo=1：把拖影层故意挪开 18px，肉眼确认这层真的在画
      if (qs.has("ghostdemo")) {
        lagged.cx += 18;
        lagged.cy -= 10;
      }
      // 只在“真的在动”的时候拖影：静止呼吸时保持干净，别把画面糊一层
      const dx = lastState.cx - lagged.cx;
      const dy = lastState.cy - lagged.cy;
      const moving = Math.hypot(dx, dy) > (qs.has("lag") ? 0 : 0.8);
      if (moving !== ghostVisible) {
        ghostVisible = moving;
        ghostCanvas.style.visibility = moving ? "visible" : "hidden";
      }
      if (moving) ghost.draw(lagged);
    }
    renderer.draw(lastState);
    frames += 1;
    if (frames === 30) fps = Math.round(30000 / (now - t0));
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  tag.textContent = `${renderer.kind} · ${diameter}px · ior ${CONFIG.ior} · 1C${ghost ? " · trail" : ""}`;

  window.__bubble = {
    kind: renderer.kind,
    diameter,
    fps: () => fps,
    params: { ...CONFIG },
    // 审稿用：读当前动效状态（球心/半径/光/高光）
    state: () => (lastState ? {
      t: +lastState.t.toFixed(2),
      cx: +lastState.cx.toFixed(1),
      cy: +lastState.cy.toFixed(1),
      rx: +lastState.rx.toFixed(1),
      ry: +lastState.ry.toFixed(1),
      push: +lastState.amt.toFixed(2)
    } : null)
  };
}

window.addEventListener("resize", () => {
  boot();
});

boot();









