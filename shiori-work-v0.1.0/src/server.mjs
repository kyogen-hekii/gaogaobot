import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Store, AppError, assert, text } from './store.mjs';
import { loadConfig, ROOT } from './config.mjs';
import { Engine } from './engine.mjs';
import { loadModelOptions } from './models.mjs';
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
function readJSON(req){return new Promise((resolve,reject)=>{let chunks=[],n=0;req.on('data',b=>{n+=b.length;if(n>400000){reject(new AppError('リクエストが大きすぎます。',413));req.destroy();}else chunks.push(b);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString()||'{}'));}catch{reject(new AppError('JSONが不正です。'));}});req.on('error',reject);});}
export function createApp(config,options={}) {
  const store=options.store||new Store(resolve(config.dataDir,'shiori.sqlite'));
  const engine=new Engine(store,config,options);
  const csrf=randomBytes(32).toString('hex');const clients=new Set();
  const server=createServer(async(req,res)=>{
    const security={
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'
    };for(const [k,v] of Object.entries(security))res.setHeader(k,v);
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      const host=req.headers.host||'';assert(/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host),'Hostが許可されていません。',403,'HOST');
      const origin=`http://${host}`;const url=new URL(req.url,origin);const path=url.pathname;
      if(req.headers.origin)assert(req.headers.origin===origin,'別オリジンからの操作は許可されていません。',403,'ORIGIN');
      if(req.headers['sec-fetch-site'])assert(req.headers['sec-fetch-site']!=='cross-site','クロスサイト要求を拒否しました。',403,'ORIGIN');
      if(req.method==='GET') {
        if(path==='/api/state'){json(200,{...engine.snapshot(),csrf});return;}
        if(path==='/api/events'){
          res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write('event: ready\ndata: {}\n\n');clients.add(res);
          const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});return;
        }
        if(path==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="shiori-work-export.json"');json(200,engine.snapshot());return;}
        const allowed=new Map([['/','index.html'],['/index.html','index.html'],['/app.mjs','app.mjs'],['/delegation-ui.mjs','delegation-ui.mjs'],['/delegation.css','delegation.css'],['/style.css','style.css'],['/avatar.png','avatar.png'],['/favicon.svg','favicon.svg']]);
        assert(allowed.has(path),'ページがありません。',404);
        const file=resolve(ROOT,'web',allowed.get(path));const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
        res.writeHead(200,{'Content-Type':types[extname(file)]});res.end(readFileSync(file));return;
      }
      assert(['POST','PATCH'].includes(req.method),'未対応のメソッドです。',405);
      assert(req.headers['content-type']?.startsWith('application/json'),'JSONで送信してください。',415);
      const webhook=path==='/api/hooks/events';
      if(webhook)assert(process.env.SHIORI_EVENT_TOKEN&&equal(req.headers.authorization,`Bearer ${process.env.SHIORI_EVENT_TOKEN}`),'イベント用トークンが必要です。',401);
      else assert(equal(req.headers['x-shiori-csrf'],csrf),'ページを再読み込みしてください。',403,'CSRF');
      const body=await readJSON(req);let result;
      let match;
      if(path==='/api/conversations')result=engine.newConversation(body.title||'新しい相談');
      else if((match=path.match(/^\/api\/conversations\/([^/]+)\/messages$/))) {
        const key=text(req.headers['idempotency-key'],'操作ID',150);result=engine.send(match[1],body,key);
      }
      else if(path==='/api/works')result=store.transaction(()=>engine.createWork(body));
      else if((match=path.match(/^\/api\/works\/([^/]+)$/))&&req.method==='PATCH')result=engine.editWork(match[1],body);
      else if((match=path.match(/^\/api\/works\/([^/]+)\/dispatch$/)))result=store.transaction(()=>engine.requestDispatch(match[1],body));
      else if((match=path.match(/^\/api\/works\/([^/]+)\/delegate$/)))result=engine.delegate(match[1],body);
      else if((match=path.match(/^\/api\/works\/([^/]+)\/stop-delegation$/)))result=engine.stopDelegation(match[1]);
      else if((match=path.match(/^\/api\/works\/([^/]+)\/accept$/)))result=store.transaction(()=>engine.acceptWork(match[1],body));
      else if((match=path.match(/^\/api\/works\/([^/]+)\/rotate-session$/)))result=engine.rotateSession(match[1]);
      else if((match=path.match(/^\/api\/approvals\/([^/]+)\/decision$/)))result=engine.decideApproval(match[1],body);
      else if((match=path.match(/^\/api\/runs\/([^/]+)\/cancel$/)))result=engine.cancel(match[1]);
      else if((match=path.match(/^\/api\/runs\/([^/]+)\/reconcile$/)))result=engine.reconcile(match[1],body);
      else if(path==='/api/artifacts')result=engine.addArtifact(body,'human');
      else if(path==='/api/routines')result=engine.addRoutine(body);
      else if((match=path.match(/^\/api\/routines\/([^/]+)$/))&&req.method==='PATCH')result=engine.updateRoutine(match[1],body);
      else if((match=path.match(/^\/api\/routines\/([^/]+)\/run$/)))result=engine.runRoutine(match[1]);
      else if(path==='/api/settings')result=engine.setSettings(body);
      else if(webhook)result=engine.reviewEvent(body);
      else throw new AppError('APIがありません。',404);
      engine.changed();json(200,result);
    }catch(e){if(!res.headersSent)json(e.status||500,{error:e.message,code:e.code||'ERROR'});else res.end();}
  });
  let changeTimer;
  engine.on('change',()=>{if(changeTimer)return;changeTimer=setTimeout(()=>{changeTimer=null;for(const res of clients){try{res.write('event: change\ndata: {}\n\n');}catch{clients.delete(res);}}},70);});
  const tick=setInterval(()=>engine.tick().catch(e=>console.error('Scheduler:',e.message)),1000);tick.unref();
  return {server,engine,store,csrf,close:async()=>{clearInterval(tick);clearTimeout(changeTimer);for(const c of clients)c.end();await engine.shutdown();await new Promise(r=>server.close(r));store.close();}};
}
export async function startServer(config=loadConfig()){
  loadModelOptions(config);
  if(process.env.PORT)config.port=Number(process.env.PORT);
  mkdirSync(config.dataDir,{recursive:true,mode:0o700});const lock=resolve(config.dataDir,'server.lock');
  if(existsSync(lock)) {const pid=Number(readFileSync(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch(e){if(e.code==='EPERM')alive=true;}assert(!alive,'同じデータを使うサーバーが起動しています。');unlinkSync(lock);}
  writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});
  const app=createApp(config);let closing=false;
  const close=async()=>{if(closing)return;closing=true;await app.close();try{unlinkSync(lock);}catch{}process.exit(0);};
  app.server.on('error',e=>{console.error(e.message);try{unlinkSync(lock);}catch{}process.exit(1);});
  app.server.listen(config.port,'127.0.0.1',()=>{const selected=app.store.meta('settings').outerProvider;const provider=config.providers.find(p=>p.id===selected);console.log(`\nしおり Work v0.2.0\nhttp://127.0.0.1:${app.server.address().port}\n判断エンジン: ${provider?.label||selected}${provider?.kind==='demo'?'（模擬応答・外部通信なし）':'（実AI接続）'}\n`);void app.engine.pump();});
  process.on('SIGINT',close);process.on('SIGTERM',close);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)startServer().catch(e=>{console.error(e.message);process.exitCode=1;});
