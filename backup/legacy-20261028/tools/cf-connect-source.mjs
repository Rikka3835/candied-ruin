const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CF_ACCOUNT_ID;
const payload={type:'github',config:{owner:'Rikka3835',repo_name:'BUBBLE-VANGUARD',production_branch:'main',deployments_enabled:true,production_deployments_enabled:true,preview_deployment_setting:'all',preview_branch_includes:['*'],preview_branch_excludes:[],pr_comments_enabled:true}};
const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/bubble-vanguard/source`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)});
console.log(r.status); console.log((await r.text()).slice(0,3000));
