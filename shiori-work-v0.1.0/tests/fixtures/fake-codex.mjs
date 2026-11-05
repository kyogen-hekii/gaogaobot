import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const args=process.argv.slice(2);
let input='';for await(const chunk of process.stdin)input+=chunk;
const emit=event=>console.log(JSON.stringify(event));
const thread='0199a213-81c0-7800-8aa1-bbab2a035a53';
assert.equal(args[0],'exec');assert.equal(args.at(-1),'-');
if(args.includes('resume'))assert.equal(args.at(-2),thread);
emit({type:'thread.started',thread_id:thread});
emit({type:'turn.started'});
if(input==='stall'){setInterval(()=>{},1000);}
else if(input==='invalid')console.log('not JSON');
else if(input==='failure')emit({type:'turn.failed',error:{message:'test authentication failure'}});
else if(input==='exit'){emit({type:'item.completed',item:{type:'agent_message',text:'must not succeed'}});process.exitCode=1;}
else{
  emit({type:'item.completed',item:{type:'reasoning',text:'private reasoning must not display'}});
  emit({type:'item.started',item:{type:'command_execution',command:'secret command'}});
  let text=args.includes('resume')?'continued fixture reply':'fixture reply';
  if(args.includes('--output-schema')){
    const schema=JSON.parse(readFileSync(args[args.indexOf('--output-schema')+1],'utf8'));
    assert.deepEqual(schema.required,['reply','actions','review']);
    text=JSON.stringify({reply:text,actions:[],review:null});
  }
  if(input==='bad-plan')text='not a plan';
  if(input!=='empty')emit({type:'item.completed',item:{type:'agent_message',text}});
  if(input!=='incomplete')emit({type:'turn.completed',usage:{input_tokens:12,output_tokens:7}});
}
