import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CDP = 'http://127.0.0.1:9444';
const ROOT = process.cwd();
const SHOTS = path.join(ROOT, 'shots-preview');
const PAGE = 'file:///C:/Users/44186/Documents/deepseek-harness/default-workspace/bubble-vanguard-app/preview-1-1/index.html';
await mkdir(SHOTS, { recursive: true });

const tabs = await (await fetch(CDP + '/json/list')).json();
const target = tabs.find((t) => t.type === 'page');
if (!target) throw new Error('No page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    events.push({ type: 'exception', text: msg.params?.exceptionDetails?.text, desc: msg.params?.exceptionDetails?.exception?.description });
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params?.args?.map((a) => a.value ?? a.description).join(' ');
    events.push({ type: 'console', typeName: msg.params?.type, text });
  }
});
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression, returnByValue = true) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: PAGE });
await sleep(1300);
await shot('01-select-desktop.png');

const select = await evaluate(`(() => ({
  title: document.title,
  cards: document.querySelectorAll('.hero-card').length,
  active: document.querySelector('.hero-card.is-active')?.dataset.hero,
  start: document.getElementById('startBtn')?.innerText.trim(),
  previewVisible: !!document.querySelector('#mapPreview'),
  selectHidden: document.getElementById('selectScreen').hidden
}))()`);

await evaluate(`document.getElementById('startBtn').click()`);
await sleep(1300);
await shot('02-game-desktop.png');
const started = await evaluate(`(() => {
  const g = window.__BubblePreview;
  return {
    screen: !!g,
    player: g && { x: Math.round(g.player.x), y: Math.round(g.player.y), hp: g.player.hp, max: g.player.maxHp, bombs: g.player.bombCap },
    bots: g && g.bots.length,
    enemies: g && g.enemies.length,
    bossHp: g && g.boss && g.boss.hp,
    bossActive: g && g.bossActive,
    bossScreenX: g && g.boss && Math.round(g.boss.x - g.camera.x),
    roomCells: g && [g.map.grid[5][34], g.map.grid[8][36], g.map.grid[12][39]],
    canvas: { w: document.getElementById('gameCanvas').width, h: document.getElementById('gameCanvas').height },
    gameHidden: document.getElementById('gameScreen').hidden,
    bossHud: document.getElementById('bossHud').hidden
  };
})()`);

const sampleAI = () => evaluate(`(() => {
  const g = window.__BubblePreview;
  const cam = { x: g.camera.x, y: g.camera.y };
  return {
    mode: g.mode,
    time: Math.round(g.time * 10) / 10,
    bots: g.bots.map((b) => ({
      x: Math.round(b.x), y: Math.round(b.y),
      cx: Math.floor(b.x / 48), cy: Math.floor(b.y / 48),
      path: b.path ? b.path.length : 0,
      pathCells: b.path ? b.path.slice(0, 3).map((p) => p.x + ',' + p.y) : [],
      goal: b.pathGoal, timer: Math.round(b.pathTimer * 100) / 100, moving: b.moving
    })),
    enemies: g.enemies.map((e) => ({
      x: Math.round(e.x), y: Math.round(e.y),
      cx: Math.floor(e.x / 48), cy: Math.floor(e.y / 48),
      solid: g.map.grid[Math.floor(e.y / 48)]?.[Math.floor(e.x / 48)] !== 0,
      path: e.path ? e.path.length : 0,
      pathCells: e.path ? e.path.slice(0, 3).map((p) => p.x + ',' + p.y) : [],
      moving: e.moving
    })),
    treesSolid: g.map.blockers.filter((b) => b.kind === 'tree').every((b) => {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
        if (g.map.grid[y]?.[x] !== 4) return false;
      }
      return true;
    }),
    boss: { x: Math.round(g.boss.x), y: Math.round(g.boss.y), hp: g.boss.hp },
    bossScreen: { x: Math.round(g.boss.x - cam.x), y: Math.round(g.boss.y - cam.y) },
    camera: { x: Math.round(cam.x), y: Math.round(cam.y) }
  };
})()`);
const ai0 = await sampleAI();
await sleep(1600);
const ai1 = await sampleAI();
const movedBots = ai1.bots.filter((b, i) => Math.hypot(b.x - ai0.bots[i].x, b.y - ai0.bots[i].y) > 8).length;
const movedEnemies = ai1.enemies.filter((e, i) => Math.hypot(e.x - ai0.enemies[i].x, e.y - ai0.enemies[i].y) > 8).length;

await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
await sleep(700);
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
await sleep(250);
await shot('03-game-bomb.png');
const moved = await evaluate(`(() => {
  const g = window.__BubblePreview;
  return { x: Math.round(g.player.x), y: Math.round(g.player.y), bombs: g.bombs.length, mode: g.mode, timer: document.getElementById('timer').textContent };
})()`);

await sleep(2200);
const combat = await evaluate(`(() => {
  const g = window.__BubblePreview;
  return {
    blocks: g.stats.blocks,
    items: g.items.length,
    materials: g.materials,
    playerHp: Math.round(g.player.hp),
    enemiesAlive: g.enemies.filter((e) => !e.dead).length,
    bombs: g.bombs.length
  };
})()`);

const gateBefore = await evaluate(`window.__BubblePreview.map.grid[10][33]`);
await evaluate(`(() => {
  const g = window.__BubblePreview;
  g.player.x = 32 * 48 + 24;
  g.player.y = 10 * 48 + 24;
  g.player.activeBombs = 0;
  g.player.invuln = 3;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
})()`);
await sleep(2500);
const gateAfter = await evaluate(`window.__BubblePreview.map.grid[10][33]`);
await evaluate(`(() => {
  const g = window.__BubblePreview;
  g.player.x = 34 * 48 + 24;
  g.player.y = 10 * 48 + 24;
})()`);
await sleep(900);
await shot('06-game-boss.png');
const bossView = await evaluate(`(() => {
  const g = window.__BubblePreview;
  return {
    bossActive: g.bossActive,
    bossHud: !document.getElementById('bossHud').hidden,
    bossScreen: { x: Math.round(g.boss.x - g.camera.x), y: Math.round(g.boss.y - g.camera.y) },
    bossVisible: g.boss.x - g.camera.x > 38 && g.boss.x - g.camera.x < 1000 - 38,
    bossHp: Math.round(g.boss.hp)
  };
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(500);
await evaluate(`document.getElementById('backSelect').click()`);
await sleep(500);
await shot('04-select-mobile.png');
const mobileSelect = await evaluate(`(() => ({
  overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  cards: document.querySelectorAll('.hero-card').length,
  startRect: (() => { const r = document.getElementById('startBtn').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()
}))()`);
await evaluate(`document.getElementById('startBtn').click()`);
await sleep(1200);
await shot('05-game-mobile.png');
const mobileGame = await evaluate(`(() => {
  const g = window.__BubblePreview;
  const c = document.getElementById('gameCanvas').getBoundingClientRect();
  return { overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, player: Math.round(g.player.x), canvas: { w: c.width, h: c.height }, touch: getComputedStyle(document.getElementById('touchLayer')).display };
})()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await sleep(300);

console.log(JSON.stringify({ select, started, ai: { ai0, ai1, movedBots, movedEnemies }, moved, combat, gate: { before: gateBefore, after: gateAfter }, bossView, mobileSelect, mobileGame, events }, null, 2));
ws.close();
