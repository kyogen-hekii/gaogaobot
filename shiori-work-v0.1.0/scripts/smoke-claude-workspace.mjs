import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig, ROOT } from '../src/config.mjs';
import { runCLI } from '../src/adapters.mjs';

// Test only file tools in a fresh, disposable directory. No shell or live source writes.
const configured=loadConfig().providers.find(p=>p.kind==='claude'&&p.enabled);
assert(configured,'Claude接続が必要です。');
const parent=resolve(ROOT,'.cache/claude-smoke');mkdirSync(parent,{recursive:true});
const cwd=mkdtempSync(resolve(parent,'workspace-'));
const profile={...configured,cwd,model:'sonnet',allowWrite:true,restricted:true,allowedTools:['Read','Glob','Grep','Edit','Write']};
const marker=`synthetic-${randomUUID()}`,file=resolve(cwd,'smoke.txt');
const binding={providerSessionId:randomUUID(),established:false};
const onSession=id=>{binding.providerSessionId=id;binding.established=true;};
console.log('Claude workspace smoke: isolated file tools only.');
const reply=await runCLI(profile,binding,'inner',`Synthetic connectivity test. Create exactly ${file} containing ${marker} and a newline, using Write. Read it back using Read and report the exact content. Do not inspect any other files or directories, use shell commands, or contact external services.`,{mode:'write',onSession,timeoutMs:90000});
assert(existsSync(file),`File was not created: ${reply.text}`);
assert.equal(readFileSync(file,'utf8').trim(),marker);
assert(reply.text.includes(marker),'Read-back response is missing the marker.');
assert.equal(reply.denials.length,0,'File tool permissions were denied.');
console.log('PASS: isolated file creation and read-back.');
