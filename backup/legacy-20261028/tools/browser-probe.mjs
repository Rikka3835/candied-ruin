import fs from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9334';
const URL = process.argv[2] || 'https://github.com/';
const SHOT = process.argv[3] || 'shots-browser/probe.png';
const script = process.argv[4] || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find(
  (t) => t.type === 'page' && (!process.env.PAGE_URL || t.url.includes(process.env.PAGE_URL))
);
if (!page) throw new Error('No page target');
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
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(4500);

const evalResult = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    href: location.href,
    title: document.title,
    body: (document.body ? document.body.innerText : '').slice(0, 5000),
    inputs: Array.from(document.querySelectorAll('input,button,a')).slice(0,40).map(e => ({tag:e.tagName, text:(e.innerText||'').trim().slice(0,80), name:e.name||'', type:e.type||''}))
  })`,
  returnByValue: true
});
console.log(evalResult.result.value);

if (script) {
  const custom = await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(custom.result, null, 2));
}

fs.mkdirSync('shots-browser', { recursive: true });
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
ws.close();
