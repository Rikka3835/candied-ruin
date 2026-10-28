import fs from 'node:fs';
import path from 'node:path';

const CDP = process.env.CDP || 'http://127.0.0.1:9336';
const URL_TO_OPEN = process.argv[2];
const COMMIT = process.argv.includes('--commit');
const files = process.argv.slice(3).filter((arg) => arg !== '--commit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page');
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
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
if (URL_TO_OPEN) {
  await send('Page.navigate', { url: URL_TO_OPEN });
  await sleep(4500);
}

const root = await send('DOM.getDocument', { depth: -1, pierce: true });
const input = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: 'input[type=file]' });
if (!input.nodeId) throw new Error('No file input');
await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files });
await sleep(3500);

const before = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    text: document.body.innerText.slice(0, 2200),
    fileRows: Array.from(document.querySelectorAll('[data-testid="upload-file"], .upload-file, .js-upload-file')).map(e=>e.innerText).slice(0,20),
    buttons: Array.from(document.querySelectorAll('button')).map(b=>({text:(b.innerText||'').trim(), disabled:b.disabled})).filter(b=>b.text).slice(0,20)
  })`,
  returnByValue: true
});
console.log(before.result.value);

if (COMMIT) {
  const clicked = await send('Runtime.evaluate', {
    expression: `(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /Commit changes/.test(x.innerText || '') && !x.disabled);
      if (!b) return 'NO_BUTTON';
      b.click();
      return 'CLICKED';
    })()`,
    returnByValue: true
  });
  console.log(clicked.result.value);
  await sleep(5000);
  const after = await send('Runtime.evaluate', {
    expression: `JSON.stringify({href: location.href, title: document.title, text: document.body.innerText.slice(0,1000)})`,
    returnByValue: true
  });
  console.log(after.result.value);
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.mkdirSync('shots-browser', { recursive: true });
fs.writeFileSync('shots-browser/gh-upload-result.png', Buffer.from(shot.data, 'base64'));
ws.close();
