import fs from 'node:fs';
import path from 'node:path';

const port = 9444;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(t => t.type === 'page');
if (!target) throw new Error('No page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown' || msg.method === 'Log.entryAdded') {
    events.push(msg);
  }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
const send = (method, params = {}) => new Promise(resolve => {
  const mid = ++id;
  pending.set(mid, { resolve });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
const file = path.resolve('C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/preview/BUBBLE-VANGUARD-UI-PREVIEW.html');
await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });
await new Promise(r => setTimeout(r, 3400));
await send('Runtime.evaluate', { expression: `localStorage.removeItem('bubble-preview-rail')` });
await send('Page.reload');
await new Promise(r => setTimeout(r, 3400));
const initial = await send('Runtime.evaluate', {
  expression: `(() => ({
    collapsed: document.querySelector('.shell').classList.contains('is-rail-collapsed'),
    aria: document.getElementById('railToggle').getAttribute('aria-expanded'),
    railW: Math.round(document.querySelector('.rail').getBoundingClientRect().width),
    castW: Math.round(document.querySelector('.cast-slot').getBoundingClientRect().width)
  }))()`,
  returnByValue: true
});
const result = await send('Runtime.evaluate', {
  expression: `(() => {
    const imgs = [...document.images];
    return {
      title: document.title,
      cast: document.querySelectorAll('.cast-slot').length,
      loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
      broken: imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.alt || i.src.slice(0, 40)),
      external: [...document.querySelectorAll('script[src],link[href]')].map(el => el.src || el.href).filter(Boolean),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      castRects: [...document.querySelectorAll('.cast-slot')].map(el => { const r = el.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}; })
    };
  })()`,
  returnByValue: true
});
const textCheck = await send('Runtime.evaluate', {
  expression: `(() => {
    const text = document.body.innerText;
    return ['QQ', 'AI', 'Live2D', 'sprite', '鍗犱綅', 'GitHub', 'LOCAL'].filter(w => text.includes(w));
  })()`,
  returnByValue: true
});
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync('C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/preview/single-html-check.png', Buffer.from(shot.data, 'base64'));
await send('Runtime.evaluate', { expression: `document.getElementById('railToggle').click()` });
await new Promise(r => setTimeout(r, 450));
const expanded = await send('Runtime.evaluate', {
  expression: `(() => ({
    collapsed: document.querySelector('.shell').classList.contains('is-rail-collapsed'),
    aria: document.getElementById('railToggle').getAttribute('aria-expanded'),
    railW: Math.round(document.querySelector('.rail').getBoundingClientRect().width),
    castW: Math.round(document.querySelector('.cast-slot').getBoundingClientRect().width)
  }))()`,
  returnByValue: true
});
await send('Runtime.evaluate', { expression: `document.getElementById('railToggle').click()` });
await new Promise(r => setTimeout(r, 450));
const collapsedAgain = await send('Runtime.evaluate', {
  expression: `document.querySelector('.shell').classList.contains('is-rail-collapsed')`,
  returnByValue: true
});
console.log(JSON.stringify({ ...result.result.value, forbidden: textCheck.result.value, initial: initial.result.value, expanded: expanded.result.value, collapsedAgain: collapsedAgain.result.value, events: events.length }, null, 2));
ws.close();

