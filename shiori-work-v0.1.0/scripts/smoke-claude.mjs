import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { runCLI } from '../src/adapters.mjs';
import { parsePlan } from '../src/outer.mjs';

// Two tool-less requests using the existing CLI login. No user files in prompts.
// A short fixed marker verifies that the exact saved conversation is resumed.
const config=loadConfig();
const profile=config.providers.find(p=>p.id==='claude'&&p.enabled);
assert(profile,'先に npm run setup:claude を実行してください。');
const marker=`shiori-${randomUUID()}`;
const binding={providerSessionId:randomUUID(),established:false};
const options={timeoutMs:90000,onSession:id=>{binding.providerSessionId=id;binding.established=true;}};
console.log('Claude Outer: 接続と構造化応答を検査中…');
const first=await runCLI(profile,binding,'outer',`接続試験です。記憶するマーカーは ${marker} です。replyにこのマーカー、actionsに空配列を入れたJSONだけ返してください。ツールは使用しません。`,options);
assert(parsePlan(first.structured||first.text).reply.includes(marker),'構造化応答にマーカーがありません。');
assert(binding.established,'セッションIDが取得できませんでした。');
console.log('OK: 構造化応答とセッションID');
const second=await runCLI(profile,binding,'outer','前のメッセージで指定したマーカーをreplyに、空配列をactionsに入れたJSONだけ返してください。',options);
assert(parsePlan(second.structured||second.text).reply.includes(marker),'同じセッションを継続できませんでした。');
console.log('OK: 同一セッションの継続');
console.log('完了: 固定の疎通メッセージのみを使用。ローカル資料の送信・実作業の実行は検査対象外です。');
