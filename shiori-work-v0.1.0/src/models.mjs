import { spawnSync } from 'node:child_process';
import { assert, hash } from './store.mjs';

export function validateModel(value) {
  assert(typeof value==='string'&&(value===''||/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,149}$/.test(value)),'モデルIDが不正です。');
  return value;
}
export function withModel(profile,model) {
  validateModel(model);
  if(model===(profile.model||''))return profile;
  return {...profile,model,fingerprint:hash({profile:profile.fingerprint,model})};
}
// Ask the CLI for its current catalog; never substitute the binary's bundled list.
export function loadModelOptions(config,run=spawnSync) {
  const cache=new Map();
  for(const profile of [...config.providers,...config.runners]){
    if(profile.kind==='claude')profile.modelOptions=['sonnet','opus','haiku'].map(id=>({id,label:id}));
    if(profile.kind!=='codex'||!profile.enabled)continue;
    const key=JSON.stringify([profile.command,profile.commandArgs||[]]);
    if(!cache.has(key)){
      let models=[],status='unavailable';
      try{
        const r=run(profile.command||'codex',[...(profile.commandArgs||[]),'debug','models'],{cwd:profile.cwd,encoding:'utf8',timeout:10000,maxBuffer:8*1024*1024,windowsHide:true,shell:false});
        if(r.status===0){const c=JSON.parse(r.stdout);models=(Array.isArray(c)?c:c.models||[]).filter(m=>m.visibility==='list').map(m=>({id:validateModel(m.slug||m.id),label:m.display_name||m.slug||m.id}));status='cli';}
      }catch{}
      cache.set(key,{models,status});
    }
    profile.modelOptions=cache.get(key).models;
    profile.modelCatalogStatus=cache.get(key).status;
  }
}
