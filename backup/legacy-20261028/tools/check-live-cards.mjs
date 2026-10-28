const CDP = 'http://127.0.0.1:9340';
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('bubble-vanguard.pages.dev'));
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
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send('Runtime.enable');
console.log(JSON.stringify({
  cards: await evalJs(`document.querySelectorAll('.chapter-tile').length`),
  first: await evalJs(`document.querySelector('.chapter-tile h3')?.innerText`),
  last: await evalJs(`Array.from(document.querySelectorAll('.chapter-tile h3')).at(-1)?.innerText`),
  api: await evalJs(`fetch('/api/novel').then(r=>r.json()).then(d=>d.chapterCount)`)
}, null, 2));
ws.close();
