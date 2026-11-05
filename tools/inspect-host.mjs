// Read-only host diagnostics. No arguments, writes, network, or subprocesses.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv.length !== 2) throw new Error('This diagnostic accepts no arguments.');
const base = 'C:/Users/me';
console.log(JSON.stringify({ node: process.version, executable: process.execPath }));
for (const [label, path] of [
  ['Node installations', `${base}/AppData/Local/mise/installs/node`],
  ['VS Code runtime', `${base}/AppData/Local/Programs/Microsoft VS Code`],
  ['Codex SDK', `${base}/AppData/Roaming/Code/agent-host/sdk-cache/codex/0.157.0/win32-x64/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/codex`],
]) {
  try { console.log(label, JSON.stringify(readdirSync(path))); }
  catch (e) { console.log(label, e.code); }
}
const install = `${base}/AppData/Local/Programs/Microsoft VS Code`;
for (const folder of readdirSync(install).filter(n => /^[0-9a-f]{10}$/.test(n))) {
  const app = join(install, folder, 'resources/app');
  try {
    console.log('VS Code package', app, JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).version);
    console.log('out files', readdirSync(join(app, 'out')).filter(n => /agent|host|main/i.test(n)));
    const bundle = readFileSync(join(app, 'out/vs/workbench/workbench.desktop.main.js'), 'utf8');
    const keys = [...new Set(bundle.match(/chat\.agentHost\.[A-Za-z0-9_.]+/g) || [])];
    console.log('Agent Host settings', keys.filter(k => /permission|shell|binaryArgs/i.test(k)));
    const permissionSymbol = bundle.match(/(\w+)="chat\.agentHost\.localFilePermissions"/)?.[1];
    if (permissionSymbol) {
      const idx = bundle.indexOf('*_readPersistedGrants');
      console.log('Permission implementation', bundle.slice(Math.max(0, idx - 11000), idx + 400));
    }
    console.log('Agent host source files', readdirSync(join(app, 'out'), { recursive: true }).filter(p => /agentHost.*\.js$/i.test(p)).slice(0, 30));
    for (const key of keys.filter(k => /sandbox|permission|environment|shell/i.test(k))) {
      const idx = bundle.indexOf(`"${key}":`);
      if (idx >= 0) console.log(bundle.slice(idx, idx + 1800));
    }
    break;
  } catch (e) { console.log('VS Code package', e.code); }
}
for (const path of [`${base}/AppData/Roaming/Code/User/settings.json`, `${base}/.codex/config.toml`]) {
  try {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    console.log(path);
    // Deliberately do not print arbitrary setting values or any auth configuration.
    for (const line of lines) {
      if (/^\s*"[^"\n]*(agentHost|sandbox|permissions|shellEnvironment)[^"\n]*"\s*:/.test(line)) console.log(line.replace(/:\s*.*$/, ': [configured]'));
      if (/^\s*(allow_login_shell|default_permissions|sandbox_mode|inherit|experimental_use_profile)\s*=/.test(line) || /^\[(shell_environment_policy|permissions)[^\]]*\]/.test(line)) console.log(line);
    }
  } catch (e) { console.log(path, e.code); }
}
