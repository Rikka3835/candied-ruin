import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const PORT = 9444;
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = targets.find(t => t.type === 'page');
if (!target) throw new Error('no page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  }
});
await new Promise(r => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
const url = 'http://127.0.0.1:8099/video-test.html';
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, 1800));
const duration = await send('Runtime.evaluate', { expression: 'document.getElementById("v").duration', returnByValue: true });
const dur = duration.result.value;
console.log('duration', dur);
const outDir = 'C:/Users/44186/Documents/deepseek-harness/default-workspace/asset-probe/video-frames';
fs.mkdirSync(outDir, { recursive: true });
const times = [];
for (let t = 0; t <= dur; t += 45) times.push(Math.min(t, dur - 0.2));
if (!times.includes(dur - 0.2)) times.push(dur - 0.2);
for (let i = 0; i < times.length; i++) {
  const t = times[i];
  const res = await send('Runtime.evaluate', {
    expression: `window.snap(${t})`,
    awaitPromise: true,
    returnByValue: true
  });
  const data = res.result.value;
  if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,')) {
    console.log(JSON.stringify(res).slice(0, 700));
    throw new Error('bad frame at ' + t);
  }
  fs.writeFileSync(`${outDir}/frame-${String(i).padStart(2, '0')}-${Math.round(t)}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', t);
}
ws.close();
