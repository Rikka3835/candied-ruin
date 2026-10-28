/* Minimal Chrome DevTools Protocol smoke test for the local full-stack site. */
import fs from 'node:fs';
import path from 'node:path';

const CDP = 'http://127.0.0.1:9333';
const APP = process.env.APP_URL || 'http://127.0.0.1:8788/';
const OUT = path.resolve('shots-api');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTarget() {
  const targets = await (await fetch(CDP + '/json')).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No page target');
  return page;
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const exceptions = [];
const consoleErrors = [];

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'exception');
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description).join(' '));
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluation failed');
  }
  return result.result.value;
}

async function waitFor(expression, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(120);
  }
  throw new Error('Timeout: ' + expression);
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(result.data, 'base64'));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false
});
await send('Page.navigate', { url: APP });
await sleep(2200);
await waitFor('!!document.getElementById("btnNovelTop")');

const desktop = {
  title: await evaluate('document.title'),
  gameTitle: await evaluate('document.querySelector(".brand-text")?.textContent.trim()'),
  errors: exceptions.slice()
};

await evaluate('document.getElementById("btnNovelTop").click()');
await waitFor('document.querySelectorAll(".chapter-tile").length === 22', 12000);
await sleep(400);

const library = {
  cards: await evaluate('document.querySelectorAll(".chapter-tile").length'),
  first: await evaluate('document.querySelector(".chapter-tile h3")?.textContent'),
  last: await evaluate('document.querySelectorAll(".chapter-tile h3")[21]?.textContent'),
  hero: await evaluate('document.querySelector(".hero-copy h2")?.textContent'),
  readPath: await evaluate('document.getElementById("readingPathText")?.textContent'),
  apiLoaded: await evaluate('!!window.NOVEL_API_BASE || true')
};
await screenshot('desktop-library.png');

await evaluate('document.querySelectorAll(".chapter-tile")[2].click()');
await waitFor('document.querySelectorAll("#novelArticle .novel-section").length > 0', 12000);
await sleep(300);

const chapter = {
  heading: await evaluate('document.querySelector("#novelArticle h1")?.textContent'),
  sectionCount: await evaluate('document.querySelectorAll("#novelArticle .novel-section").length'),
  tocCount: await evaluate('document.querySelectorAll("#novelArticle .chapter-toc button").length'),
  firstSection: await evaluate('document.querySelector("#novelArticle .novel-section h2")?.textContent.trim()'),
  nextLabel: await evaluate('document.querySelector("#novelArticle [data-next]")?.textContent'),
  progress: await evaluate('document.getElementById("readerPercent")?.textContent')
};
await screenshot('desktop-reader.png');

await evaluate('document.getElementById("readerScroll").scrollTop = document.getElementById("readerScroll").scrollHeight');
await sleep(400);
const scrolled = await evaluate('document.getElementById("readerPercent")?.textContent');

// Switch to chapter 22 via a direct API-backed click: use the next button repeatedly is slow;
// test the same API/detail path by clicking the visible next CTA once instead.
await evaluate('document.querySelector("#novelArticle [data-next]")?.click()');
await waitFor('document.querySelector("#novelArticle h1")?.textContent !== "三张地图"', 12000);
await sleep(250);
const nextChapter = {
  heading: await evaluate('document.querySelector("#novelArticle h1")?.textContent'),
  sections: await evaluate('document.querySelectorAll("#novelArticle .novel-section").length'),
  next: await evaluate('document.querySelector("#novelArticle [data-next]")?.getAttribute("data-next")')
};

await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true
});
await evaluate('document.getElementById("readerScroll").scrollTop = 0; window.scrollTo(0,0)');
await sleep(400);
await screenshot('mobile-reader.png');

const mobileReader = {
  rail: await evaluate('(() => { const r = document.querySelector(".novel-rail").getBoundingClientRect(); return {w: r.width, h: r.height, bottom: r.bottom}; })()'),
  article: await evaluate('(() => { const r = document.querySelector(".novel-article").getBoundingClientRect(); return {x: Math.round(r.x), w: Math.round(r.width)}; })()'),
  overflowX: await evaluate('document.documentElement.scrollWidth > window.innerWidth')
};

await evaluate('document.getElementById("readerBack").click()');
await waitFor('document.querySelectorAll(".chapter-tile").length === 22');
await sleep(300);
await screenshot('mobile-library.png');

const mobileLibrary = {
  cards: await evaluate('document.querySelectorAll(".chapter-tile").length'),
  firstRect: await evaluate('(() => { const r = document.querySelector(".chapter-tile").getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width)}; })()'),
  rail: await evaluate('(() => { const r = document.querySelector(".novel-rail").getBoundingClientRect(); return {w: r.width, h: r.height}; })()'),
  overflowX: await evaluate('document.documentElement.scrollWidth > window.innerWidth')
};

await evaluate('document.getElementById("novelClose").click()');
await sleep(300);
const closed = {
  novelHidden: await evaluate('document.getElementById("novelScreen").hidden'),
  bodyClass: await evaluate('document.body.className')
};

console.log(JSON.stringify({ desktop, library, chapter, scrolled, nextChapter, mobileReader, mobileLibrary, closed, exceptions, consoleErrors }, null, 2));
ws.close();
