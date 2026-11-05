import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseJsonc, setTopLevel } from './jsonc.mjs';
import { root } from './dev.mjs';

export function mergePolicy(settings, requested) {
  const current = settings[requested.setting] ?? {};
  if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('Existing sandbox path setting is not an object');
  for (const key of ['readonlyPaths', 'readwritePaths', 'deniedPaths']) {
    if (current[key] !== undefined && (!Array.isArray(current[key]) || current[key].some(p => typeof p !== 'string'))) throw new Error(`Invalid existing ${key}`);
  }
  const canonical = p => p.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
  for (const requestedPath of requested.readonlyPaths) {
    if ((current.deniedPaths || []).some(deny => canonical(requestedPath) === canonical(deny) || canonical(requestedPath).startsWith(canonical(deny) + '/'))) {
      throw new Error(`Explicit deny covers requested read path: ${requestedPath}. Refusing to override.`);
    }
  }
  const paths = new Map((current.readonlyPaths || []).map(p => [canonical(p), p]));
  for (const p of requested.readonlyPaths) if (!paths.has(canonical(p))) paths.set(canonical(p), p);
  return { ...current, readonlyPaths: [...paths.values()] };
}

export function setup(apply = false) {
  const policy = JSON.parse(readFileSync(join(root, 'tools/sandbox-policy.json'), 'utf8'));
  const original = readFileSync(policy.settingsFile, 'utf8');
  const parsed = parseJsonc(original).value;
  const next = mergePolicy(parsed, policy);
  const updated = setTopLevel(original, policy.setting, next);
  parseJsonc(updated);
  console.log(JSON.stringify({ target: policy.settingsFile, setting: policy.setting, readonlyPaths: next.readonlyPaths, addedWritePaths: [], networkChanges: false }, null, 2));
  if (JSON.stringify(parsed[policy.setting]) === JSON.stringify(next)) { console.log('Already configured; no file changed.'); return; }
  if (!apply) { console.log('Preview only. Use --apply to install.'); return; }
  if (readFileSync(policy.settingsFile, 'utf8') !== original) throw new Error('Settings changed during setup; no write performed');
  const backup = policy.settingsFile + `.before-sandbox-${Date.now()}.bak`;
  copyFileSync(policy.settingsFile, backup);
  writeFileSync(policy.settingsFile, updated, 'utf8');
  const verified = parseJsonc(readFileSync(policy.settingsFile, 'utf8')).value;
  if (JSON.stringify(verified[policy.setting]) !== JSON.stringify(next)) throw new Error('Settings verification failed');
  console.log(`Installed. Backup: ${backup}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some(a => a !== '--apply')) throw new Error('Only --apply is supported');
    setup(process.argv.includes('--apply'));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
