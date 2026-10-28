import fs from 'node:fs';
const targets = await (await fetch('http://127.0.0.1:9444/json')).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, m => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
const file = 'file:///C:/Users/44186/Documents/deepseek-harness/default-workspace/bubble-vanguard-app/preview-1-1/BUBBLE-VANGUARD-1-1.html';
await send('Page.navigate', { url: file });
await new Promise(r => setTimeout(r, 1200));
const out = await evaluate(`(() => ({
  title: document.title,
  cards: document.querySelectorAll('.hero-card').length,
  start: !!document.getElementById('startBtn'),
  external: [...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(n => n.src || n.href),
  imgs: [...document.images].map(i => i.src.slice(0, 20))
}))()`);
await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).then(r => fs.writeFileSync('shots-preview/single-select.png', Buffer.from(r.data, 'base64')));
await evaluate(`document.getElementById('startBtn').click()`);
await new Promise(r => setTimeout(r, 1300));
const game = await evaluate(`(() => ({ screen: !document.getElementById('gameScreen').hidden, canvas: document.getElementById('gameCanvas').width, errors: window.__errors || [] }))()`);
await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).then(r => fs.writeFileSync('shots-preview/single-game.png', Buffer.from(r.data, 'base64')));
console.log(JSON.stringify({ out, game }, null, 2));
ws.close();
