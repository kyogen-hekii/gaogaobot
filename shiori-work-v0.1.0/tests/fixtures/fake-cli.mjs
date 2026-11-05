#!/usr/bin/env node
const args=process.argv.slice(2);let prompt='';for await (const b of process.stdin)prompt+=b;
const copilot=args.includes('--output-format=json');
const after=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
const sid=args.find(a=>a.startsWith('--session-id=')||a.startsWith('--resume='))?.split('=')[1]||after('--session-id')||after('--resume')||'550e8400-e29b-41d4-a716-446655440000';
const output=o=>console.log(JSON.stringify(o));
if(prompt==='stall'){setInterval(()=>{},1000);}
else if(prompt==='invalid'){console.log('broken-json');}
else if(prompt==='failure'){output({type:'result',is_error:true,result:'Authentication failed',session_id:sid});process.exitCode=1;}
else if(copilot){output({type:'session.start',data:{sessionId:sid}});output({type:'assistant.message',data:{content:'Copilot fixture reply'}});output({type:'session.idle'});}
else {output({type:'system',subtype:'init',session_id:sid});output({type:'assistant',message:{content:[{type:'thinking',thinking:'must not display'},{type:'text',text:'Fixture reply'}]}});output({type:'result',result:'Fixture reply',session_id:sid,usage:{input_tokens:1}});}
