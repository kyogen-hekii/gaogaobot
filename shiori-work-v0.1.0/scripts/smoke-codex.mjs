import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from '../src/config.mjs';
import { runCLI } from '../src/adapters.mjs';
import { parsePlan } from '../src/outer.mjs';
import { findCodex } from './codex-runtime.mjs';

// Only synthetic text is sent to the model. No project files or auth files are read.
// The outer adapter disables shell tools and project instruction discovery.
const cwd=resolve(ROOT,'.cache/codex-smoke');mkdirSync(cwd,{recursive:true});
const requestedModel=process.argv.find(a=>a.startsWith('--model='))?.slice('--model='.length);
const profile={kind:'codex',command:findCodex(),model:requestedModel||process.env.SHIORI_CODEX_MODEL||undefined,cwd};
const binding={providerSessionId:randomUUID(),established:false};
const marker=`SHIORI_${randomUUID()}`;
const onSession=sessionId=>{binding.providerSessionId=sessionId;binding.established=true;};
console.log('Codex smoke: fixed synthetic conversation, read-only sandbox, shell disabled.');
const first=await runCLI(profile,binding,'outer',`This is a synthetic development connectivity test. Do not use tools or inspect files. Remember this marker: ${marker}. Reply with JSON, reply containing the marker, actions an empty array, review null.`,{onSession,timeoutMs:90000});
assert.ok(parsePlan(first.structured).reply.includes(marker));assert.ok(binding.established);
const thread=binding.providerSessionId;
console.log('PASS: initial structured response and thread ID');
const second=await runCLI(profile,binding,'outer','Continue the synthetic test. Do not use tools or inspect files. Return the marker from the previous message in reply, actions an empty array, review null.',{onSession,timeoutMs:90000});
assert.equal(binding.providerSessionId,thread);assert.ok(parsePlan(second.structured).reply.includes(marker));
console.log('PASS: exact thread resume and previous-message recall');
const worker={providerSessionId:randomUUID(),established:false};
const workerProfile={...profile,commandArgs:['-c','project_doc_max_bytes=0']};
const reply=await runCLI(workerProfile,worker,'inner','Synthetic development test. Do not use tools or read any files. Calculate 19 + 23 and reply with WORKER_OK: 42.',{mode:'read',timeoutMs:90000});
assert.ok(reply.text.includes('WORKER_OK: 42'));
console.log('PASS: read-only worker produced an actual model response.');
