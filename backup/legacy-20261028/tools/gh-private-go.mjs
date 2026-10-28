import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9336';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('github.com/Rikka3835/BUBBLE-VANGUARD'));
if (!page) throw new Error('page not found');
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
const evalJs = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return result.result?.value;
};
await send('Page.enable');
console.log('click:', await evalJs(`(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Make this repository private');
  if (!b) return 'not-found';
  b.click();
  return 'clicked';
})()`));
await sleep(2200);
console.log('url:', await evalJs('location.href'));
console.log('body:', (await evalJs('document.body.innerText.slice(0,1200)')));
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync('shots-browser/repo-private-done.png', Buffer.from(shot.data, 'base64'));
ws.close();
