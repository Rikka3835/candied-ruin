const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CF_ACCOUNT_ID, id='4a1c18b1-f675-4391-a45b-359264782b69';
const url=`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/bubble-vanguard/deployments/${id}`;
const h={Authorization:`Bearer ${token}`};
for (let i=0;i<30;i++){
  const r=await fetch(url,{headers:h}); const j=await r.json();
  const st=j.result?.latest_stage; console.log(new Date().toISOString(), r.status, st?.name, st?.status);
  if (['success','failure','canceled'].includes(st?.status)) { console.log(JSON.stringify(j.result.stages)); break; }
  await new Promise(r=>setTimeout(r,5000));
}
