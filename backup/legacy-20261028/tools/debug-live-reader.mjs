const CDP = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EX:' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
  if (msg.method === 'Runtime.consoleAPICalled') logs.push('C:' + msg.params.args.map(a => a.value || a.description || '').join(' '));
  if (msg.method === 'Log.entryAdded') logs.push('L:' + msg.params.entry.text);
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
await send('Page.navigate', { url: 'https://bubble-vanguard.pages.dev/' });
await sleep(3000);
await ev(`document.querySelector('#btnNovelTop')?.click()`);
await sleep(3500);
console.log(JSON.stringify({
  cards: await ev(`document.querySelectorAll('#novelCards .novel-card').length`),
  cardsHTML: await ev(`document.querySelector('#novelCards')?.innerHTML.slice(0,800)`),
  hero: await ev(`document.querySelector('#novelHero')?.innerHTML.slice(0,500)`),
  note: await ev(`document.querySelector('.novel-loading')?.innerText`),
  logs
}, null, 2));
ws.close();
