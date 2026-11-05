import { spawnSync } from 'node:child_process';
import { findCodex } from './codex-runtime.mjs';
const result=spawnSync(findCodex(),['debug','models',...(process.argv.includes('--bundled')?['--bundled']:[])],{encoding:'utf8',windowsHide:true,shell:false,timeout:15000,maxBuffer:8*1024*1024});
if(result.error)throw result.error;
if(result.status!==0){console.error(result.stderr);process.exitCode=1;}
else {
  const catalog=JSON.parse(result.stdout);
  const models=Array.isArray(catalog)?catalog:catalog.models;
  console.log(JSON.stringify(models?.map(m=>({id:m.slug||m.id,name:m.display_name,visibility:m.visibility})),null,2));
}
