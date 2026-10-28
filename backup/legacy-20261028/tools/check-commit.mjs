import { writeFile } from 'node:fs/promises';
const CDP = 'http://127.0.0.1:9336';
const list = await (await fetch(CDP + '/json')).json();
const page = list.find(t => t.type === 'page');
console.log('target', page && page.url);
if (!page) process.exit(2);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const wait = ms => new Promise(r => setTimeout(r, ms));
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'https://github.com/Rikka3835/BUBBLE-VANGUARD/commit/707d18d' });
await wait(6000);
const r = await send('Runtime.evaluate', { expression: `JSON.stringify({href:location.href,title:document.title,text:document.body.innerText.slice(0,1800)})`, returnByValue: true });
console.log(r.result.value);
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile('shots-browser/github-after-upload.png', Buffer.from(shot.data, 'base64'));
ws.close();
