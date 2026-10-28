const CDP = 'http://127.0.0.1:9333';
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page');
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
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send('Runtime.enable');
const out = await ev(`(async () => {
  try {
    const r = await fetch('/api/novel', { cache: 'no-store' });
    const text = await r.text();
    return { status: r.status, type: r.headers.get('content-type'), body: text.slice(0, 800) };
  } catch (e) { return { error: String(e) }; }
})()`);
console.log(JSON.stringify(out, null, 2));
ws.close();
