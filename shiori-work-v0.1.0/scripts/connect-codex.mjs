import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadConfig } from '../src/config.mjs';
import { findCodex, probeCodex } from './codex-runtime.mjs';

// Register the existing login-backed CLI without changing the selected provider or auth.
const command=findCodex();
probeCodex(command,['login','status']);
const file=resolve(ROOT,'config.local.json');
const original=existsSync(file)?readFileSync(file,'utf8'):null;
const config=JSON.parse(original||readFileSync(resolve(ROOT,'config.example.json'),'utf8'));
const existing=config.providers?.find(p=>p.kind==='codex');
const provider={id:'codex',cwd:'workspaces/outer',...existing,label:'ChatGPT（Codex経由）',kind:'codex',enabled:true,command,description:'既存のCodexログインを使用します。ChatGPT Webとは別の会話です。'};
config.providers=[...(config.providers||[]).filter(p=>p.id!==provider.id),provider];
loadConfig(ROOT,{...structuredClone(config),ignoreLocalConfig:true});
if(original!==null&&readFileSync(file,'utf8')!==original)throw Error('接続設定が同時更新されました。');
writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log('ChatGPT（Codex経由）を接続先に追加しました。既存の選択・認証は維持しています。');
