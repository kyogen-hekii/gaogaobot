import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { loadConfig, ROOT } from '../src/config.mjs';
import { Engine } from '../src/engine.mjs';
import { parsePlan } from '../src/outer.mjs';
import { currentDelegation, dispatchFromPlan, recordReview } from '../src/delegation.mjs';
import { createApp } from '../src/server.mjs';
import { cliSpec } from '../src/adapters.mjs';

const workData={title:'調査',objective:'根拠を集める',acceptance:['根拠がある','未確認を区別する'],constraints:['変更しない']};
const grant={revision:1,runnerId:'demo',mode:'read',maxRuns:3,minutes:60,instruction:'調査を進めてください。'};
function setup(t,{mock,config:extra={}}={}) {
  const store=new Store(':memory:');
  const config=loadConfig(ROOT,{ignoreLocalConfig:true,dailyRuns:200,...extra});
  if(mock){config.providers[0].kind='claude';config.runners[0].kind='claude';}
  const engine=new Engine(store,config,{demoDelay:2,runCLI:mock});
  t.after(async()=>{await engine.shutdown();store.close();});
  const work=engine.createWork(workData);
  return {engine,store,work,config};
}
async function idle(engine){const end=Date.now()+5000;while(Date.now()<end){await engine.pump();if(!engine.active.size&&!engine.s.list('jobs').some(j=>j.status==='queued'))return;await new Promise(r=>setTimeout(r,10));}throw Error('Queue did not drain');}
function review(verdict='needs_work'){return {verdict,summary:'成果物に基づく確認',criteria:[0,1].map(index=>({index,status:verdict==='ready'?'met':'unknown',evidence:'成果物の該当箇所を確認'}))};}
function continuingMock(workId,{forever=false,mode='read',fail=false,denials=[]}={}){
  let runs=0;
  return async(_p,_b,role)=>{
    if(role==='inner'){runs++;if(fail)throw Error('worker failed');return {text:'調査結果と根拠',denials};}
    const more=forever||runs<2;
    const plan={reply:more?'不足を補います。':'受け入れをお願いします。',review:review(more?'needs_work':'ready'),actions:more?[{type:'propose_dispatch',workId:workId(),runnerId:'demo',mode,instruction:'不足の根拠を追加してください。'}]:[]};
    return {structured:plan,text:JSON.stringify(plan)};
  };
}

