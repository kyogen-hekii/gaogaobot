#!/usr/bin/env node
import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, ROOT } from '../src/config.mjs';

// Default checks do not launch a model or read authentication secrets.
const probe=process.argv.includes('--probe');
const rows=[];
const record=(ok,label,detail)=>rows.push({ok,label,detail});
const version=process.versions.node.split('.').map(Number);
record(version[0]>=24,'Node.js',process.version);
try {await import('node:sqlite');record(true,'SQLite','node:sqlite を利用できます');}catch(e){record(false,'SQLite',e.message);}
function find(command) {
  const names=process.platform==='win32'?[command,`${command}.exe`,`${command}.cmd`]:[command];
  const candidates=isAbsolute(command)||command.includes('/')?[command]:(process.env.PATH||'').split(delimiter).flatMap(p=>names.map(n=>resolve(p,n)));
  return candidates.find(p=>{try{accessSync(p,process.platform==='win32'?constants.F_OK:constants.X_OK);return true;}catch{return false;}});
}
try {
  const config=loadConfig();record(true,'設定',existsSync(resolve(ROOT,'config.local.json'))?'config.local.json を使用':'デモ設定を使用');
  for(const profile of [...config.providers,...config.runners]) {
    if(profile.kind==='demo')continue;
    const command=profile.command||profile.kind,path=find(command);
    record(!profile.enabled||!!path,`${profile.id} (${profile.enabled?'有効':'無効'})`,path||`${command} はPATH上にありません。有効化する前に導入してください。`);
    if(probe&&profile.enabled&&path) {
      const result=spawnSync(path,[...(profile.commandArgs||[]),...(profile.kind==='codex'?['exec']:[]),'--help'],{cwd:profile.cwd,encoding:'utf8',timeout:10000,shell:false,env:{...process.env,NO_COLOR:'1'}});
      const help=`${result.stdout||''}\n${result.stderr||''}`;
      const required=profile.kind==='codex'?['--json','--sandbox','--ignore-user-config','--output-schema']:profile.kind==='claude'?['--output-format','--session-id','--resume','--permission-mode']:['--output-format','--session-id','--resume','--no-ask-user'];
      if(config.providers.includes(profile)&&profile.kind==='claude')required.push('--safe-mode','--json-schema');
      const missing=required.filter(x=>!help.includes(x));
      record(!result.error&&result.status===0&&!missing.length,`${profile.id} オプション`,result.error?.message||(missing.length?`helpで確認できない: ${missing.join(', ')}`:'必要な主要フラグをhelpで確認。認証・実セッションの検証ではありません。'));
    }
  }
  record(true,'待受け',`127.0.0.1:${config.port} / 単一ユーザー向け`);
  record(true,'データ',config.dataDir);
} catch(e) {record(false,'設定',e.message);}
for(const r of rows)console.log(`${r.ok?'○':'×'} ${r.label}: ${r.detail}`);
console.log('\n認証・課金・社内ポリシー・CLIの実応答は検証していません。実行先と権限を確認してください。');
process.exitCode=rows.some(r=>!r.ok)?1:0;
