import { startServer } from '../src/server.mjs';
import { loadCodexConfig } from './codex-config.mjs';
try{await startServer(loadCodexConfig());}catch(error){console.error(error.message);process.exitCode=1;}
