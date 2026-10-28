import { writeFile } from 'node:fs/promises';
const list=await (await fetch('http://127.0.0.1:9339/json')).json(); const p=list.find(t=>t.type==='page'&&t.url.includes('cloudflare'));
if(!p){console.log('no cloudflare page');process.exit(0);} const ws=new WebSocket(p.webSocketDebuggerUrl); let id=0; const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const q=pending.get(m.id);pending.delete(m.id);m.error?q.reject(new Error(m.error.message)):q.resolve(m.result);}});
await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
const send=(method,params={},ms=8000)=>Promise.race([new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));}),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]);
const r=await send('Runtime.evaluate',{expression:`JSON.stringify({title:document.title,href:location.href,text:document.body.innerText.slice(0,300)})`,returnByValue:true}); console.log(r.result.value);
const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true}); await writeFile('shots-browser/cf-login-clean.png',Buffer.from(shot.data,'base64'));
ws.close(); process.exit(0);
