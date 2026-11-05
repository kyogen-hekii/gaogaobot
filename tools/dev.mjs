import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const toolchain = JSON.parse(readFileSync(join(root, 'tools/toolchain.json'), 'utf8'));
for (const key of Object.keys(toolchain)) if (key !== 'nodeVersion') toolchain[key] = normalize(toolchain[key]);

// Windows environment keys are case-insensitive. Serialize exactly one spelling,
// including when the agent host passes both PATH and Path to the subprocess.
export function environment(source = process.env, workspace = root) {
  const env = {};
  for (const [key, value] of Object.entries(source)) if (value !== undefined) env[key.toUpperCase()] = value;
  const cache = join(workspace, '.cache');
  const dirs = [dirname(toolchain.node), dirname(toolchain.mise), dirname(toolchain.git), dirname(toolchain.rg),
    join(toolchain.windows, 'System32'), toolchain.windows, dirname(toolchain.powershell), join(toolchain.windows, 'System32/OpenSSH')];
  env.PATH = [...new Map(dirs.map(p => [p.toLowerCase(), p])).values()].join(';');
  env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
  env.COMSPEC = toolchain.cmd;
  env.SYSTEMROOT = toolchain.windows;
  env.WINDIR = toolchain.windows;
  env.USERPROFILE = toolchain.userProfile;
  env.HOMEDRIVE = toolchain.userProfile.slice(0, 2);
  env.HOMEPATH = toolchain.userProfile.slice(2).replaceAll('/', '\\');
  env.LOCALAPPDATA = join(toolchain.userProfile, 'AppData/Local');
  env.APPDATA = join(toolchain.userProfile, 'AppData/Roaming');
  env.TEMP = env.TMP = join(cache, 'tmp');
  env.MISE_DATA_DIR = toolchain.miseData;
  env.MISE_CACHE_DIR = join(cache, 'mise/cache');
  env.MISE_STATE_DIR = join(cache, 'mise/state');
  env.MISE_AUTO_INSTALL = '0';
  env.NPM_CONFIG_CACHE = join(cache, 'npm');
  return env;
}

export function prepare() {
  if (process.versions.node !== toolchain.nodeVersion) throw new Error(`Expected Node ${toolchain.nodeVersion}, got ${process.versions.node}. Use dev.cmd.`);
  for (const key of ['node', 'mise', 'git', 'rg', 'powershell', 'cmd']) {
    if (!existsSync(toolchain[key])) throw new Error(`Missing ${key}: ${toolchain[key]}. Update tools/toolchain.json; no automatic install is performed.`);
  }
  const env = environment();
  for (const key of ['TEMP', 'MISE_CACHE_DIR', 'MISE_STATE_DIR', 'NPM_CONFIG_CACHE']) mkdirSync(env[key], { recursive: true });
  return env;
}

export function command(name, args) {
  if (name === 'npm' || name === 'npx') return [toolchain.node, [join(dirname(toolchain.node), `node_modules/npm/bin/${name === 'npm' ? 'npm' : 'npx'}-cli.js`), ...args]];
  if (name === 'ps') return [toolchain.powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', ...args]];
  if (name === 'cmd') return [toolchain.cmd, ['/d', '/c', ...args]];
  if (['node', 'mise', 'git', 'rg'].includes(name)) return [toolchain[name], args];
  throw new Error('Use: dev.cmd doctor | test-env | node | npm | npx | mise | git | rg | ps | cmd [arguments]');
}

export function run(name, args, options = {}) {
  const [exe, argv] = command(name, args);
  return spawnSync(exe, argv, { env: prepare(), cwd: process.cwd(), shell: false, windowsHide: true, windowsVerbatimArguments: name === 'cmd', stdio: 'inherit', ...options });
}

export function doctor() {
  const env = prepare();
  const probes = [
    ['Node', 'node', ['-p', 'JSON.stringify({version:process.version,execPath:process.execPath})']],
    ['npm', 'npm', ['--version']],
    ['mise resolution', 'mise', ['which', 'node']],
    ['Git', 'git', ['--version']],
    ['ripgrep', 'rg', ['--version']],
    ['child PATH', 'cmd', ['node -p process.execPath']],
    ['PowerShell without profile', 'ps', ["$ErrorActionPreference='Stop'; (Get-Command node).Source; node --version; $null=Get-ChildItem Env:"]],
    ['SQLite', 'node', ['-e', "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync(':memory:'); console.log(d.prepare('select 1 as ok').get()); d.close();"]],
  ];
  let failed = false;
  for (const [label, name, args] of probes) {
    const result = run(name, args, { encoding: 'utf8', stdio: 'pipe', timeout: 15000, cwd: root });
    const resolvedNode = label !== 'child PATH' || normalize((result.stdout || '').trim()).toLowerCase() === toolchain.node.toLowerCase();
    const ok = !result.error && result.status === 0 && resolvedNode;
    failed ||= !ok;
    console.log(`${ok ? 'OK' : 'FAIL'} ${label}: ${(result.stdout || result.error?.message || '').trim()}`);
    if (result.stderr?.trim()) console.log(result.stderr.trim());
  }
  console.log(`Cache: ${env.NPM_CONFIG_CACHE}\nNode selection: ${toolchain.node}\nProfiles: disabled`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [name = 'doctor', ...args] = process.argv.slice(2);
    if (name === 'doctor') process.exitCode = doctor();
    else {
      const result = name === 'test-env' ? run('node', ['--test', join(root, 'tools/environment.test.mjs')]) : run(name, args);
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
