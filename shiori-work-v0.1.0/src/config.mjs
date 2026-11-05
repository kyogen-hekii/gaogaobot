import { readFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, hash } from './store.mjs';
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function loadConfig(base=ROOT,override={}) {
  const local=resolve(base,'config.local.json');
  const defaults={port:4317,maxConcurrent:2,maxQueued:30,dailyRuns:40,timeoutMs:180000,seedDemo:true,
    outerProvider:'demo',providers:[
      {id:'demo',label:'デモ（外部通信なし）',kind:'demo',enabled:true,cwd:'workspaces/outer'},
      {id:'claude',label:'Claude Code',kind:'claude',enabled:false,cwd:'workspaces/outer',command:'claude'},
      {id:'copilot',label:'GitHub Copilot',kind:'copilot',enabled:false,cwd:'workspaces/outer',command:'copilot'}
    ],runners:[
      {id:'demo',label:'デモの仕事場',description:'調査・実行・差し戻しの流れを模擬します。実際の開発やテストは行いません。',kind:'demo',enabled:true,cwd:'workspaces/demo',allowWrite:true},
      {id:'claude-dev',label:'Claude Code / 開発',description:'登録済みリポジトリのClaude CodeとSkillsを使用',kind:'claude',enabled:false,cwd:'workspaces/demo',command:'claude',allowWrite:false,allowedTools:['Read','Glob','Grep']},
      {id:'copilot-dev',label:'Copilot / 開発',description:'登録済みリポジトリのCopilot CLIを使用',kind:'copilot',enabled:false,cwd:'workspaces/demo',command:'copilot',allowWrite:false,allowedTools:['view','glob','grep']}
    ]};
  const conf={...defaults,...(!override.ignoreLocalConfig&&existsSync(local)?JSON.parse(readFileSync(local,'utf8')):{}),...override,base};
  assert(Number.isInteger(conf.port)&&conf.port>=0&&conf.port<65536,'ポート番号が不正です。');
  for(const key of ['maxConcurrent','maxQueued','dailyRuns','timeoutMs']) assert(Number.isFinite(conf[key])&&conf[key]>0,`${key}が不正です。`);
  conf.dataDir=resolve(base,override.dataDir||process.env.SHIORI_DATA_DIR||'.data');
  for(const list of [conf.providers,conf.runners]) {
    const seen=new Set();
    for(const p of list) {
      assert(/^[a-zA-Z0-9_-]{1,60}$/.test(p.id)&&!seen.has(p.id),'プロファイルIDが重複または不正です。');seen.add(p.id);
      assert(['demo','claude','copilot','codex'].includes(p.kind),'未対応のエージェントです。');
      p.cwd=resolve(base,p.cwd||'workspaces/outer');
      if(p.kind==='demo')mkdirSync(p.cwd,{recursive:true});
      if(p.enabled) {assert(existsSync(p.cwd),`仕事場が見つかりません: ${p.cwd}`);p.cwd=realpathSync(p.cwd);}
      if(p.commandArgs!==undefined)assert(Array.isArray(p.commandArgs)&&p.commandArgs.every(t=>typeof t==='string'),'commandArgsは文字列の配列です。');
      p.fingerprint=hash({kind:p.kind,cwd:p.cwd,model:p.model||null,command:p.command||null,commandArgs:p.commandArgs||[],allowedTools:p.allowedTools||[],allowWrite:!!p.allowWrite,restricted:!!p.restricted});
      if(p.allowedTools)assert(Array.isArray(p.allowedTools)&&p.allowedTools.every(t=>typeof t==='string'),'allowedToolsは配列です。');
    }
  }
  assert(conf.providers.some(p=>p.id===conf.outerProvider&&p.enabled),'有効なOuter Providerを選択してください。');
  return conf;
}
export function publicProfile(p){return {id:p.id,label:p.label,kind:p.kind,enabled:p.enabled,description:p.description||'',cwd:p.cwd,model:p.model||(p.kind==='codex'?'Codex標準':'CLIの設定'),modelId:p.model||'',modelOptions:p.modelOptions||[],modelCatalogStatus:p.modelCatalogStatus||null,allowWrite:!!p.allowWrite};}
