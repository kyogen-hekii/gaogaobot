import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../src/config.mjs';
import { codexLocation } from './codex-config.mjs';

// Stop only the idle local Bot whose PID owns both our lock and listening port.
// Never terminate all Node processes or a PID from an unchecked stale lock.
const config=process.argv.includes('--codex')?codexLocation():loadConfig();
const lock=resolve(config.dataDir,'server.lock');
if(!existsSync(lock)){console.log('Botの起動記録はありません。');process.exit(0);}
const pid=Number(readFileSync(lock,'utf8'));
if(!Number.isInteger(pid)||pid<=0)throw Error('起動記録のPIDが不正です。停止しません。');
try{process.kill(pid,0);}catch(error){
  if(error.code!=='ESRCH')throw error;
  unlinkSync(lock);console.log('Botは停止済みです。残っていた起動記録を削除しました。');process.exit(0);
}
const port=Number(process.env.PORT||config.port);
const response=await fetch(`http://127.0.0.1:${port}/api/state`,{signal:AbortSignal.timeout(3000)});
if(!response.ok)throw Error('Botの状態を確認できません。停止しません。');
const state=await response.json();
if(!/^0\.[12]\./.test(state.version)||!Array.isArray(state.jobs)||!Array.isArray(state.works))throw Error('しおりBotを確認できません。停止しません。');
if(state.jobs.some(j=>['running','cancel_requested','queued'].includes(j.status)))throw Error('実行中または待機中の仕事があります。アプリで停止してから終了してください。');
if(process.platform!=='win32')throw Error('この停止補助はWindows専用です。起動ターミナルからCtrl+Cで終了してください。');
const netstat=execFileSync(resolve(process.env.SYSTEMROOT||'C:/Windows','System32/netstat.exe'),['-ano','-p','TCP'],{encoding:'utf8',windowsHide:true,timeout:5000});
const ownsPort=netstat.split(/\r?\n/).some(line=>{const fields=line.trim().split(/\s+/);return fields[0]==='TCP'&&fields[1]===`127.0.0.1:${port}`&&fields[2]==='0.0.0.0:0'&&Number(fields.at(-1))===pid;});
if(!ownsPort)throw Error('起動記録とポート所有者が一致しません。停止しません。');
process.kill(pid,'SIGTERM');
for(let i=0;i<30;i++){
  let alive=true;try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')alive=false;else throw error;}
  if(!alive){if(existsSync(lock)&&Number(readFileSync(lock,'utf8'))===pid)unlinkSync(lock);console.log(`Botを停止しました (127.0.0.1:${port})。`);process.exit(0);}
  await new Promise(r=>setTimeout(r,100));
}
throw Error('停止完了を確認できませんでした。再起動しないで状態を確認してください。');
