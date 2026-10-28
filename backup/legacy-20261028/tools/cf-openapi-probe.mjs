for (const u of ['https://api.cloudflare.com/client/v4/openapi.json','https://developers.cloudflare.com/api/openapi.json']) {
  try { const r=await fetch(u); const t=await r.text(); console.log(u,r.status,t.length,t.slice(0,80)); if(t.includes('pages/projects')) { const j=JSON.parse(t); console.log(Object.keys(j.paths||{}).filter(k=>k.includes('/pages/projects')).slice(0,20)); } } catch(e){ console.log(u,String(e)); }
}
