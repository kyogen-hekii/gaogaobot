import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ROOT } from '../src/config.mjs';
import { cliSpec } from '../src/adapters.mjs';

function config(commandArgs) {
  return loadConfig(ROOT, {
    ignoreLocalConfig: true,
    outerProvider: 'demo',
    providers: [{ id: 'cli', kind: 'claude', enabled: false, cwd: ROOT, command: process.execPath, commandArgs },
      { id: 'demo', kind: 'demo', enabled: true, cwd: ROOT }],
    runners: [],
  });
}

test('launcher arguments remain separate argv entries before provider flags', () => {
  const commandArgs = ['C:/path with spaces/cli.mjs', 'literal & argument'];
  const p = config(commandArgs).providers[0];
  const spec = cliSpec(p, { providerSessionId: 'session' }, 'inner', 'prompt');
  assert.equal(spec.command, process.execPath);
  assert.deepEqual(spec.args.slice(0, 3), [...commandArgs, '-p']);
  assert.deepEqual(p.commandArgs, commandArgs);
});

test('changing launcher arguments changes the approval profile fingerprint', () => {
  assert.notEqual(config(['one.mjs']).providers[0].fingerprint, config(['two.mjs']).providers[0].fingerprint);
});

test('launcher arguments must be an array of strings', () => {
  for (const value of ['cli.mjs', null, [1]]) assert.throws(() => config(value), /commandArgs/);
});
