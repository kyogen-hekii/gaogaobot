import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, ROOT } from '../src/config.mjs';
import { findCodex } from './codex-runtime.mjs';

export function codexLocation(){return {port:4319,dataDir:resolve(ROOT,'.cache/codex-dev')};}
export function loadCodexConfig(){
  const local=loadConfig();
  const command=findCodex(),model=process.env.SHIORI_CODEX_MODEL||undefined;
  const cwd=resolve(ROOT,'.cache/codex-outer');mkdirSync(cwd,{recursive:true});
  return loadConfig(ROOT,{...codexLocation(),ignoreLocalConfig:true,seedDemo:false,outerProvider:'codex-dev',
    providers:[...local.providers.filter(p=>p.kind!=='codex'),{id:'codex-dev',label:'ChatGPT（Codex経由）',kind:'codex',enabled:true,command,model,cwd,description:'既存のCodexログインを使います。ChatGPT Webとは別の会話で、Codexで利用可能なモデルを選びます。'}],
    runners:[
      {id:'codex-read',label:'Codex / 調査（開発用）',kind:'codex',enabled:true,command,model,cwd:ROOT,allowWrite:false,description:'読み取り専用サンドボックスで調査します。'},
      {id:'codex-edit',label:'Codex / 実装（検証待ち）',kind:'codex',enabled:false,command,model,cwd:ROOT,allowWrite:true,description:'このWindows環境ではsandbox内の書込み試験が失敗したため無効です。smoke:codex:workspaceの成功後に有効化してください。'}
    ]});
}
