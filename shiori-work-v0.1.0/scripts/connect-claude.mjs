import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, loadConfig } from '../src/config.mjs';

// Only checks the existing CLI; never installs software or reads auth files.
const home=process.env.USERPROFILE || process.env.HOME;
const names=process.platform==='win32'?['claude.exe']:['claude'];
const candidates=[...names.map(n=>resolve(home,'.local/bin',n)),...(process.env.PATH||'').split(delimiter).flatMap(p=>names.map(n=>resolve(p,n)))];
const command=candidates.find(p=>existsSync(p));
if(!command)throw new Error('Claude Codeの実行ファイルが見つかりません。既存のCLIを設定してください。');
const run=args=>{
  const result=spawnSync(command,args,{cwd:ROOT,encoding:'utf8',windowsHide:true,shell:false,timeout:15000});
  if(result.error||result.status!==0)throw new Error(`Claude Code ${args.join(' ')} の検査に失敗しました (${result.error?.code||result.status})。`);
  return result.stdout;
};
const help=run(['--help']);
for(const flag of ['--safe-mode','--restricted','--json-schema','--session-id','--resume','--permission-mode','--strict-mcp-config'])if(!help.includes(flag))throw new Error(`必要なオプションがありません: ${flag}`);
const auth=JSON.parse(run(['auth','status']));
if(!auth.loggedIn)throw new Error('Claude Codeにログインしてください。この処理は認証情報を変更しません。');
console.log(`CLI: ${command}\n認証: ログイン済み (${auth.authMethod||'unknown'})`);
const file=resolve(ROOT,'config.local.json');
const raw=existsSync(file)?readFileSync(file,'utf8'):null;
const config=raw?JSON.parse(raw):JSON.parse(readFileSync(resolve(ROOT,'config.example.json'),'utf8'));
config.outerProvider='claude';
const provider={id:'claude',label:'Claude Code',kind:'claude',enabled:true,cwd:'workspaces/outer',command};
config.providers=[...(config.providers||[]).filter(p=>p.id!=='claude'),provider];
const runners=[
  {id:'claude-read',label:'Claude / このプロジェクトを調査',description:'このプロジェクトの読取りと調査。ファイル変更は許可しません。',kind:'claude',enabled:true,cwd:ROOT,command,allowWrite:false,allowedTools:['Read','Glob','Grep'],restricted:true},
  {id:'claude-edit',label:'Claude / このプロジェクトを編集',description:'このプロジェクト内の読取りとファイル編集。シェル・公開・外部送信は許可しません。',kind:'claude',enabled:true,cwd:ROOT,command,allowWrite:true,allowedTools:['Read','Glob','Grep','Edit','Write'],restricted:true},
];
for(const runner of runners)if(!(config.runners||[]).some(r=>r.id===runner.id))config.runners=[...(config.runners||[]),runner];
for(const runner of config.runners)if(['claude-read','claude-edit'].includes(runner.id))runner.restricted=true;
loadConfig(ROOT,{...structuredClone(config),ignoreLocalConfig:true});
if(process.argv.includes('--apply')){
  const output=JSON.stringify(config,null,2)+'\n';
  if(raw!==output){
    if(raw!==null){if(readFileSync(file,'utf8')!==raw)throw Error('設定が同時更新されました。');copyFileSync(file,file+`.before-claude-${Date.now()}.bak`,1);}
    writeFileSync(file,output);
  }
  console.log('config.local.json: Claude Outerと読取り・編集用の仕事場を保存しました。');
}else console.log('設定の保存には npm run setup:claude を使用してください。');
