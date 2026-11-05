// Standalone UX preview only. Not the durable server or the real CLI runner.
window.__SHIORI_PREVIEW__=true;
(() => {
 const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:r&3|8).toString(16);});
 const now=()=>new Date().toISOString();const listeners=[];
 const d={version:'0.1.0-preview',csrf:'preview-only',settings:{outerProvider:'demo',paused:false},limits:{dailyRuns:40,maxConcurrent:2},providers:[{id:'demo',label:'画面体験デモ',kind:'demo',enabled:true}],runners:[{id:'demo',label:'デモの仕事場',kind:'demo',enabled:true,cwd:'（プレビュー）',description:'実コードの変更や外部接続は行いません。',allowWrite:true,model:'模擬応答'}],conversations:[{id:'main',title:'メインチャット',workId:null,createdAt:now()}],messages:[],works:[],approvals:[],decisions:[],artifacts:[],routines:[],jobs:[],sessions:[],locks:[],events:[]};
 const notify=()=>listeners.forEach(fn=>fn({data:'{}'}));
 const event=(type,title,workId)=>d.events.push({seq:d.events.length+1,type,title,workId,at:now()});
 const msg=(c,role,text,cards=[])=>d.messages.push({id:uuid(),conversationId:c,role,text,cards,at:now()});
 function work(body,c='main') {const w={id:uuid(),title:body.title,objective:body.objective,acceptance:body.acceptance||['結果と根拠を確認できる','未決事項が分かる'],constraints:body.constraints||['改修・外部送信はしない'],status:'draft',revision:1,createdAt:now(),updatedAt:now(),conversationId:uuid()};d.works.push(w);d.conversations.push({id:w.conversationId,title:w.title,workId:w.id,createdAt:now()});msg(w.conversationId,'assistant','目的と条件を保存しました。まだ実行していません。');event('work.created','仕事の下書きを作成しました',w.id);return w;}
 function approval(w,body){const a={id:uuid(),workId:w.id,profileId:'demo',workRevision:w.revision,mode:body.mode||'read',instruction:body.instruction,status:'pending',digest:uuid(),createdAt:now(),expiresAt:new Date(Date.now()+1800000).toISOString()};d.approvals.push(a);w.status='waiting_approval';event('approval.requested','実行前の確認が必要です',w.id);return a;}
 function run(a){const w=d.works.find(w=>w.id===a.workId);let b=d.sessions.find(b=>b.ownerId===w.id&&!b.retired);if(!b){b={id:uuid(),ownerId:w.id,role:'inner',profileId:'demo',generation:d.sessions.filter(x=>x.ownerId===w.id).length+1,providerSessionId:uuid()};d.sessions.push(b);}const j={id:uuid(),role:'inner',status:'running',workId:w.id,sessionId:b.id,conversationId:w.conversationId,profileId:'demo',prompt:a.instruction,progress:'目的と条件を確認しています',createdAt:now()};d.jobs.push(j);w.status='running';event('run.started','デモの仕事場で実行を開始しました',w.id);notify();
 setTimeout(()=>{if(j.status==='canceled')return;j.status='succeeded';j.finishedAt=now();w.status='review';const ar={id:uuid(),title:w.title+' — 実行結果（デモ）',workId:w.id,conversationId:w.conversationId,runId:j.id,source:'demo',createdAt:now(),content:'# '+w.title+'\n\n## 目的\n'+w.objective+'\n\n## 今回の依頼\n'+a.instruction+'\n\n## 整理したこと\n- 確定事項と未決事項を分けて整理する\n- 判断に必要な根拠を残す\n- 同じ仕事は同じセッションで継続する\n\n## 未検証\nこれは画面体験用です。実ファイルの編集・実テスト・外部照会はしていません。\n\n## 受け入れ条件\n'+w.acceptance.map(x=>'- [ ] '+x).join('\n')};d.artifacts.push(ar);j.artifactId=ar.id;msg(w.conversationId,'assistant','インナーから結果が届きました。\n\nデモの成果です。実行成功を、そのまま仕事の完了にはしません。受け入れ条件を確認するか、同じ仕事へ追加依頼を返してください。',[{type:'artifact',id:ar.id,title:'実行結果を見る'}]);event('run.succeeded','実行が終了しました。受け入れ待ちです',w.id);notify();},900);return j;}
 window.EventSource=class {addEventListener(t,fn){if(t==='change')listeners.push(fn);if(t==='ready')setTimeout(fn,30);}close(){}};
 window.fetch=async function(path,options={}){
  let b={};try{b=options.body?JSON.parse(options.body):{};}catch{}let result;let m;
  const findWork=id=>{const w=d.works.find(w=>w.id===id);if(!w)throw Error('仕事が見つかりません');return w;};
  try{
   if(path==='/api/state'||path==='/api/export')result=d;
   else if(path==='/api/conversations'){result={id:uuid(),title:b.title||'新しい相談',workId:null,createdAt:now()};d.conversations.push(result);}
   else if(m=path.match(/^\/api\/conversations\/([^/]+)\/messages$/)){
    const c=d.conversations.find(c=>c.id===m[1]);msg(c.id,'user',b.text);const w=d.works.find(w=>w.id===c.workId);const j={id:uuid(),role:'outer',status:'running',conversationId:c.id,profileId:'demo',prompt:b.text,createdAt:now()};d.jobs.push(j);result=j;
    setTimeout(()=>{if(j.status==='canceled')return;
      if(w&&/調査|実行|進め|修正|差し戻|依頼/.test(b.text)){const a=approval(w,{instruction:b.text});msg(c.id,'assistant','インナーへの依頼を用意しました。内容を確認して承認すると実行します。',[{type:'approval',id:a.id,title:'依頼内容を確認'}]);}
      else if(!w&&/整理|レビュー|準備|設計|改善/.test(b.text)){const nw=work({title:b.text.length>32?b.text.slice(0,32)+'…':b.text,objective:b.text});msg(c.id,'assistant','目的と、勝手に変えない範囲を整理しました。\n\n仕事の下書きを作成しています。まだ何も実行していません。内容を確認してから、調査や実装を任せられます。',[{type:'work',id:nw.id,title:nw.title}]);}
      else if(/定期|監視|追って/.test(b.text)){const r={id:uuid(),title:'仕事の状況確認',instruction:b.text,workId:w?.id||null,conversationId:c.id,minutes:60,enabled:false,nextAt:new Date(Date.now()+3600000).toISOString()};d.routines.push(r);msg(c.id,'assistant','定期確認の案を作りました。画面プレビューでは有効化の操作まで試せます。',[{type:'routine',id:r.id,title:r.title}]);}
      else msg(c.id,'assistant','相談を記録しました。\n\nこのプレビューは操作の確認用です。自由な推論にはZIP版でClaude／Copilotを接続してください。仕事の下書き、承認、結果の受け入れは試せます。');
      j.status='succeeded';event('run.succeeded','相談を整理しました',w?.id);notify();},350);
   }
   else if(path==='/api/works')result=work(b);
   else if((m=path.match(/^\/api\/works\/([^/]+)$/))&&options.method==='PATCH'){const w=findWork(m[1]);if(w.revision!==b.revision)throw Error('版が変わりました');Object.assign(w,b,{revision:w.revision+1,status:'draft',updatedAt:now()});d.approvals.filter(a=>a.workId===w.id&&a.status==='pending').forEach(a=>a.status='superseded');d.conversations.find(c=>c.id===w.conversationId).title=w.title;result=w;}
   else if(m=path.match(/^\/api\/works\/([^/]+)\/dispatch$/)){result=approval(findWork(m[1]),b);}
   else if(m=path.match(/^\/api\/approvals\/([^/]+)\/decision$/)){const a=d.approvals.find(a=>a.id===m[1]);if(a.status!=='pending')throw Error('処理済みです');a.status=b.decision==='approve'?'approved':'rejected';if(a.status==='approved'){result=run(a);d.decisions.push({id:uuid(),workId:a.workId,kind:'execution_approval',actor:'human',at:now(),text:a.instruction});}else{findWork(a.workId).status='draft';result=a;}}
   else if(m=path.match(/^\/api\/works\/([^/]+)\/accept$/)){const w=findWork(m[1]);if(w.status!=='review'||b.checked.length!==w.acceptance.length)throw Error('受け入れ条件を確認してください');w.status='done';d.decisions.push({id:uuid(),workId:w.id,actor:'human',at:now(),text:b.note||'受け入れ確認',kind:'acceptance'});event('work.accepted','仕事を受け入れました',w.id);result=w;}
   else if(m=path.match(/^\/api\/works\/([^/]+)\/rotate-session$/)){d.sessions.filter(s=>s.ownerId===m[1]).forEach(s=>s.retired=true);result={ok:true};}
   else if(path==='/api/artifacts'){result={...b,id:uuid(),source:'human',createdAt:now()};d.artifacts.push(result);}
   else if(path==='/api/settings'){Object.assign(d.settings,b);result=d.settings;}
   else if(path==='/api/routines'){result={...b,id:uuid(),conversationId:'main',createdAt:now(),nextAt:new Date(Date.now()+b.minutes*60000).toISOString()};d.routines.push(result);}
   else if((m=path.match(/^\/api\/routines\/([^/]+)$/))&&options.method==='PATCH'){result=d.routines.find(r=>r.id===m[1]);Object.assign(result,b);}
   else if(m=path.match(/^\/api\/routines\/([^/]+)\/run$/)){const r=d.routines.find(r=>r.id===m[1]);msg(r.conversationId||'main','assistant','状況確認のデモです。未完了事項と判断待ちを確認しました。実際の定期起動はZIP版サーバーで行います。');event('routine.review','定期確認の操作を試しました',r.workId);result={ok:true};}
   else if(m=path.match(/^\/api\/runs\/([^/]+)\/cancel$/)){result=d.jobs.find(j=>j.id===m[1]);result.status='canceled';if(result.workId)findWork(result.workId).status='blocked';}
   else throw Error('この操作はZIP版で利用できます。');
   if(path!=='/api/state'&&path!=='/api/export')setTimeout(notify,30);
   return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  }catch(e){return new Response(JSON.stringify({error:e.message}),{status:400,headers:{'Content-Type':'application/json'}});}
 };
})();
