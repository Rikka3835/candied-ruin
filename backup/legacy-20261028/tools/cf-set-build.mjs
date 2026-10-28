const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CF_ACCOUNT_ID;
const cmd='node -e "const fs=require(\'fs\');fs.rmSync(\'pages-dist\',{recursive:true,force:true});fs.cpSync(\'public\',\'pages-dist\',{recursive:true});fs.copyFileSync(\'src/worker.js\',\'pages-dist/_worker.js\')"';
const payload={build_config:{build_command:cmd,destination_dir:'pages-dist',root_dir:'',build_caching:true}};
const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/bubble-vanguard`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)});
console.log(r.status); console.log((await r.text()).slice(0,2000));
