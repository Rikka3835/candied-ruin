// 1D · T1 糖泡渲染器（WebGL2）
// 一个球 = 一个 quad = 1 次 draw call；压弹不改几何，只改 4 个 uniform（uSX/uSY/uDip/uFlash）。
// 材质：薄透糖膜（边缘亮环 + 轻微折射）+ 内部高浓度糖浆（双层对流）+ 硬高光。
(function () {
  const VS = `#version 300 es
in vec2 aPos;
uniform vec4 uRect;   // cx, cy, halfW, halfH（CSS px，y 向下）
uniform vec2 uRes;
void main() {
  vec2 p = uRect.xy + aPos * uRect.zw;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

  const FS = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uR;
uniform float uSX;
uniform float uSY;
uniform float uDip;
uniform float uFlash;
uniform float uTime;
uniform sampler2D uBg;
uniform float uKind;     // 0 = 糖泡（球），1 = 爆炸十字
uniform float uArm;      // 十字半长（设备像素）
uniform float uHalfW;    // 十字臂宽的一半（设备像素）
uniform float uCap;      // 端头前冲强度 0..1（冲出去时端头鼓一点）
uniform float uShake;    // 顶住微颤（像素级）
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// 圆角矩形 SDF
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
// 椭圆近似 SDF（边界附近足够准）
float sdEllipse(vec2 p, vec2 rad) {
  return (length(p / rad) - 1.0) * min(rad.x, rad.y);
}
// 十字 = 两个圆角矩形并集；四条臂的端头各加一个半椭圆拱（∩），侧边仍是直的
// 单条臂 = 胶囊，但在 x 方向做了缩放 → 端头是半椭圆拱（∩），且只有一个解析式、
// 没有“箱体+椭圆”的并集接缝（上一版的菱形折痕就是拼接造成的）
float armSDF(vec2 q, float hd, float hw, float kx) {
  float L = hd * kx;
  vec2 m = vec2(q.x * kx, q.y);
  float d = length(vec2(m.x - min(m.x, L), m.y)) - hw;
  return d / kx;
}
float crossDepth(vec2 q, float arm, float hw, float cap) {
  vec2 a = abs(q);
  float rxE = hw * (0.70 + 0.20 * cap);
  float hdE = max(arm - rxE, 1.0);
  float uX = sqrt(max(0.0, 1.0 - pow(max(0.0, (a.x - hdE) / rxE), 2.0) - pow(a.y / hw, 2.0)));
  float uY = sqrt(max(0.0, 1.0 - pow(max(0.0, (a.y - hdE) / rxE), 2.0) - pow(a.x / hw, 2.0)));
  // 交叉处不能用硬 max：两条臂的等值面在那里相交，会形成 X 形折痕（用户：太丑、不自然）。
  // 改成平滑并集（多项式 smin），让交汇处自然过渡成圆角。
  float k = 0.30;
  float a1 = 1.0 - uX;
  float a2 = 1.0 - uY;
  float h = clamp(0.5 + 0.5 * (a1 - a2) / k, 0.0, 1.0);
  float shallow = mix(a1, a2, h) - k * h * (1.0 - h);
  return clamp(1.0 - shallow, 0.0, 1.0);
}

// 单条臂（带角度/长度/半宽抖动）：rotate 到 +x 方向后当胶囊处理
float armSDFJ(vec2 q, float ang, float len, float hw, float cap) {
  float c = cos(ang), sn = sin(ang);
  vec2 r = vec2(c * q.x + sn * q.y, -sn * q.x + c * q.y);
  float rx = hw * (0.70 + 0.20 * cap);
  float kx = hw / rx;
  float hd = max(len - rx, hw * 0.18 + 1.0);
  return armSDF(vec2(max(r.x, 0.0), r.y), hd, hw, kx);
}
float armDepthJ(vec2 q, float ang, float len, float hw, float cap) {
  float c = cos(ang), sn = sin(ang);
  vec2 r = vec2(c * q.x + sn * q.y, -sn * q.x + c * q.y);
  vec2 m = vec2(max(r.x, 0.0), r.y);
  float rxE = hw * (0.70 + 0.20 * cap);
  float hdE = max(len - rxE, 1.0);
  return sqrt(max(0.0, 1.0 - pow(max(0.0, (m.x - hdE) / rxE), 2.0) - pow(m.y / hw, 2.0)));
}
// 四条臂：长度 ±6%、半宽 ±4%、角度 ±3°（用户要的“失序”）
float crossSDFJ(vec2 q, float arm, float hw, float cap) {
  float best = 1e5;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float j1 = hash(vec2(fi, 3.1));
    float j2 = hash(vec2(fi, 5.7));
    float j3 = hash(vec2(fi, 9.3));
    float len = arm * (1.0 + 0.05 * (j1 - 0.5));
    float hw2 = hw * (1.0 + 0.04 * (j2 - 0.5));
    float ang = fi * 1.5707963 + 0.042 * (j3 - 0.5);
    best = min(best, armSDFJ(q, ang, len, hw2, cap));
  }
  return best;
}
float crossDepthJ(vec2 q, float arm, float hw, float cap) {
  float best = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float j1 = hash(vec2(fi, 3.1));
    float j2 = hash(vec2(fi, 5.7));
    float j3 = hash(vec2(fi, 9.3));
    float len = arm * (1.0 + 0.12 * (j1 - 0.5));
    float hw2 = hw * (1.0 + 0.08 * (j2 - 0.5));
    float ang = fi * 1.5707963 + 0.1047 * (j3 - 0.5);
    best = max(best, armDepthJ(q, ang, len, hw2, cap));
  }
  return best;
}
// 交汇处的高度场：把两条臂的“到侧边距离”用平滑 min 合起来，
// 再取 sqrt(1-m^2) 作为高度 → 法线不打结，不会出现 X 形缝
float crossHN(vec2 q, float hw) {
  vec2 a = abs(q);
  float k = hw * 0.55;
  float h = clamp(0.5 + 0.5 * (a.x - a.y) / k, 0.0, 1.0);
  float m = mix(a.x, a.y, h) - k * h * (1.0 - h);
  m = min(m, hw);
  return sqrt(max(0.0, 1.0 - pow(m / hw, 2.0)));
}
float crossU(vec2 q, float arm, float hw, float cap) {
  float hn = crossHN(q, hw);
  vec2 a = abs(q);
  // 轴向位置也要用平滑 max：max() 在对角线有一个折点，会把法线带出一条斜缝
  float k2 = hw * 0.55;
  float h2 = clamp(0.5 + 0.5 * (a.x - a.y) / k2, 0.0, 1.0);
  float along = mix(a.y, a.x, h2) + k2 * h2 * (1.0 - h2);
  float rxE = hw * (0.70 + 0.20 * cap);
  float hdE = max(arm - rxE, 1.0);
  float taper = sqrt(max(0.0, 1.0 - pow(max(0.0, (along - hdE) / rxE), 2.0)));
  return clamp(hn * taper, 0.0, 1.0);
}
float sdCross(vec2 p, float arm, float hw, float r, float cap) {
  float rx = hw * (0.70 + 0.20 * cap);   // 拱的轴向半径
  float kx = hw / rx;                    // 缩放系数：>1 表示拱比半圆更扁
  float hd = max(arm - rx, r + 1.0);
  vec2 q = abs(p);
  float d = min(armSDF(q, hd, hw, kx), armSDF(q.yx, hd, hw, kx));
  return d;
}
void main() {
  // 转成 CSS px、y 向下
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);

  if (uKind > 0.5) {
    vec2 pc = frag - uCenter;
    float r = max(0.8, uHalfW * 0.18);
    float d = sdCross(pc, uArm + uShake, uHalfW, r, uCap);

    float a = smoothstep(1.5, -1.5, d);   // 不透明：Canvas alpha 参与合成会整体压暗
    if (a <= 0.004) discard;

    float u = clamp(crossU(pc, uArm + uShake, uHalfW, uCap), 0.0, 1.0);

    // 法线与颜色共用同一个光滑高度场 → 交汇处不可能出现折痕
    float e = 1.4;
    float hx = crossU(pc + vec2(e, 0.0), uArm + uShake, uHalfW, uCap) - crossU(pc - vec2(e, 0.0), uArm + uShake, uHalfW, uCap);
    float hy = crossU(pc + vec2(0.0, e), uArm + uShake, uHalfW, uCap) - crossU(pc - vec2(0.0, e), uArm + uShake, uHalfW, uCap);
    vec2 gh = vec2(hx, hy) / (2.0 * e);
    vec3 n = normalize(vec3(-gh * uHalfW * 1.6, max(u, 0.12)));

    vec3 deep = vec3(0.545, 0.290, 0.055);
    vec3 mid  = vec3(0.878, 0.541, 0.165);
    vec3 lite = vec3(1.000, 0.824, 0.463);

    // 与糖泡同一套映射：depth=0 中心 → lite，depth=1 边缘 → deep
    float depth = 1.0 - u;
    vec3 col = mix(lite, mid, smoothstep(0.05, 0.55, depth));
    col = mix(col, deep, smoothstep(0.45, 0.98, depth));

    float lam0 = clamp(dot(n, normalize(vec3(-0.46, -0.60, 0.72))), 0.0, 1.0);
    col = mix(col, lite, smoothstep(0.35, 1.0, lam0) * 0.30);

    // 交汇处亮度对齐臂身
    float cen = smoothstep(uHalfW * 2.6, uHalfW * 1.1, length(pc));
    col = mix(col, mix(lite, mid, 0.25), cen);

    // 能量梯度：中心热、端头收
    float er = clamp(length(pc) / max(uArm, 1.0), 0.0, 1.0);
    col = mix(col * vec3(1.03, 1.01, 0.99), col * vec3(0.96, 0.96, 0.98), smoothstep(0.10, 1.0, er));

    // 内部对流（压低，避免脏斑）
    float n1 = noise(pc * 0.055 + vec2(uTime * 0.10, -uTime * 0.07));
    float n2 = noise(pc * 0.09 - vec2(uTime * 0.09, uTime * 0.12) + 11.7);
    float swirl = (n1 * 0.62 + n2 * 0.38 - 0.5) * 1.6;
    col = mix(col, mix(deep, lite, clamp(0.60 + swirl, 0.0, 1.0)), 0.06 * u);

    // 折射
    vec2 uvx = vec2(frag.x / uRes.x, 1.0 - frag.y / uRes.y);
    vec3 bgc = texture(uBg, clamp(uvx + n.xy * 0.035 * (1.0 - u), 0.001, 0.999)).rgb;
    col = mix(col, bgc * vec3(1.55, 1.42, 1.20), 0.14 * pow(1.0 - u, 2.0));
    col *= 1.0 - 0.10 * smoothstep(0.15, 0.0, u);

    // 配平到糖泡实测色（压边缘之前的那一版）
    col *= vec3(1.113, 0.990, 0.956);

    outColor = vec4(col, a);
    return;
  }

  vec2 p = (frag - uCenter) / uR;

  // 逆变换：压扁 / 拉宽 / 顶部下陷 / 底沿压平
  p.x /= uSX;
  p.y /= uSY;
  // 顶部下陷：把 p.y 往“上”（y 向下坐标系里的负方向）挪，等价于轮廓顶部往里凹
  float topness = smoothstep(0.15, 1.0, -p.y);
  p.y -= uDip * topness;
  // 底沿不再硬压平：那会在底部形成一个尖角（像桃子）。压扁交给 uSY，体积感交给顶部下陷。

  float r2 = dot(p, p);
  // 用屏幕导数算 1px 宽的软边，否则 56px 下轮廓是硬切、会出锯齿
  float aa = 2.6 / max(uR, 1.0); // ≈2.6px 的软边
  float a = 1.0 - smoothstep(1.0 - aa, 1.0, r2);
  if (a <= 0.002) discard;

  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 n = vec3(p.x, p.y, z);

  // 薄膜：折射很轻，只取一点点背景
  vec3 I = vec3(0.0, 0.0, -1.0);
  vec3 refr = refract(I, n, 1.0 / 1.42);
  vec2 uv = vec2(frag.x / uRes.x, 1.0 - frag.y / uRes.y);
  vec3 bg = texture(uBg, clamp(uv + refr.xy * 0.05, 0.001, 0.999)).rgb;

  // 本体：单一琥珀族
  vec3 deep  = vec3(0.545, 0.290, 0.055);  // #8A4A0E
  vec3 mid   = vec3(0.878, 0.541, 0.165);  // #E08A2A
  vec3 lite  = vec3(1.000, 0.824, 0.463);  // #FFD276
  vec3 cream = vec3(1.000, 0.914, 0.722);  // #FFE9B8

  float depth = 1.0 - z;                  // 0 中心 → 1 边缘
  vec3 body = mix(lite, mid, smoothstep(0.05, 0.55, depth));
  body = mix(body, deep, smoothstep(0.45, 0.98, depth));

  // 内部对流：两张二维噪声反向漂移（不用 atan，避免中心出现十字/风车条纹）
  float n1 = noise(p * 2.6 + vec2(uTime * 0.10, -uTime * 0.07));
  float n2 = noise(p * 4.3 - vec2(uTime * 0.09, uTime * 0.12) + 11.7);
  float swirl = (n1 * 0.62 + n2 * 0.38 - 0.50) * 1.9;
  swirl *= smoothstep(0.16, 0.78, length(p));
  body = mix(body, mix(deep, lite, clamp(0.62 + swirl, 0.0, 1.0)), 0.22);
  body += vec3(0.06, 0.030, 0.0) * (1.0 - depth);

  // 边缘：薄膜折射 + 亮环
  float rim = pow(1.0 - z, 2.6);
  vec3 col = mix(body, bg * vec3(1.06, 0.96, 0.82), 0.26 * rim);
  // 不要白描边：只在最外 3% 轻微收暗，让球和背景贴住
  float edge = smoothstep(0.965, 1.0, sqrt(r2));
  col = mix(col, mix(col * 0.74, bg, 0.35), edge);

  // 顶部下陷处露出的内壁（凹进去那一圈）
  float dipWall = smoothstep(0.02, 0.20, uDip) * smoothstep(0.55, 0.95, -p.y);
  col = mix(col, mix(deep, mid, 0.5) * 1.05, dipWall * 0.55);

  // 高光（跟着变形走）
  vec3 L = normalize(vec3(-0.46, -0.60, 0.72));
  float spec = pow(max(dot(n, L), 0.0), 110.0);
  float spec2 = pow(max(dot(n, normalize(vec3(0.42, 0.44, 0.80))), 0.0), 26.0);
  col += vec3(1.0, 0.965, 0.885) * spec * 0.95;
  col += vec3(1.0, 0.84, 0.58) * spec2 * 0.30;

  // 底沿压暗（接触感）
  col *= 0.86 + 0.20 * smoothstep(1.0, -0.15, p.y) * 0.55;
  col += uFlash * vec3(0.30, 0.24, 0.14);

  outColor = vec4(col, a);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("shader: " + gl.getShaderInfoLog(s));
    }
    return s;
  }

  function create(canvas) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    for (const n of ["uRect", "uRes", "uCenter", "uR", "uSX", "uSY", "uDip", "uFlash", "uTime", "uBg", "uKind", "uArm", "uHalfW", "uCap", "uShake"]) {
      U[n] = gl.getUniformLocation(prog, n);
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U.uBg, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const api = {
      ok: true,
      kind: "webgl2",
      resize(w, h, dpr) {
        this_dpr = dpr;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog);
        // 视口与 uRes 一律用设备像素：gl_FragCoord 是设备像素，
        // 混用 CSS 像素会在 DPR>1 时把球画到屏幕外（用户缩放 125% 就看不见球）
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
      },
      setBackground(srcCanvas) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      },
      finish() { gl.finish(); },
      begin() {
        gl.useProgram(prog);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      draw(b) {
        const pad = b.R * 1.35;
        const k = this_dpr || 1;
        gl.uniform4f(U.uRect, b.x * k, b.y * k, pad * k, pad * k);
        gl.uniform2f(U.uCenter, b.x * k, b.y * k);
        gl.uniform1f(U.uR, b.R * k);
        gl.uniform1f(U.uSX, b.sx);
        gl.uniform1f(U.uSY, b.sy);
        gl.uniform1f(U.uDip, b.dip);
        gl.uniform1f(U.uFlash, b.flash || 0);
        gl.uniform1f(U.uTime, b.time);
        gl.uniform1f(U.uKind, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
      // 爆炸十字：一次 draw call，arm/halfW 用 CSS px，内部乘 dpr
      drawCross(c) {
        const k = this_dpr || 1;
        const pad = c.arm + c.hw + 4;
        gl.uniform4f(U.uRect, c.x * k, c.y * k, pad * k, pad * k);
        gl.uniform2f(U.uCenter, c.x * k, c.y * k);
        gl.uniform1f(U.uR, 1);
        gl.uniform1f(U.uSX, 1);
        gl.uniform1f(U.uSY, 1);
        gl.uniform1f(U.uDip, 0);
        gl.uniform1f(U.uFlash, c.flash || 0);
        gl.uniform1f(U.uTime, c.time || 0);
        gl.uniform1f(U.uKind, 1);
        gl.uniform1f(U.uArm, c.arm * k);
        gl.uniform1f(U.uHalfW, c.hw * k);
        gl.uniform1f(U.uCap, c.cap || 0);
        gl.uniform1f(U.uShake, (c.shake || 0) * k);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
    };
    return api;
  }

  window.BallGL = { create };
})();



