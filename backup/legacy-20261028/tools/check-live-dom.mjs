const CDP = 'http://127.0.0.1:9333';
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Runtime.exceptionThrown' || msg.method === 'Log.entryAdded') events.push(msg);
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
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
console.log(JSON.stringify({
  grid: await ev(`document.querySelector('#libraryGrid')?.outerHTML.slice(0,1000)`),
  status: await ev(`document.querySelector('#libraryStatus')?.outerHTML`),
  scripts: await ev(`JSON.stringify(Array.from(document.scripts).map(s=>s.src))`),
  jsHasApi: await ev(`fetch('/js/novel.js').then(r=>r.text()).then(t=>({hasApi:t.includes('/api/novel'), len:t.length, head:t.slice(0,200)}))`),
  perf: await ev(`JSON.stringify(performance.getEntriesByType('resource').filter(e=>e.name.includes('novel')).map(e=>e.name))`),
  errors: events.map(e => e.params?.exceptionDetails?.exception?.description || e.params?.entry?.text).slice(0,10)
}, null, 2));
ws.close();
