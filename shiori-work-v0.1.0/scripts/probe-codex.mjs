import { findCodex, probeCodex } from './codex-runtime.mjs';
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
const command=findCodex();
console.log(`Executable: ${command}`);
console.log(`Runtime binaries: ${readdirSync(dirname(command)).filter(name=>name.endsWith('.exe')).join(', ')}`);
console.log(probeCodex(command,['--version']));
for(const args of [['exec','--help'],['exec','resume','--help']]){
  const help=probeCodex(command,args);
  const missing=['--json','--ignore-user-config','--output-schema'].filter(flag=>!help.includes(flag));
  if(missing.length)throw Error(`${args.join(' ')}: missing ${missing.join(', ')}`);
  console.log(`${args.slice(0,-1).join(' ')}: required flags available`);
  if(process.argv.includes('--verbose'))console.log(help);
}
// login status is intentionally not printed: it may include account identifiers.
try{probeCodex(command,['login','status']);console.log('Codex login: available');}
catch{console.log('Codex login: unavailable');process.exitCode=1;}
