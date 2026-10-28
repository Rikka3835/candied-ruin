import fs from 'node:fs';

const PORT = 9444;
const file = 'C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/03-character-ai-sheet.html';
const out = 'C:/Users/44186/Documents/deepseek-harness/default-workspace/art-direction/03-character-ai-sheet.png';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = targets.find(t => t.type === 'page');
if (!target) throw new Error('No page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { resolve } = pending.get(m.id); pending.delete(m.id); resolve(m.result); }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
function send(method, params = {}) {
  return new Promise(resolve => { const id = nextId++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });
}
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 2400, height: 1600, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });
await new Promise(r => setTimeout(r, 1800));
const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(out, Buffer.from(res.data, 'base64'));
console.log(out, fs.statSync(out).size);
ws.close();
