import { writeFile, mkdir } from 'node:fs/promises';

const PORT = process.env.CDP_PORT || 9333;
const APP = process.env.APP_URL || 'http://127.0.0.1:8788/';
const OUT = 'shots-entry';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find(t => t.type === 'page');
if (!target) throw new Error('no page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];

ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    events.push('EXCEPTION ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || ''));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    events.push('CONSOLE ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
}

async function waitFor(expr, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expr)) return true;
    await wait(120);
  }
  return false;
}

await mkdir(OUT, { recursive: true });
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP + '?entrycheck=' + Date.now() });
await waitFor('document.readyState === "complete"');
await waitFor('window.__BUBBLE_ENTRY_READY === true');
await wait(900);
await shot('01-entry-desktop');

const desktop = await evaluate(`(() => {
  const e = document.getElementById('entryScreen');
  const g = document.querySelector('.game-shell');
  const brand = document.getElementById('btnHomeTop');
  return {
    entryHidden: e.hidden,
    bodyEntry: document.body.classList.contains('entry-open'),
    gameAria: g.getAttribute('aria-hidden'),
    brandTag: brand && brand.tagName,
    title: document.title,
    buttons: [...document.querySelectorAll('.entry-card')].map(b => ({
      id: b.id,
      w: Math.round(b.getBoundingClientRect().width),
      h: Math.round(b.getBoundingClientRect().height)
    }))
  };
})()`);

await evaluate(`document.getElementById('entryStory').click()`);
await waitFor(`document.getElementById('novelScreen').hidden === false`);
await waitFor(`document.querySelectorAll('.chapter-tile').length === 22`);
await wait(600);
await shot('02-story-desktop');
const story = await evaluate(`(() => ({
  entryHidden: document.getElementById('entryScreen').hidden,
  novelHidden: document.getElementById('novelScreen').hidden,
  closeText: document.getElementById('novelClose').innerText.trim(),
  cards: document.querySelectorAll('.chapter-tile').length,
  apiState: document.getElementById('novelCards').innerText.slice(0, 50)
}))()`);

await evaluate(`document.getElementById('novelClose').click()`);
await wait(300);
const afterClose = await evaluate(`(() => ({
  entryHidden: document.getElementById('entryScreen').hidden,
  novelHidden: document.getElementById('novelScreen').hidden,
  gameAria: document.querySelector('.game-shell').getAttribute('aria-hidden')
}))()`);

await evaluate(`document.getElementById('entryGame').click()`);
await wait(500);
await shot('03-game-desktop');
const game = await evaluate(`(() => ({
  entryHidden: document.getElementById('entryScreen').hidden,
  bodyEntry: document.body.classList.contains('entry-open'),
  gameAria: document.querySelector('.game-shell').getAttribute('aria-hidden'),
  gameState: window.BubbleQuest && window.BubbleQuest.game && window.BubbleQuest.game.state
}))()`);

await evaluate(`document.getElementById('btnHomeTop').click()`);
await wait(300);
const home = await evaluate(`(() => ({
  entryHidden: document.getElementById('entryScreen').hidden,
  bodyEntry: document.body.classList.contains('entry-open'),
  focused: document.activeElement && document.activeElement.id
}))()`);

// Mobile pass
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: APP + '?entrymobile=' + Date.now() });
await waitFor('document.readyState === "complete"');
await waitFor('window.__BUBBLE_ENTRY_READY === true');
await wait(900);
await shot('04-entry-mobile');
const mobile = await evaluate(`(() => {
  const e = document.getElementById('entryScreen');
  const cards = [...document.querySelectorAll('.entry-card')].map(b => {
    const r = b.getBoundingClientRect();
    return { id: b.id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const wide = [...document.querySelectorAll('body *')]
    .map(el => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    })
    .filter(x => x.right > innerWidth + 1)
    .slice(0, 8);
  return {
    viewport: innerWidth + 'x' + innerHeight,
    entryHidden: e.hidden,
    overflowX: e.scrollWidth > e.clientWidth + 1,
    screenScroll: e.scrollWidth + '/' + e.clientWidth,
    docScroll: document.documentElement.scrollWidth + '/' + document.documentElement.clientWidth,
    screenOverflow: getComputedStyle(e).overflowX + '/' + getComputedStyle(e).overflowY,
    bodyOverflow: getComputedStyle(document.body).overflow,
    bodyScroll: document.body.scrollHeight,
    wide,
    cards
  };
})()`);

await evaluate(`document.getElementById('entryStory').click()`);
await waitFor(`document.getElementById('novelScreen').hidden === false`);
await waitFor(`document.querySelectorAll('.chapter-tile').length === 22`);
await wait(500);
await shot('05-story-mobile');
const mobileStory = await evaluate(`(() => ({
  closeText: document.getElementById('novelClose').innerText.trim(),
  cards: document.querySelectorAll('.chapter-tile').length,
  entryHidden: document.getElementById('entryScreen').hidden,
  overflowX: document.documentElement.scrollWidth > innerWidth + 1
}))()`);
await evaluate(`document.getElementById('novelClose').click()`);
await wait(300);
const mobileBack = await evaluate(`(() => ({
  entryHidden: document.getElementById('entryScreen').hidden,
  novelHidden: document.getElementById('novelScreen').hidden
}))()`);

console.log(JSON.stringify({ desktop, story, afterClose, game, home, mobile, mobileStory, mobileBack, events }, null, 2));
ws.close();
