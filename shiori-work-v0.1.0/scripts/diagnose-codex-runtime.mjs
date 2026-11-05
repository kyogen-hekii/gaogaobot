import { existsSync, readdirSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { findCodex } from './codex-runtime.mjs';

// Inspect only executable locations and routing variable presence. No auth/config contents.
const homeDir=homedir(),name=process.platform==='win32'?'codex.exe':'codex';
const candidates=new Set([findCodex(),...((process.env.PATH||'').split(delimiter).filter(Boolean).map(p=>resolve(p,name))),resolve(homeDir,'.local/bin',name)]);
const sdk=resolve(homeDir,'AppData/Roaming/Code/agent-host/sdk-cache/codex');
try{for(const version of readdirSync(sdk).filter(v=>/^\d+\.\d+\.\d+$/.test(v)))candidates.add(resolve(sdk,version,'win32-x64/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe'));}catch{}
for(const command of candidates){
  if(!existsSync(command))continue;
  const r=spawnSync(command,['--version'],{encoding:'utf8',windowsHide:true,shell:false,timeout:5000});
  console.log(JSON.stringify({selected:command===findCodex(),command,version:r.status===0?r.stdout.trim():'probe failed'}));
}
console.log(JSON.stringify({routingVariables:Object.fromEntries(['CODEX_HOME','OPENAI_BASE_URL','OPENAI_API_KEY','CODEX_API_KEY','CODEX_INTERNAL_ORIGINATOR_OVERRIDE','SHIORI_CODEX_COMMAND'].map(k=>[k,process.env[k]?'set':'unset']))}));
