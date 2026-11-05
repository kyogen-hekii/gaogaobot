import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { loadConfig, ROOT } from '../src/config.mjs';
import { Engine } from '../src/engine.mjs';
import { cliSpec } from '../src/adapters.mjs';
import { loadModelOptions } from '../src/models.mjs';

test('model catalog uses CLI refresh, filters hidden entries and shares one lookup',()=>{
  const config={providers:[{kind:'codex',enabled:true,command:'codex',cwd:ROOT}],runners:[{kind:'codex',enabled:true,command:'codex',cwd:ROOT}]};
  let calls=0;
  loadModelOptions(config,(_command,args)=>{calls++;assert.deepEqual(args,['debug','models']);return {status:0,stdout:JSON.stringify({models:[{slug:'gpt-6.1-sol',display_name:'GPT-6.1 Sol',visibility:'list'},{slug:'internal-model',visibility:'hide'}]})};});
  assert.equal(calls,1);
  assert.deepEqual(config.providers[0].modelOptions,[{id:'gpt-6.1-sol',label:'GPT-6.1 Sol'}]);
  assert.equal(config.providers[0].modelCatalogStatus,'cli');
  assert.deepEqual(config.runners[0].modelOptions,config.providers[0].modelOptions);
});
test('failed catalog is explicit and does not fall back to stale bundled models',()=>{
  const config={providers:[{kind:'codex',enabled:true,cwd:ROOT}],runners:[]};
  loadModelOptions(config,()=>({status:1}));
  assert.equal(config.providers[0].modelCatalogStatus,'unavailable');
  assert.deepEqual(config.providers[0].modelOptions,[]);
});

function setup(){
  const store=new Store(':memory:');
  const config=loadConfig(ROOT,{ignoreLocalConfig:true,seedDemo:false,outerProvider:'claude',providers:[
    {id:'claude',kind:'claude',label:'Claude',enabled:true,cwd:ROOT},
    {id:'codex',kind:'codex',label:'ChatGPT',enabled:true,cwd:ROOT}
  ]});
  const seen=[];
  const runCLI=async(p,b)=>{seen.push({model:p.model||'',kind:p.kind,session:b.id});return {structured:{reply:'ok',actions:[]}};};
  const engine=new Engine(store,config,{runCLI});
  engine.setSettings({paused:true});
  return {store,config,engine,seen,runCLI};
}
test('model choice persists per provider and settings validation is atomic',()=>{
  const {engine:e,store:s,config,runCLI}=setup();
  e.setSettings({outerModel:'opus'});
  e.setSettings({outerProvider:'codex',outerModel:'gpt-6-sol'});
  e.setSettings({outerProvider:'claude'});
  assert.equal(e.profile('outer','claude').model,'opus');
  assert.equal(e.profile('outer','codex').model,'gpt-6-sol');
  assert.throws(()=>e.setSettings({outerProvider:'codex',outerModel:'--bad model'}));
  assert.equal(s.meta('settings').outerProvider,'claude');
  assert.equal(new Engine(s,config,{runCLI}).profile('outer','codex').model,'gpt-6-sol');
  e.setSettings({outerModel:''});
  assert.equal(e.profile('outer','claude').model||'','');
  e.stopped=true;s.close();
});
test('queued requests keep their models across switches and execute with correct arguments',async()=>{
  const {engine:e,store:s,seen}=setup();
  e.setSettings({outerModel:'sonnet'});
  const first=e.send('main',{text:'one'},'one');
  e.setSettings({outerModel:'opus'});
  const second=e.send('main',{text:'two'},'two');
  e.setSettings({outerProvider:'codex',outerModel:'gpt-6-sol'});
  const third=e.send('main',{text:'three'},'three');
  assert.notEqual(first.sessionId,second.sessionId);
  e.setSettings({paused:false});
  for(let i=0;i<100&&s.list('jobs').some(j=>['queued','running'].includes(j.status));i++)await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(s.list('jobs').map(j=>j.status),['succeeded','succeeded','succeeded']);
  assert.deepEqual(seen.map(x=>x.model),['sonnet','opus','gpt-6-sol']);
  assert.equal(s.must('jobs',third.id).profileId,'codex');
  for(const p of seen){const args=cliSpec({...p,cwd:ROOT},{providerSessionId:'fixture-session'},'outer','hello').args;assert.equal(args[args.indexOf('--model')+1],p.model);}
  await e.shutdown();s.close();
});
test('model changes do not change inner profiles or their approvals',()=>{
  const {engine:e,store:s}=setup();
  const before=e.profile('inner','demo').fingerprint;
  e.setSettings({outerModel:'opus'});
  assert.equal(e.profile('inner','demo').fingerprint,before);
  assert.throws(()=>e.setSettings({outerProvider:'missing',outerModel:'opus'}));
  assert.throws(()=>e.setSettings({outerModel:{command:'bad'}}));
  e.stopped=true;s.close();
});
