import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server.mjs';
const app=createApplication({dir:mkdtempSync(join(tmpdir(),'jtgc-project-browser-')),password:'project-browser-password-123'});
app.server.listen(5182,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0)});
