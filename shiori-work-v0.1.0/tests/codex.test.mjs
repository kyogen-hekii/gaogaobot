import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { cliSpec, runCLI, normalizeEvent } from '../src/adapters.mjs';
import { CODEX_OUTER_SCHEMA, codexPlan } from '../src/codex.mjs';
import { parsePlan } from '../src/outer.mjs';
import { loadConfig, ROOT } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';

const thread='0199a213-81c0-7800-8aa1-bbab2a035a53';
const profile={id:'codex-test',label:'Codex fixture',enabled:true,kind:'codex',command:process.execPath,commandArgs:[resolve(ROOT,'tests/fixtures/fake-codex.mjs')],cwd:ROOT,allowWrite:true};
const binding=()=>({providerSessionId:'app-placeholder',established:false});
test('Codex scopes both new and resumed commands, uses stdin and an exact thread',()=>{
  for(const established of [false,true])for(const role of ['outer','inner'])for(const mode of ['read','write']){
    const spec=cliSpec(profile,{established,providerSessionId:thread},role,'literal $() & prompt',mode);
    assert.equal(spec.args[0],profile.commandArgs[0]);assert.equal(spec.args[1],'exec');
    assert(spec.args.includes(`default_permissions="${role==='inner'&&mode==='write'?':workspace':':read-only'}"`));
    assert(!spec.args.includes('--sandbox'));
    assert(spec.args.includes('approval_policy="never"'));assert(spec.args.includes('--ignore-user-config'));
    if(process.platform==='win32')assert(spec.args.includes('windows.sandbox="elevated"'));
    assert(!spec.args.includes('--last'));assert(!spec.args.some(x=>x.includes('dangerously')));
    assert.equal(spec.args.at(-1),'-');assert.equal(spec.input,'literal $() & prompt');assert(!spec.args.includes(spec.input));
    if(established){assert.equal(spec.args.at(-2),thread);assert(spec.args.indexOf('-c')<spec.args.indexOf('resume'));}
    else assert(!spec.args.includes('app-placeholder'));
    if(role==='outer')assert(spec.args.includes('shell_tool'));
  }
});
test('read-only Codex cannot request write mode even through the adapter',()=>{
  assert.throws(()=>cliSpec({...profile,allowWrite:false},binding(),'inner','x','write'),/読み取り専用/);
  assert.throws(()=>cliSpec(profile,{established:true,providerSessionId:'--last'},'inner','x'),/セッションID/);
});
test('Codex configuration fingerprints include the model and permission scope',()=>{
  const config=p=>loadConfig(ROOT,{ignoreLocalConfig:true,outerProvider:'codex-test',providers:[{...profile,...p}],runners:[]});
  assert.notEqual(config({model:'a'}).providers[0].fingerprint,config({model:'b'}).providers[0].fingerprint);
  assert.notEqual(config({allowWrite:true}).providers[0].fingerprint,config({allowWrite:false}).providers[0].fingerprint);
});
test('Codex schema supports strict output while restoring optional plan fields',()=>{
  assert.deepEqual(JSON.parse(readFileSync(new URL('../src/codex-outer.schema.json',import.meta.url),'utf8')),CODEX_OUTER_SCHEMA);
  const check=s=>{if(s.type==='object'){assert.deepEqual(s.required,Object.keys(s.properties));assert.equal(s.additionalProperties,false);Object.values(s.properties).forEach(check);}if(s.items)check(s.items);s.anyOf?.forEach(check);};check(CODEX_OUTER_SCHEMA);
  const plan=codexPlan(JSON.stringify({reply:'ok',actions:[{type:'save_note',title:'note',content:'data',mode:null,workId:null}],review:null}));
  assert.deepEqual(parsePlan(plan),{reply:'ok',actions:[{type:'save_note',title:'note',content:'data'}]});
});
test('Codex events do not expose reasoning or command contents',()=>{
  assert.equal(normalizeEvent('codex',{type:'item.completed',item:{type:'reasoning',text:'secret'}}).type,'ignored');
  assert(!JSON.stringify(normalizeEvent('codex',{type:'item.started',item:{type:'command_execution',command:'secret'}})).includes('secret'));
});
test('Codex subprocess captures provider thread, usage, strict plan and exact resume',async()=>{
  const b=binding(),progress=[];
  const onSession=id=>{b.providerSessionId=id;b.established=true;};
  const first=await runCLI(profile,b,'outer','hello',{onSession,onProgress:e=>progress.push(e)});
  assert.equal(first.sessionId,thread);assert.equal(first.usage.output_tokens,7);assert.equal(parsePlan(first.structured).reply,'fixture reply');
  const second=await runCLI(profile,b,'outer','again',{onSession});
  assert.equal(parsePlan(second.structured).reply,'continued fixture reply');assert.equal(second.sessionId,thread);
  assert(!JSON.stringify(progress).includes('secret'));assert(!JSON.stringify(progress).includes('private reasoning'));
});
for(const [input,code] of [['invalid','INVALID_PROTOCOL'],['failure','RUNNER_ERROR'],['exit','CLI_EXIT'],['incomplete','INCOMPLETE_TURN'],['empty','EMPTY_RESULT'],['bad-plan','INVALID_PLAN']])test(`Codex fails closed for ${input}`,async()=>{
  await assert.rejects(runCLI(profile,binding(),'outer',input),error=>error.code===code);
});
test('Codex timeout and user cancellation terminate the invocation',async()=>{
  await assert.rejects(runCLI(profile,binding(),'inner','stall',{timeoutMs:200}),error=>error.code==='TIMEOUT');
  const controller=new AbortController();
  const running=runCLI(profile,binding(),'inner','stall',{signal:controller.signal,onSession:()=>controller.abort()});
  await assert.rejects(running,error=>error.code==='CANCELED');
});
test('HTTP conversation routes through Codex and keeps its thread across messages',async t=>{
  const config=loadConfig(ROOT,{ignoreLocalConfig:true,port:0,seedDemo:false,outerProvider:'codex-test',providers:[{...profile}],runners:[{...profile}]});
  const app=createApp(config,{store:new Store(':memory:')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const wait=async()=>{for(let i=0;i<100;i++){if(!app.engine.active.size&&!app.store.list('jobs').some(j=>j.status==='queued'))return;await new Promise(r=>setTimeout(r,20));}throw Error('fixture timeout');};
  for(const key of ['first','second']){
    const response=await fetch(base+'/api/conversations/main/messages',{method:'POST',headers:{'Content-Type':'application/json','X-Shiori-CSRF':app.csrf,'Idempotency-Key':key},body:JSON.stringify({text:'synthetic message'})});
    assert.equal(response.status,200);await wait();
  }
  assert.equal(app.store.list('jobs').length,2);assert(app.store.list('jobs').every(j=>j.status==='succeeded'));
  assert(app.store.list('sessions').some(s=>s.established&&s.providerSessionId===thread));
  assert(app.store.list('messages').some(m=>m.text==='continued fixture reply'));
});
