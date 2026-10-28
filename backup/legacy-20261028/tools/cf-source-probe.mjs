const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CF_ACCOUNT_ID;
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/bubble-vanguard`;
for (const path of ['/source','/']) {
 const r=await fetch(base+path,{headers:{Authorization:`Bearer ${token}`}});
 console.log(path,r.status,(await r.text()).slice(0,600));
}
