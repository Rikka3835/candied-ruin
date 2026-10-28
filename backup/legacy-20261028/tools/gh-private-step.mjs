import fs from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9336';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('github.com/Rikka3835/BUBBLE-VANGUARD'));
if (!page) throw new Error('GitHub repo page not found');
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
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'https://github.com/Rikka3835/BUBBLE-VANGUARD/settings' });
await sleep(4500);
await evalJs('window.scrollTo(0, document.body.scrollHeight); 1');
await sleep(700);
const before = await evalJs(`JSON.stringify(Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(-30))`);
console.log('buttons before:', before);
const clicked = await evalJs(`(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Change visibility');
  if (!b) return 'not-found';
  b.click();
  return 'clicked';
})()`);
console.log('click:', clicked);
await sleep(900);
const body = await evalJs(`document.body.innerText.slice(-3500)`);
console.log('body tail:\n' + body);
fs.mkdirSync('shots-browser', { recursive: true });
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync('shots-browser/repo-visibility-modal.png', Buffer.from(shot.data, 'base64'));
ws.close();