test('one delegation runs, reviews, continues in the same session and returns for acceptance',async t=>{
  let key;const {engine:e,store:s,work:w}=setup(t,{mock:continuingMock(()=>key)});key=w.id;
  e.delegate(w.id,grant);await idle(e);
  const runs=s.list('jobs').filter(j=>j.role==='inner');
  assert.equal(runs.length,2);assert.equal(runs[0].sessionId,runs[1].sessionId);
  assert.equal(s.list('approvals').length,0);assert.equal(s.list('reviews').length,2);
  assert.equal(currentDelegation(s,w.id).status,'completed');assert.equal(s.must('works',w.id).status,'review');
  e.acceptWork(w.id,{revision:1,checked:[0,1]});assert.equal(s.must('works',w.id).status,'done');
});
test('repeated model continuation is bounded by the exact run budget',async t=>{
  let key;const {engine:e,store:s,work:w}=setup(t,{mock:continuingMock(()=>key,{forever:true})});key=w.id;
  e.delegate(w.id,{...grant,maxRuns:2});await idle(e);
  assert.equal(s.list('jobs').filter(j=>j.role==='inner').length,2);
  assert.equal(currentDelegation(s,w.id).status,'exhausted');assert.equal(s.list('approvals').length,0);
});
test('demo demonstrates continuation without claiming real acceptance evidence',async t=>{
  const {engine:e,store:s,work:w}=setup(t);e.delegate(w.id,grant);await idle(e);
  assert.equal(s.list('artifacts').length,2);assert.equal(currentDelegation(s,w.id).status,'blocked');
  assert(s.list('reviews').every(r=>r.criteria.every(c=>c.status==='unknown')));
});
test('revoking a queued delegation cancels its job and never starts it',async t=>{
  const {engine:e,store:s,work:w}=setup(t);e.setSettings({paused:true});const {job}=e.delegate(w.id,grant);
  e.stopDelegation(w.id);e.setSettings({paused:false});await idle(e);
  assert.equal(s.must('jobs',job.id).status,'canceled');assert.equal(currentDelegation(s,w.id).status,'revoked');assert.equal(s.list('artifacts').length,0);
});
test('canceling a single queued run also revokes its remaining delegation',async t=>{
  const {engine:e,store:s,work:w}=setup(t);e.setSettings({paused:true});const {job}=e.delegate(w.id,grant);
  e.cancel(job.id);assert.equal(currentDelegation(s,w.id).status,'revoked');
  e.setSettings({paused:false});await idle(e);assert.equal(s.list('artifacts').length,0);
});
test('recovery blocks interrupted delegations and preserves the workspace lock',t=>{
  const {engine:e,store:s,work:w,config}=setup(t);e.setSettings({paused:true});const {job}=e.delegate(w.id,grant);
  job.status='running';s.put('jobs',job);s.put('locks',{id:'crashed-lock',jobId:job.id,workspace:config.runners[0].cwd});
  e.recover();assert.equal(currentDelegation(s,w.id).status,'interrupted');
  assert.equal(s.must('jobs',job.id).status,'interrupted');assert.equal(s.list('locks').length,1);
});
test('missing structured review fails closed and stops the delegation',async t=>{
  const {engine:e,store:s,work:w}=setup(t,{mock:async(_p,_b,role)=>role==='inner'?{text:'result'}:{structured:{reply:'finished',actions:[]}}});
  e.delegate(w.id,grant);await idle(e);
  assert.equal(s.list('jobs').at(-1).errorCode,'REVIEW_REQUIRED');assert.equal(currentDelegation(s,w.id).status,'blocked');
});
test('needs-work review without a next action visibly stops instead of staying active',async t=>{
  const {engine:e,store:s,work:w}=setup(t,{mock:async(_p,_b,role)=>role==='inner'?{text:'result'}:{structured:{reply:'不足があります。',review:review(),actions:[]}}});
  e.delegate(w.id,grant);await idle(e);
  assert.equal(currentDelegation(s,w.id).status,'blocked');assert.equal(s.must('works',w.id).status,'blocked');
  assert(s.list('messages').at(-1).text.includes('作業は停止しています'));
});
test('write-disabled runner rejects a write delegation without reserving a run',t=>{
  const {engine:e,store:s,work:w,config}=setup(t);config.runners[0].allowWrite=false;
  assert.throws(()=>e.delegate(w.id,{...grant,mode:'write'}),/変更作業/);
  assert.equal(s.list('delegations').length,0);assert.equal(s.list('jobs').length,0);
});
test('restricted edit adapter exposes only the configured file tools',()=>{
  const tools=['Read','Glob','Grep','Edit','Write'];
  const spec=cliSpec({kind:'claude',restricted:true,allowedTools:tools},{providerSessionId:'session'},'inner','edit','write');
  assert(spec.args.includes('--restricted'));assert(spec.args.includes('--strict-mcp-config'));
  assert.equal(spec.args[spec.args.indexOf('--tools')+1],tools.join(','));
  assert(!spec.args.includes('--dangerously-skip-permissions'));assert(!spec.args.includes('Bash'));
});
test('read mode on an edit-capable restricted profile has exactly one read-only tool list',()=>{
  const spec=cliSpec({kind:'claude',restricted:true,allowedTools:['Read','Edit','Write']},{providerSessionId:'session'},'inner','read','read');
  assert.equal(spec.args.filter(a=>a==='--tools').length,1);
  assert.equal(spec.args[spec.args.indexOf('--tools')+1],'Read,Glob,Grep');
});
test('a delegation cannot dispatch a different work item',t=>{
  const {engine:e,work:w}=setup(t);e.setSettings({paused:true});const {delegation}=e.delegate(w.id,grant);
  const other=e.createWork({...workData,title:'別の仕事'});
  assert.throws(()=>dispatchFromPlan(e,{workId:other.id,runnerId:'demo',mode:'read',instruction:'実行'},{workId:w.id,delegationId:delegation.id,trigger:'result'},review()));
});
test('stopping a running delegation prevents its result from restarting work',async t=>{
  const {engine:e,store:s,work:w}=setup(t);e.demoDelay=100;const {job}=e.delegate(w.id,grant);e.stopDelegation(w.id);await idle(e);
  assert.equal(s.must('jobs',job.id).status,'canceled');assert.equal(s.list('jobs').length,1);assert.equal(s.list('locks').length,0);
});
test('deadline stops queued work even while global execution is paused',async t=>{
  const {engine:e,store:s,work:w}=setup(t);e.setSettings({paused:true});const {delegation,job}=e.delegate(w.id,grant);
  delegation.expiresAt='2000-01-01T00:00:00Z';s.put('delegations',delegation);await e.tick();
  assert.equal(s.must('jobs',job.id).status,'canceled');assert.equal(currentDelegation(s,w.id).status,'expired');
});
test('changing requirements revokes a queued delegation',async t=>{
  const {engine:e,store:s,work:w}=setup(t);e.setSettings({paused:true});const {job}=e.delegate(w.id,grant);
  e.editWork(w.id,{revision:1,objective:'条件を変更'});
  assert.equal(s.must('jobs',job.id).status,'canceled');assert.equal(currentDelegation(s,w.id).status,'superseded');
});
test('profile changes invalidate an authorized queued job',async t=>{
  const {engine:e,store:s,work:w,config}=setup(t);e.setSettings({paused:true});const {job}=e.delegate(w.id,grant);
  config.runners[0].fingerprint='changed';e.setSettings({paused:false});await idle(e);
  assert.equal(s.must('jobs',job.id).errorCode,'PROFILE_CHANGED');assert.equal(currentDelegation(s,w.id).status,'blocked');
});
test('model cannot widen a read delegation into writes',async t=>{
  let key;const {engine:e,store:s,work:w}=setup(t,{mock:continuingMock(()=>key,{mode:'write'})});key=w.id;
  e.delegate(w.id,grant);await idle(e);
  assert.equal(s.list('jobs').filter(j=>j.role==='inner').length,1);assert.equal(currentDelegation(s,w.id).status,'blocked');
});
test('worker failure stops without automatic retries',async t=>{
  const {engine:e,store:s,work:w}=setup(t,{mock:continuingMock(()=>'',{fail:true})});e.delegate(w.id,grant);await idle(e);
  assert.equal(s.list('jobs').length,1);assert.equal(currentDelegation(s,w.id).status,'blocked');assert.equal(s.must('works',w.id).status,'blocked');
});
test('permission denials cannot lead to automatic continuation',async t=>{
  let key;const {engine:e,store:s,work:w}=setup(t,{mock:continuingMock(()=>key,{forever:true,denials:['Write']})});key=w.id;e.delegate(w.id,grant);await idle(e);
  assert.equal(s.list('jobs').filter(j=>j.role==='inner').length,1);assert.equal(currentDelegation(s,w.id).status,'blocked');
});
test('invalid grants roll back decisions, jobs and delegations',t=>{
  const {engine:e,store:s,work:w}=setup(t);
  for(const invalid of [{maxRuns:0},{maxRuns:21},{maxRuns:1.5},{minutes:0},{minutes:1441},{revision:0},{mode:'admin'},{runnerId:'missing'}])assert.throws(()=>e.delegate(w.id,{...grant,...invalid}));
  assert.equal(s.list('delegations').length,0);assert.equal(s.list('jobs').length,0);assert.equal(s.list('decisions').length,0);
});
test('a stale result cannot consume a replacement delegation',async t=>{
  const {engine:e,store:s,work:w}=setup(t);e.setSettings({paused:true});const first=e.delegate(w.id,grant);e.stopDelegation(w.id);const second=e.delegate(w.id,grant);
  assert.throws(()=>dispatchFromPlan(e,{workId:w.id,runnerId:'demo',mode:'read',instruction:'続行'},{workId:w.id,delegationId:first.delegation.id,trigger:'result'},review()),/以前/);
  assert.equal(s.must('delegations',second.delegation.id).usedRuns,1);
});
test('duplicate/missing criteria and unsupported completion claims are rejected',t=>{
  const {engine:e,store:s,work:w}=setup(t);
  s.put('jobs',{id:'worker',denials:[]});s.put('artifacts',{id:'result',workId:w.id,runId:'worker',source:'runner'});
  const job={id:'outer',trigger:'result',workId:w.id,workRevision:1,resultArtifactId:'result'};
  const duplicate=review();duplicate.criteria[1].index=0;assert.throws(()=>recordReview(e,duplicate,job),/一度/);
  const unknownReady=review();unknownReady.verdict='ready';assert.throws(()=>recordReview(e,unknownReady,job),/未達/);
  assert.throws(()=>parsePlan({reply:'x',actions:[],review:{verdict:'ready',summary:'x',criteria:[]}}));
});
test('HTTP delegation endpoints include CSRF protection and serve the new UI assets',async t=>{
  const s=new Store(':memory:'),config=loadConfig(ROOT,{ignoreLocalConfig:true,port:0});
  const app=createApp(config,{store:s,demoDelay:2});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const post=(path,body,csrf=app.csrf)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Shiori-CSRF':csrf},body:JSON.stringify(body)});
  const w=await (await post('/api/works',workData)).json();app.engine.setSettings({paused:true});
  assert.equal((await post(`/api/works/${w.id}/delegate`,grant,'wrong')).status,403);
  assert.equal((await post(`/api/works/${w.id}/delegate`,grant)).status,200);
  assert.equal((await post(`/api/works/${w.id}/stop-delegation`,{})).status,200);
  for(const file of ['/delegation-ui.mjs','/delegation.css'])assert.equal((await fetch(base+file)).status,200);
  const state=await (await fetch(base+'/api/state')).json();assert.equal(state.delegations[0].status,'revoked');
});
