import fs from 'node:fs';
import path from 'node:path';

const PORT = 9444;
const file = 'C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/preview/index.html';
const base = 'C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/preview';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = targets.find(t => t.type === 'page');
if (!target) throw new Error('No page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
function send(method, params = {}) {
  return new Promise(resolve => {
    const id = nextId++;
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function shot(width, height, out, dpr = 1, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  await send('Page.navigate', { url: 'file:///' + file });
  await new Promise(r => setTimeout(r, 3400));
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(out, Buffer.from(res.data, 'base64'));
  console.log(out, fs.statSync(out).size);
}

async function bootShot(width, height, out) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///' + file });
  await new Promise(r => setTimeout(r, 300));
  await send('Runtime.evaluate', { expression: `sessionStorage.removeItem('bubble-vanguard-boot-seen')` });
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 1650));
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(res.data, 'base64'));
  console.log(out, fs.statSync(out).size);
}

await send('Page.enable');
await send('Runtime.enable');
await bootShot(1440, 1100, path.join(base, 'boot-slow.png'));
await shot(1440, 1100, path.join(base, 'preview-desktop.png'));
const expanded = await send('Runtime.evaluate', { expression: `JSON.stringify({
  scrollWidth:document.documentElement.scrollWidth,
  clientWidth:document.documentElement.clientWidth,
  cast:[...document.querySelectorAll('.cast-slot')].map(el=>{const r=el.getBoundingClientRect();return{w:Math.round(r.width),x:Math.round(r.x)}}),
  title:document.querySelector('.hero h1').getBoundingClientRect().toJSON(),
  rail:document.querySelector('.rail').getBoundingClientRect().toJSON()
})`, returnByValue: true });
console.log('expanded', expanded.result.value);
await send('Runtime.evaluate', { expression: `document.getElementById('railToggle').click()` });
await new Promise(r => setTimeout(r, 450));
const collapsedShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.writeFileSync(path.join(base, 'preview-desktop-collapsed.png'), Buffer.from(collapsedShot.data, 'base64'));
const collapsed = await send('Runtime.evaluate', { expression: `JSON.stringify({
  scrollWidth:document.documentElement.scrollWidth,
  clientWidth:document.documentElement.clientWidth,
  cast:[...document.querySelectorAll('.cast-slot')].map(el=>{const r=el.getBoundingClientRect();return{w:Math.round(r.width),x:Math.round(r.x)}}),
  rail:document.querySelector('.rail').getBoundingClientRect().toJSON(),
  expanded:document.getElementById('railToggle').getAttribute('aria-expanded')
})`, returnByValue: true });
console.log('collapsed', collapsed.result.value);
await send('Runtime.evaluate', { expression: `document.getElementById('railToggle').click()` });
await new Promise(r => setTimeout(r, 350));
await shot(390, 844, path.join(base, 'preview-mobile.png'), 1, true);
const info = await send('Runtime.evaluate', { expression: `JSON.stringify({
  title: document.title,
  styleImages: [...document.querySelectorAll('.style-img img')].map(i => ({ok:i.complete && i.naturalWidth>0, w:i.naturalWidth, h:i.naturalHeight, src:i.getAttribute('src')})),
  hero: (()=>{const i=document.querySelector('.hero-frame img');return {ok:i&&i.complete&&i.naturalWidth>0,w:i&&i.naturalWidth,h:i&&i.naturalHeight}})(),
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  offenders: [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.right > 391 || r.left < -1);
  }).slice(0, 15).map(el => ({tag: el.tagName, cls: el.className, id: el.id, left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), w: Math.round(el.getBoundingClientRect().width)}))
})`, returnByValue: true });
console.log(info.result.value);
ws.close();
