import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from '../src/config.mjs';
import { runCLI } from '../src/adapters.mjs';
import { findCodex } from './codex-runtime.mjs';

// A fresh disposable workspace contains no existing user data. Leave the result for inspection.
const parent=resolve(ROOT,'.cache/codex-smoke');mkdirSync(parent,{recursive:true});
const cwd=mkdtempSync(resolve(parent,'workspace-'));
const profile={kind:'codex',command:findCodex(),model:process.env.SHIORI_CODEX_MODEL||undefined,cwd,allowWrite:true};
const binding={providerSessionId:randomUUID(),established:false};
const marker=`synthetic-${randomUUID()}`;
const onSession=sessionId=>{binding.providerSessionId=sessionId;binding.established=true;};
console.log('Codex workspace smoke: synthetic file only, isolated writable directory.');
const written=await runCLI(profile,binding,'inner',`Development test in an empty disposable directory. Use apply_patch to create exactly one file at ${resolve(cwd,'smoke.txt')} containing only ${marker} and a newline. Do not run commands, read other files, browse, or access any external service. Do not inspect parent directories. Report completion briefly. If the tool fails, include its exact error text in your final answer.`,{mode:'write',onSession,timeoutMs:90000});
assert.ok(existsSync(resolve(cwd,'smoke.txt')),`Synthetic file was not created: ${written.text}`);
assert.equal(readFileSync(resolve(cwd,'smoke.txt'),'utf8').trim(),marker);
assert.deepEqual(readdirSync(cwd).filter(name=>name!=='.codex'),['smoke.txt']);
console.log('PASS: workspace-write created the expected synthetic file.');
const thread=binding.providerSessionId;
const result=await runCLI(profile,binding,'inner','Continue the synthetic test without tools. Report the exact content you wrote in the previous turn. Do not read, edit or create any files.',{mode:'read',onSession,timeoutMs:90000});
assert.equal(binding.providerSessionId,thread);assert.ok(result.text.includes(marker));
console.log('PASS: worker resumed the same thread in read-only mode.');
