import fs from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9336';
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

for (let i = 0; i < 30; i++) {
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({href:location.href, text:document.body.innerText.slice(0,1200), uploading:/Uploading \\d+ of \\d+ files/.test(document.body.innerText), buttons:Array.from(document.querySelectorAll('button')).map(b=>({text:(b.innerText||'').trim(), disabled:b.disabled})).filter(b=>b.text).slice(0,10)})`,
    returnByValue: true
  });
  const state = JSON.parse(r.result.value);
  console.log(i + ' ' + JSON.stringify(state));
  if (!state.uploading) break;
  await sleep(2000);
}

const click = await send('Runtime.evaluate', {
  expression: `(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /Commit changes/.test(x.innerText || '') && !x.disabled);
    if (!b) return 'NO_BUTTON';
    b.click();
    return 'CLICKED';
  })()`,
  returnByValue: true
});
console.log(click.result.value);
await sleep(6000);
const after = await send('Runtime.evaluate', {
  expression: `JSON.stringify({href:location.href, title:document.title, text:document.body.innerText.slice(0,1400)})`,
  returnByValue: true
});
console.log(after.result.value);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.mkdirSync('shots-browser', { recursive: true });
fs.writeFileSync('shots-browser/gh-commit-result.png', Buffer.from(shot.data, 'base64'));
ws.close();
