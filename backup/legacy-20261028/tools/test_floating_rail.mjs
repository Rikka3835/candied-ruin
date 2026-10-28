import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'index';
const port = 9444;
const outDir = 'C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/preview';
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

const file = mode === 'single'
  ? 'C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/preview/BUBBLE-VANGUARD-UI-PREVIEW.html'
  : 'C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/preview/index.html';
const url = 'file:///' + file.replace(/\\/g, '/') + '?nointro=1&noboot=1';
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, 700));

const measure = () => send('Runtime.evaluate', {
  expression: `(() => {
    const r = s => { const e = document.querySelector(s); if (!e) return null; const x = e.getBoundingClientRect(); return { x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.width), h: Math.round(x.height) }; };
    const rail = document.getElementById('railPanel');
    const tab = document.getElementById('railTab');
    return {
      bodyOpen: document.body.classList.contains('rail-open'),
      tabDisplay: getComputedStyle(tab).display,
      tabOpacity: getComputedStyle(tab).opacity,
      railX: Math.round(rail.getBoundingClientRect().x),
      railW: Math.round(rail.getBoundingClientRect().width),
      title: r('.hero h1'),
      cast: r('.cast-row'),
      main: r('.main'),
      castCount: document.querySelectorAll('.cast-slot').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    };
  })()`,
  returnByValue: true
});

const closed = (await measure()).result.value;
const shotClosed = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(path.join(outDir, `rail-closed-${mode}.png`), Buffer.from(shotClosed.data, 'base64'));

await send('Runtime.evaluate', { expression: `document.getElementById('railTab').click()` });
await new Promise(r => setTimeout(r, 480));
const open = (await measure()).result.value;
const shotOpen = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(path.join(outDir, `rail-open-${mode}.png`), Buffer.from(shotOpen.data, 'base64'));

await send('Runtime.evaluate', { expression: `document.getElementById('railToggle').click()` });
await new Promise(r => setTimeout(r, 520));
const closedAgain = (await measure()).result.value;

// Hover near the left edge opens it; moving away closes after the grace period.
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 520 });
await new Promise(r => setTimeout(r, 220));
const hoverOpen = (await measure()).result.value;
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 400 });
await new Promise(r => setTimeout(r, 900));
const hoverClosed = (await measure()).result.value;

// Section jump must go through the lamp fade rather than snap instantly.
await send('Runtime.evaluate', { expression: `document.querySelector('.rail-link').click()` });
await new Promise(r => setTimeout(r, 180));
const motion = await send('Runtime.evaluate', {
  expression: `({ lamp: document.body.classList.contains('is-lamp-sweep'), switching: document.querySelector('.main').classList.contains('is-switching') })`,
  returnByValue: true
});
await new Promise(r => setTimeout(r, 900));
const motionDone = await send('Runtime.evaluate', {
  expression: `({ lamp: document.body.classList.contains('is-lamp-sweep'), switching: document.querySelector('.main').classList.contains('is-switching'), scrollY: Math.round(scrollY) })`,
  returnByValue: true
});

// Mobile: the floating tab must disappear and the nav must remain a normal top row.
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, 700));
const mobile = await send('Runtime.evaluate', {
  expression: `(() => {
    const rail = document.getElementById('railPanel');
    const tab = document.getElementById('railTab');
    const nav = rail.querySelector('nav');
    const r = rail.getBoundingClientRect();
    return {
      tabDisplay: getComputedStyle(tab).display,
      railPosition: getComputedStyle(rail).position,
      rail: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      navDisplay: getComputedStyle(nav).display,
      castCount: document.querySelectorAll('.cast-slot').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    };
  })()`,
  returnByValue: true
});
const shotMobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(path.join(outDir, `rail-mobile-${mode}.png`), Buffer.from(shotMobile.data, 'base64'));

// First visit: a one-time peek should reveal the rail, then leave the tab.
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 400 });
await send('Runtime.evaluate', { expression: `localStorage.removeItem('bubble-vanguard-rail-intro-seen')` });
await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') + '?intro=1&noboot=1' });
await new Promise(r => setTimeout(r, 1250));
const introOpen = (await measure()).result.value;
await new Promise(r => setTimeout(r, 2100));
const introClosed = (await measure()).result.value;

// First-load caramel bubble: visible first, then removed and never blocks the page.
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send('Runtime.evaluate', { expression: `sessionStorage.removeItem('bubble-vanguard-boot-seen')` });
await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') + '?nointro=1' });
await new Promise(r => setTimeout(r, 320));
const bootVisible = await send('Runtime.evaluate', {
  expression: `(() => { const b = document.getElementById('boot'); return !!b && !b.classList.contains('is-done'); })()`,
  returnByValue: true
});
const shotBoot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(path.join(outDir, `boot-${mode}.png`), Buffer.from(shotBoot.data, 'base64'));
await new Promise(r => setTimeout(r, 2200));
const bootGone = await send('Runtime.evaluate', { expression: `!document.getElementById('boot')`, returnByValue: true });

console.log(JSON.stringify({ mode, closed, open, closedAgain, hoverOpen, hoverClosed, motion: motion.result.value, motionDone: motionDone.result.value, mobile: mobile.result.value, introOpen: introOpen.bodyOpen, introClosed: introClosed.bodyOpen, bootVisible: bootVisible.result.value, bootGone: bootGone.result.value, events: events.length }, null, 2));
ws.close();
