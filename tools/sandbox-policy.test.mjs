import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonc, setTopLevel } from './jsonc.mjs';
import { mergePolicy } from './setup-sandbox.mjs';
import { addCodexReads } from './setup-codex-reads.mjs';

test('adds one setting preserving comments, strings, BOM and trailing commas', () => {
  for (const input of ['\ufeff{\n// hello\n"url":"https://example.test/",\n}', '{"x":1 // last comment\n}', '{/* empty */}', '{"x": {"nested": [1,2,],},}']) {
    const updated = setTopLevel(input, 'sandbox', { readonlyPaths: ['C:/tools'] });
    assert.deepEqual(JSON.parse(JSON.stringify(parseJsonc(updated).value)), { ...JSON.parse(JSON.stringify(parseJsonc(input).value)), sandbox: { readonlyPaths: ['C:/tools'] } });
    if (input.includes('// hello')) assert(updated.includes('// hello'));
    if (input.includes('// last comment')) assert(updated.includes('// last comment'));
  }
});

test('updates one key without rewriting unrelated settings', () => {
  const input = '{"other": [1,  2], /* keep */ "sandbox": {"old":true}}';
  const updated = setTopLevel(input, 'sandbox', { readonlyPaths: ['C:/tools'] });
  assert(updated.startsWith('{"other": [1,  2], /* keep */ "sandbox": '));
  assert.deepEqual(parseJsonc(updated).value.sandbox.readonlyPaths, ['C:/tools']);
});

test('read grants are idempotent and preserve existing write/deny rules', () => {
  const requested = { setting: 'sandbox', readonlyPaths: ['C:/tools', 'C:/node'] };
  const existing = { sandbox: { readonlyPaths: ['c:\\TOOLS'], readwritePaths: ['C:/workspace'], deniedPaths: ['C:/private'] } };
  const next = mergePolicy(existing, requested);
  assert.deepEqual(next.readonlyPaths, ['c:\\TOOLS', 'C:/node']);
  assert.deepEqual(next.readwritePaths, existing.sandbox.readwritePaths);
  assert.deepEqual(next.deniedPaths, existing.sandbox.deniedPaths);
  assert.deepEqual(mergePolicy({ sandbox: next }, requested), next);
});

test('explicit deny and malformed/duplicate settings fail before any write', () => {
  assert.throws(() => mergePolicy({ sandbox: { deniedPaths: ['C:/tools'] } }, { setting: 'sandbox', readonlyPaths: ['C:/tools/node'] }), /deny/);
  assert.throws(() => parseJsonc('{"a":1,"a":2}'), /Duplicate/);
  assert.throws(() => parseJsonc('{"a":}'), /Invalid/);
});

test('Codex supplemental read grants preserve settings and are idempotent', () => {
  const source = '# keep\r\n[features]\r\nexample = true\r\n';
  const next = addCodexReads(source, ['C:/tools']);
  assert(next.startsWith(source));
  assert(next.includes('"C:/tools" = "read"'));
  assert.equal(addCodexReads(next, ['C:/tools']), next);
  assert.throws(() => addCodexReads('[permissions.vscode-workspace.filesystem]\n"C:/tools" = "deny"', ['C:/tools']), /conflicting/);
});
