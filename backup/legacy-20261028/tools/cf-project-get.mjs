const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CF_ACCOUNT_ID;
const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/bubble-vanguard`,{headers:{Authorization:`Bearer ${token}`}});
const j=await r.json();
console.log(JSON.stringify({status:r.status,success:j.success,errors:j.errors,result:{name:j.result?.name,domains:j.result?.domains,source:j.result?.source,build_config:j.result?.build_config,deployment_configs:j.result?.deployment_configs,latest_deployment:j.result?.latest_deployment}},null,2));
