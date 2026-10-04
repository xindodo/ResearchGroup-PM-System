import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'), children=[];
async function reachable(url){try{return (await fetch(url,{signal:AbortSignal.timeout(1000)})).ok}catch{return false}}
function start(command,args,cwd=root){const child=spawn(command,args,{cwd,stdio:'inherit',env:process.env});children.push(child);child.on('error',e=>{console.error(e.message);shutdown(1)});child.on('exit',code=>{if(code)shutdown(code)});return child}
function shutdown(code=0){for(const child of children)if(!child.killed)child.kill('SIGTERM');process.exitCode=code}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>shutdown());
if(!await reachable('http://127.0.0.1:5180/api/health'))start(process.execPath,['apps/backend/src/server.mjs']);
if(!await reachable('http://127.0.0.1:5178/'))start(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5178','--strictPort'],resolve(root,'apps/frontend'));
console.log('本地系统：http://localhost:5178/\n初次登录信息：.local/jtgc/initial-admin.txt\n已运行的服务将复用；不会清空数据库或重置密码。');
