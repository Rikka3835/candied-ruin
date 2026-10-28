const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CF_ACCOUNT_ID;
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/bubble-vanguard`;
const headers={Authorization:`Bearer ${token}`,'content-type':'application/json'};
let r=await fetch(`${base}/deployments`,{method:'POST',headers,body:JSON.stringify({branch:'main'})});
console.log('trigger',r.status,(await r.text()).slice(0,3000));
