import { spawn } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexArgs, codexEvent, codexPlan } from './codex.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppError, assert } from './store.mjs';
import { OUTER_SCHEMA } from './outer.mjs';

/** Build argv without a shell. Prompts are always sent on stdin, never interpolated. */
export function cliSpec(profile, binding, role, prompt, mode='read') {
  const args=[...(profile.commandArgs||[])];
  if(profile.kind==='claude') {
    args.push('-p','--output-format','stream-json','--verbose','--permission-mode','dontAsk');
    args.push(binding.established?'--resume':'--session-id',binding.providerSessionId);
    if(role==='outer')args.push('--safe-mode','--tools','','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--json-schema',JSON.stringify(OUTER_SCHEMA));
    else {
      const allowed=profile.allowedTools||['Read','Glob','Grep'];
      if(profile.restricted)args.push('--restricted');
      if(allowed.length)args.push('--allowedTools',allowed.join(','));
      if(mode==='read')args.push('--tools','Read,Glob,Grep','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}');
      else if(profile.restricted)args.push('--tools',allowed.join(','),'--strict-mcp-config','--mcp-config','{"mcpServers":{}}');
      // In write mode the reviewed workspace rules/skills stay active. No permission bypass.
    }
    if(profile.model)args.push('--model',profile.model);
  } else if(profile.kind==='copilot') {
    // Piped stdin is official noninteractive mode. Combining it with -p would ignore stdin.
    args.push('--output-format=json','--no-ask-user','--no-auto-update');
    args.push(binding.established?`--resume=${binding.providerSessionId}`:`--session-id=${binding.providerSessionId}`);
    if(role==='outer')args.push('--available-tools=','--deny-tool=*','--no-custom-instructions','--disable-builtin-mcps');
    else {
      for(const t of profile.allowedTools||['view','glob','grep'])args.push(`--allow-tool=${t}`);
      if(mode==='read')args.push('--available-tools=view,glob,grep','--disable-builtin-mcps');
    }
    if(profile.model)args.push(`--model=${profile.model}`);
  } else if(profile.kind==='codex')args.push(...codexArgs(profile,binding,role,mode));
  else throw new AppError('未対応のCLIです。');
  return {command:profile.command||profile.kind,args,cwd:profile.cwd,input:prompt};
}
export function normalizeEvent(kind,e) {
  if(kind==='codex')return codexEvent(e);
  const d=e.data||{};
  const sid=e.session_id||e.sessionId||d.sessionId||d.session_id;
  if(e.type==='system'&&e.subtype==='init'||e.type==='session.start')return {type:'session',sessionId:sid};
  if(e.type==='result')return {type:'result',text:typeof e.result==='string'?e.result:'',structured:e.structured_output,failed:!!e.is_error,sessionId:sid,usage:e.usage||{},denials:e.permission_denials||[]};
  if(e.type==='assistant') {
    const content=e.message?.content;
    const parts=Array.isArray(content)?content.filter(x=>x.type==='text').map(x=>x.text):[];
    return {type:'text',text:parts.join('\n'),sessionId:sid};
  }
  if(e.type==='assistant.message')return {type:'text',text:typeof d.content==='string'?d.content:'',sessionId:sid};
  if(e.type==='assistant.message_delta')return {type:'delta',text:d.deltaContent||d.delta||'',sessionId:sid};
  if(e.type==='session.error'||e.type==='error')return {type:'error',text:d.message||e.message||'CLI error'};
  if(e.type==='session.idle'||e.type==='session.shutdown')return {type:'end',sessionId:sid};
  if(e.type==='tool.execution_start')return {type:'progress',text:`ツール実行: ${d.toolName||'tool'}`};
  // Reasoning, tool input, secret payloads and unknown vendor events are not exposed in the UI.
  return {type:'ignored'};
}
export function redact(value,env=process.env) {
  let s=String(value);
  for(const [k,v] of Object.entries(env))if(v&&v.length>=8&&/(TOKEN|API_KEY|SECRET|PASSWORD|AUTHORIZATION)/i.test(k))s=s.split(v).join('[REDACTED]');
  return s.replace(/(?:sk-ant-|gh[pousr]_)[A-Za-z0-9_-]{10,}/g,'[REDACTED]');
}
export async function runCLI(profile,binding,role,prompt,options={}) {
  if(options.signal?.aborted)throw new AppError('CANCELED: 実行は停止されました。',502,'CANCELED');
  const spec=cliSpec(profile,binding,role,prompt,options.mode);
  if(profile.kind==='codex'&&role==='outer'){
    const schemaPath=fileURLToPath(new URL('./codex-outer.schema.json',import.meta.url));
    spec.args.splice(spec.args.length-(binding.established?2:1),0,'--output-schema',schemaPath);
  }
  const env={...process.env,CLAUDE_CODE_DISABLE_BACKGROUND_TASKS:'1',NO_COLOR:'1'};
  for(const key of Object.keys(env))if(key.startsWith('SHIORI_'))delete env[key];
  delete env.CLAUDECODE; // a standalone process, not a nested interactive session
  return await new Promise((resolve,reject)=>{
    let proc,buffer='',stderr='',total=0,final=null,texts=[],deltas='',fatal='',settled=false,killTimer,sessionId=binding.providerSessionId;
    const timeout=options.timeoutMs||180000;
    const finish=(err,result)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);options.signal?.removeEventListener('abort',abort);err?reject(err):resolve(result);};
    const stop=()=>{
      if(!proc?.pid||proc.exitCode!==null||proc.signalCode!==null)return;
      if(process.platform==='win32'&&profile.kind==='codex'){
        // Terminate only this invocation and its descendants, including shell tools.
        if(killTimer)return;
        const killer=spawn(resolvePath(process.env.SYSTEMROOT||'C:/Windows','System32/taskkill.exe'),['/PID',String(proc.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});
        killer.on('error',()=>{try{proc.kill('SIGTERM');}catch{}});
      }else try{if(process.platform!=='win32')process.kill(-proc.pid,'SIGTERM');else proc.kill('SIGTERM');}catch{}
      killTimer=setTimeout(()=>{if(proc.exitCode!==null||proc.signalCode!==null)return;try{if(process.platform!=='win32')process.kill(-proc.pid,'SIGKILL');else proc.kill('SIGKILL');}catch{}},1500);
    };
    const abort=()=>{fatal='CANCELED';stop();};
    const timer=setTimeout(()=>{fatal='TIMEOUT';stop();},timeout);
    const line=(s)=>{
      if(!s.trim())return;
      let e;try{e=JSON.parse(s);}catch{fatal=fatal||'INVALID_PROTOCOL';return;}
      try {
      const n=normalizeEvent(profile.kind,e);
      if(n.sessionId){sessionId=n.sessionId;options.onSession?.(n.sessionId);}
      if(n.type==='result'){final=n;if(n.failed)fatal='RUNNER_ERROR';}
      if(n.type==='text'&&n.text){texts.push(n.text);options.onProgress?.({type:'message',text:redact(n.text).slice(0,1000)});}
      if(n.type==='delta')deltas+=n.text;
      if(n.type==='error'){fatal='RUNNER_ERROR';stderr+=n.text;}
      if(n.type==='progress')options.onProgress?.(n);
      } catch(e){fatal=e.code||'PROTOCOL_ERROR';stderr+=e.message;stop();}
    };
    try {proc=spawn(spec.command,spec.args,{cwd:spec.cwd,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});}
    catch(e){finish(e);return;}
    options.onPid?.(proc.pid);
    proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');
    proc.stdout.on('data',chunk=>{total+=Buffer.byteLength(chunk);if(total>4*1024*1024){fatal='OUTPUT_LIMIT';stop();return;}buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){line(buffer.slice(0,i));buffer=buffer.slice(i+1);}});
    proc.stderr.on('data',s=>{stderr=(stderr+s).slice(-16000);});
    proc.on('error',e=>finish(new AppError(e.code==='ENOENT'?`${spec.command}が見つかりません。インストールとPATHを確認してください。`:redact(e.message),503,'CLI_UNAVAILABLE')));
    proc.stdin.on('error',()=>{});
    proc.on('close',code=>{
      if(buffer.trim())line(buffer);
      if(options.signal?.aborted)fatal='CANCELED';
      if(profile.kind==='codex'&&code===0&&!final&&!fatal)fatal='INCOMPLETE_TURN';
      if(fatal||code!==0){const error=redact(stderr||final?.text||'CLIが正常終了しませんでした。');finish(new AppError(`${fatal||'CLI_EXIT'}: ${error.slice(0,3000)}`,502,fatal||'CLI_EXIT'));return;}
      const answer=final?.structured?JSON.stringify(final.structured):final?.text||texts.at(-1)||deltas;
      if(!answer){finish(new AppError('CLIから回答を取得できませんでした。出力形式とバージョンを確認してください。',502,'EMPTY_RESULT'));return;}
      let structured=final?.structured;
      if(profile.kind==='codex'&&role==='outer'){
        try{structured=codexPlan(answer);}catch{finish(new AppError('Codexの管理応答がJSONではありません。',502,'INVALID_PLAN'));return;}
      }
      finish(null,{text:redact(answer).slice(0,180000),structured,denials:final?.denials||[],usage:final?.usage||{},sessionId});
    });
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)abort();
    proc.stdin.end(spec.input);
  });
}
export async function runDemoInner(work,prompt,binding,{signal,onProgress,delay=350}={}) {
  for(const step of ['目的・制約・受け入れ条件を確認しています','登録された仕事場へ依頼しました','結果と未検証事項を整理しています']){await sleep(delay,undefined,{signal});onProgress?.({type:'progress',text:step});}
  return {sessionId:binding.providerSessionId,text:`# ${work.title} — 実行結果（デモ）\n\n## 今回の依頼\n${prompt}\n\n## 目的\n${work.objective}\n\n## 整理したこと\n- 目的と対象を維持したまま、調査の観点を整理しました。\n- 確定事項と未決事項を分けて管理します。\n- 継続依頼では同じ論理セッションを使用します。\n\n## 受け入れ条件\n${work.acceptance.map(x=>'- [ ] '+x).join('\n')}\n\n## 制約\n${work.constraints.map(x=>'- '+x).join('\n')}\n\n## 未検証\nこの出力は動作確認用です。実ファイルの読み取り・変更、ビルド、テスト、PR作成はしていません。実行成功を仕事の完了と見なさず、受け入れ確認または差し戻しを行ってください。\n\n## 次の行動\n実接続後、根拠となるファイルと検証結果を確認してください。`,denials:[],usage:{}};
}
