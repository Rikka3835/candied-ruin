import { writeFile } from 'node:fs/promises';

const PORT = process.env.CDP_PORT || 9333;
const APP = process.env.APP_URL || 'https://bubble-vanguard.pages.dev/';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find(t => t.type === 'page');
if (!target) throw new Error('no page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
});
const wait = ms => new Promise(r => setTimeout(r, ms));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP + '?t=' + Date.now() });
await wait(8000);
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    hasEntry: !!document.getElementById('entryScreen'),
    bodyClass: document.body.className,
    text: document.body.innerText.slice(0, 240),
    entryDisplay: document.getElementById('entryScreen') ? getComputedStyle(document.getElementById('entryScreen')).display : 'none',
    novelExists: !!document.getElementById('novelScreen')
  })`,
  returnByValue: true
});
console.log(r.result.value);
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile('shots-browser/live-after-upload.png', Buffer.from(shot.data, 'base64'));
ws.close();
