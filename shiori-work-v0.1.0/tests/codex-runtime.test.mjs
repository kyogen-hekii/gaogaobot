import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { findCodex } from '../scripts/codex-runtime.mjs';

test('Codex discovery selects the pinned project CLI even when host binaries exist',()=>{
  const checked=[];
  const command=findCodex({base:resolve('.cache/runtime-test'),platform:'win32',arch:'x64',explicit:'',exists:path=>{checked.push(path);return true;}});
  assert.match(command.replaceAll('\\','/'),/node_modules\/@openai\/codex-win32-x64\/vendor\/x86_64-pc-windows-msvc\/bin\/codex\.exe$/);
  assert.deepEqual(checked,[command]);
});
test('missing pinned CLI fails instead of silently choosing an old editor binary',()=>{
  let checked=0;
  assert.throws(()=>findCodex({explicit:'',exists:()=>{checked++;return false;}}),/npm ci/);
  assert.equal(checked,1);
});
test('explicit CLI override must be an existing absolute executable path',()=>{
  const command=resolve('.cache/custom-codex.exe');
  assert.equal(findCodex({explicit:command,exists:()=>true}),command);
  assert.throws(()=>findCodex({explicit:'relative/codex',exists:()=>true}),/absolute/);
  assert.throws(()=>findCodex({explicit:command,exists:()=>false}),/existing/);
});
