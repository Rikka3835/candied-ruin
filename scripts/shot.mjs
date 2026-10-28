// 用 Edge 的 DevTools 协议截图：可以真正模拟 390px 手机视口
// 用法：node scripts/shot.mjs <url> <out.png> [w] [h] [dsf] [mobile]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [, , url, out, wArg, hArg, dsfArg, mobileArg] = process.argv;
const W = Number(wArg || 1440);
const H = Number(hArg || 900);
const DSF = Number(dsfArg || 2);
const MOBILE = mobileArg !== "desktop";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9300 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), "edge-cdp-" + Date.now());

const proc = spawn(EDGE, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=" + port,
  "--user-data-dir=" + profile,
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) {
        const j = await r.json();
        if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error("devtools endpoint not ready");
}

function rpc(ws) {
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });
  return { send, events };
}

const wsUrl = await endpoint();
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
const { send } = rpc(ws);

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: H,
  deviceScaleFactor: DSF,
  mobile: MOBILE,
  screenWidth: W,
  screenHeight: H,
}, sessionId);

if (MOBILE) {
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
}
await send("Page.enable", {}, sessionId);
// 可选：SHOT_MEDIA=dark / light —— 模拟系统配色偏好，用来验收深色模式
if (process.env.SHOT_MEDIA) {
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: process.env.SHOT_MEDIA }]
  }, sessionId);
}

await send("Page.navigate", { url }, sessionId);
await sleep(2600);

// 可选：截图前先执行一段 JS（用来触发悬停/点击等交互），再等 SHOT_WAIT 毫秒
const preEval = process.env.SHOT_EVAL;
if (preEval) {
  const r = await send("Runtime.evaluate", { expression: preEval, awaitPromise: true, returnByValue: true }, sessionId);
  if (r && r.result) console.log("eval:", JSON.stringify(r.result.value));
  await sleep(Number(process.env.SHOT_WAIT || 300));
}

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
fs.writeFileSync(out, Buffer.from(shot.data, "base64"));

const metrics = await send("Runtime.evaluate", {
  expression: "JSON.stringify({w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight})",
  returnByValue: true,
}, sessionId);
console.log("saved", out, metrics.result.value);

ws.close();
proc.kill();
await sleep(300);
