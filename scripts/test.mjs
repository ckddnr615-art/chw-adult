import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).sort().map(n=>path.join(root,'tests',n));
const result=spawnSync(process.execPath,['--test','--test-isolation=none',...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
