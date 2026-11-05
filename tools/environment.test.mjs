import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { environment, prepare, root, toolchain, command } from './dev.mjs';

test('normalizes duplicate environment keys and discards stale PATH entries', () => {
  const env = environment({ PATH: 'C:/stale/node18', Path: 'C:/other', SystemRoot: 'wrong', SYSTEMROOT: 'wrong2' });
  assert.equal(Object.keys(env).filter(k => k.toLowerCase() === 'path').length, 1);
  assert(!env.PATH.includes('node18'));
  assert.equal(env.PATH.split(';')[0], dirname(toolchain.node));
  assert.equal(env.SYSTEMROOT, toolchain.windows);
});

test('a child resolves pinned node with an empty inherited environment', () => {
  prepare();
  const result = spawnSync(toolchain.cmd, ['/d', '/c', 'node -p process.execPath'], { env: environment({}), windowsVerbatimArguments: true, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().toLowerCase(), toolchain.node.toLowerCase());
});

test('npm uses the pinned Node executable, not npm.cmd from inherited PATH', () => {
  const [exe, args] = command('npm', ['--version']);
  assert.equal(exe, toolchain.node);
  assert(args[0].endsWith('npm-cli.js'));
});

test('fresh profile-free PowerShell can enumerate environment and spawn Node', () => {
  const result = spawnSync(toolchain.powershell, ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; $null=Get-ChildItem Env:; node -p process.version"], {
    env: environment({ PATH: 'bad', Path: 'also bad' }), encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `v${toolchain.nodeVersion}`);
});

test('child failure exit status survives the command launcher', () => {
  const result = spawnSync(toolchain.node, [join(root, 'tools/dev.mjs'), 'node', '-e', 'process.exit(7)'], { env: environment({}), timeout: 10000 });
  assert.equal(result.status, 7);
});
