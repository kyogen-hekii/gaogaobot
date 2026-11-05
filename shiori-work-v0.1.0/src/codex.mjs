import { OUTER_SCHEMA } from './outer.mjs';
import { AppError } from './store.mjs';

// Codex strict structured output requires every property, with null for optional values.
function strictSchema(schema) {
  const result=structuredClone(schema);
  if(result.type==='object'){
    const required=new Set(result.required||[]);
    result.properties=Object.fromEntries(Object.entries(result.properties||{}).map(([key,value])=>[key,required.has(key)?strictSchema(value):{anyOf:[strictSchema(value),{type:'null'}]}]));
    result.required=Object.keys(result.properties);result.additionalProperties=false;
  }
  if(result.items)result.items=strictSchema(result.items);
  return result;
}
export const CODEX_OUTER_SCHEMA=strictSchema(OUTER_SCHEMA);
export function codexPlan(text) {
  const plan=JSON.parse(text);
  if(plan.review===null)delete plan.review;
  if(Array.isArray(plan.actions))for(const action of plan.actions){
    if(action&&typeof action==='object')for(const key of Object.keys(action)){
      if(key!=='type'&&Object.hasOwn(OUTER_SCHEMA.properties.actions.items.properties,key)&&action[key]===null)delete action[key];
    }
  }
  return plan;
}
export function codexArgs(profile,binding,role,mode) {
  if(role==='inner'&&mode==='write'&&!profile.allowWrite)throw new AppError('このCodex仕事場は読み取り専用です。',403,'WRITE_DENIED');
  if(binding.established&&!/^[A-Za-z0-9_-]{8,150}$/.test(binding.providerSessionId||''))throw new AppError('CodexセッションIDが不正です。');
  const permissions=role==='inner'&&mode==='write'?':workspace':':read-only';
  const args=['exec','--ignore-user-config','-c',`default_permissions="${permissions}"`,'-c','approval_policy="never"','-c','web_search="disabled"','--disable','plugins','--disable','apps'];
  // Without an explicit Windows sandbox, CLI 0.157 downgrades workspace-write to read-only.
  // Enable the native sandbox for this child only; never weaken or rewrite host settings.
  if(process.platform==='win32')args.push('-c','windows.sandbox="elevated"');
  if(role==='outer')args.push('--disable','shell_tool','--disable','unified_exec','-c','project_doc_max_bytes=0');
  if(profile.model)args.push('--model',profile.model);
  if(binding.established)args.push('resume');
  args.push('--json','--skip-git-repo-check');
  if(binding.established)args.push(binding.providerSessionId);
  args.push('-');
  return args;
}
export function codexEvent(e) {
  if(e.type==='thread.started')return {type:'session',sessionId:e.thread_id};
  if(e.type==='turn.completed')return {type:'result',usage:e.usage||{}};
  if(e.type==='turn.failed'||e.type==='error')return {type:'error',text:e.error?.message||e.message||'Codex turn failed'};
  if(e.type==='item.completed'&&e.item?.type==='agent_message')return {type:'text',text:e.item.text||''};
  if(e.type==='item.started'&&['command_execution','file_change','mcp_tool_call','web_search'].includes(e.item?.type))return {type:'progress',text:`Codex: ${e.item.type}`};
  // Never display reasoning, command text, tool arguments, or command output.
  return {type:'ignored'};
}
