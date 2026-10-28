import { writeFile, mkdir } from 'node:fs/promises';
const v=await (await fetch('http://127.0.0.1:9336/json/version')).json();
const ws=new WebSocket(v.webSocketDebuggerUrl); let id=0; const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const q=pending.get(m.id);pending.delete(m.id);m.error?q.reject(new Error(m.error.message)):q.resolve(m.result);}});
await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const t=await send('Target.createTarget',{url:'https://dash.cloudflare.com/'});
await new Promise(r=>setTimeout(r,5000));
const list=await (await fetch('http://127.0.0.1:9336/json')).json();
const page=list.find(x=>x.type==='page'&&x.url.includes('cloudflare'));
console.log(JSON.stringify({target:t,targetInfo:page?{title:page.title,url:page.url}:null},null,2));
if(page){
 const pws=new WebSocket(page.webSocketDebuggerUrl); let pid=0; const pp=new Map();
 pws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pp.has(m.id)){const q=pp.get(m.id);pp.delete(m.id);m.error?q.reject(new Error(m.error.message)):q.resolve(m.result);}});
 await new Promise((r,j)=>{pws.addEventListener('open',r,{once:true});pws.addEventListener('error',j,{once:true});});
 const ps=(method,params={})=>new Promise((resolve,reject)=>{const n=++pid;pp.set(n,{resolve,reject});pws.send(JSON.stringify({id:n,method,params}));});
 await ps('Page.enable'); const info=await ps('Runtime.evaluate',{expression:`JSON.stringify({title:document.title,url:location.href,text:document.body.innerText.slice(0,300)})`,returnByValue:true});
 console.log(info.result.value);
 const shot=await ps('Page.captureScreenshot',{format:'png',fromSurface:true}); await mkdir('shots-browser',{recursive:true}); await writeFile('shots-browser/cf-dashboard-probe.png',Buffer.from(shot.data,'base64'));
 pws.close();
}
ws.close();
