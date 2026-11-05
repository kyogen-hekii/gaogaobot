import { readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { root } from './dev.mjs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const section = 'permissions.vscode-workspace.filesystem';
export function addCodexReads(source, paths) {
  const heading = `[${section}]`;
  const lines = source.split(/\r?\n/);
  const headers = lines.flatMap((line, index) => line.trim() === heading ? [index] : []);
  if (headers.length > 1) throw new Error('Duplicate Codex filesystem section');
  let start = headers[0];
  if (start === undefined) { lines.push('', heading); start = lines.length - 1; }
  let end = lines.findIndex((line, index) => index > start && /^\s*\[/.test(line));
  if (end < 0) end = lines.length;
  const additions = [];
  for (const path of paths) {
    const key = JSON.stringify(path);
    const existing = lines.slice(start + 1, end).find(l => l.trim().startsWith(key + ' ') || l.trim().startsWith(key + '='));
    if (existing) {
      if (!/=\s*["'](?:read|write)["']\s*(?:#.*)?$/.test(existing)) throw new Error(`Existing conflicting grant: ${path}`);
      continue;
    }
    additions.push(`${key} = "read"`);
  }
  if (!additions.length) return source;
  lines.splice(end, 0, ...additions);
  return lines.join(source.includes('\r\n') ? '\r\n' : '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some(x => x !== '--apply')) throw new Error('Only --apply is supported');
    const target = 'C:/Users/me/.codex/config.toml';
    const policy = JSON.parse(readFileSync(join(root, 'tools/sandbox-policy.json'), 'utf8'));
    const source = readFileSync(target, 'utf8');
    const next = addCodexReads(source, policy.readonlyPaths);
    console.log(JSON.stringify({ target, section, readonlyPaths: policy.readonlyPaths, writeOrNetworkChanges: false }, null, 2));
    if (source === next) console.log('Already configured.');
    else if (!process.argv.includes('--apply')) console.log('Preview only.');
    else {
      if (readFileSync(target, 'utf8') !== source) throw new Error('Config changed concurrently');
      const backup = target + `.before-read-grants-${Date.now()}.bak`;
      copyFileSync(target, backup);
      writeFileSync(target, next, 'utf8');
      if (readFileSync(target, 'utf8') !== next) throw new Error('Verification failed');
      console.log(`Installed. Backup: ${backup}`);
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
