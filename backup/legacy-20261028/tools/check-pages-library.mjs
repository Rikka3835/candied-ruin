import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('bubble-vanguard.pages.dev'));
if (!page) throw new Error('page missing');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await evalJs(`document.querySelector('#btnNovel')?.click()`);
await sleep(2500);
console.log(JSON.stringify({
  cards: await evalJs(`document.querySelectorAll('.chapter-card').length`),
  hero: await evalJs(`document.querySelector('.library-hero h2')?.innerText`),
  first: await evalJs(`document.querySelector('.chapter-card h3')?.innerText`),
  status: await evalJs(`document.querySelector('#libraryStatus')?.innerText`),
  errors: await evalJs(`window.__errs || []`)
}, null, 2));
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync('shots-browser/pages-live-library.png', Buffer.from(shot.data, 'base64'));
ws.close();
