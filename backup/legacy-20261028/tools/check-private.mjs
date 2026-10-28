const CDP = 'http://127.0.0.1:9336';
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('github.com/Rikka3835/BUBBLE-VANGUARD'));
if (!page) throw new Error('GitHub page missing');
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
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;
await send('Runtime.enable');
console.log('private:', await evalJs('document.body.innerText.includes("This repository is private.")'));
console.log('public:', await evalJs('document.body.innerText.includes("This repository is currently public.")'));
console.log('visibility:', await evalJs('(document.body.innerText.match(/Change repository visibility[\\s\\S]{0,120}/) || ["none"])[0]'));
ws.close();
