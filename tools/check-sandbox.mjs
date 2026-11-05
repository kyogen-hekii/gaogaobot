import { readFileSync, readdirSync, statSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './dev.mjs';
const policy = JSON.parse(readFileSync(join(root, 'tools/sandbox-policy.json'), 'utf8'));
let failed = 0;
for (const path of policy.readonlyPaths) {
  try {
    if (statSync(path).isDirectory()) readdirSync(path);
    else { const fd = openSync(path, 'r'); closeSync(fd); }
    console.log(`READ OK ${path}`);
  } catch (error) { failed++; console.log(`READ FAILED ${path}: ${error.code}`); }
}
console.log(`${policy.readonlyPaths.length - failed}/${policy.readonlyPaths.length} read targets accessible in this process.`);
if (failed) console.log('These reads are blocked in this sandbox, even if listed in the saved or managed policy. If already reloaded, do not repeat reloads or setup: report the failed targets. Development readiness is checked separately by dev.cmd doctor.');
process.exitCode = failed ? 1 : 0;
