import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
// Use the pinned project dependency, not an arbitrary editor/host CLI version.
export function findCodex({base=projectRoot,platform=process.platform,arch=process.arch,explicit=process.env.SHIORI_CODEX_COMMAND,exists=existsSync}={}) {
  if(explicit){
    if(!isAbsolute(explicit)||!exists(explicit))throw Error('SHIORI_CODEX_COMMAND must name an existing absolute executable path.');
    return explicit;
  }
  const cpu={x64:'x86_64',arm64:'aarch64'}[arch];
  const os={win32:'pc-windows-msvc',darwin:'apple-darwin',linux:'unknown-linux-musl'}[platform];
  if(!cpu||!os)throw Error(`未対応のCodex実行環境です: ${platform}/${arch}`);
  const command=resolve(base,'node_modules/@openai',`codex-${platform}-${arch}`,'vendor',`${cpu}-${os}`,'bin',platform==='win32'?'codex.exe':'codex');
  if(!exists(command))throw Error('Bot専用のCodex CLIがありません。アプリのディレクトリで ../dev.cmd npm ci --cache .cache/npm を実行してください。');
  return command;
}
export function probeCodex(command,args) {
  const result=spawnSync(command,args,{encoding:'utf8',timeout:15000,windowsHide:true,shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`Codex ${args.join(' ')} failed (exit ${result.status}).`);
  return `${result.stdout||''}${result.stderr||''}`.trim();
}
