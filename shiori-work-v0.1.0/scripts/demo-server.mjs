import { loadConfig, ROOT } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';
const config=loadConfig(ROOT,{ignoreLocalConfig:true,port:4318});
const app=createApp(config,{store:new Store(':memory:'),demoDelay:250});
let closing=false;
async function close(){if(closing)return;closing=true;await app.close();}
process.on('SIGINT',close);process.on('SIGTERM',close);
app.server.on('error',async error=>{console.error(error.message);await close();process.exitCode=1;});
app.server.listen(config.port,'127.0.0.1',()=>console.log('しおり デモ: http://127.0.0.1:4318 (メモリ内、実AI・外部通信なし)'));
