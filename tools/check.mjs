// Syntax + release hygiene, no external linter dependency.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const ignored=new Set(['.git','node_modules','dist','data','.test-data','test-results','playwright-report']);
const files=[];
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){if(ignored.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push(p);}}
walk(root);
let errors=0;
const credential=new RegExp('(?:gh[pousr]'+'_[A-Za-z0-9]{20,}|github'+'_pat_[A-Za-z0-9_]{20,}|AK'+'IA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)');
for(const file of files){const rel=path.relative(root,file);if(/(?:^|\/)\.env(?:\.|$)/.test(rel)&&rel!=='.env.example'){console.error('Unexpected environment file:',rel);errors++;}
 if(/\.(?:js|mjs)$/.test(file)){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status){console.error(rel,r.stderr);errors++;}}
 if(/\.(?:js|mjs|json|md|ya?ml|txt|html|css)$/.test(file)&&credential.test(readFileSync(file,'utf8'))){console.error('Possible hardcoded credential in',rel);errors++;}}
for(const expected of ['LICENSE','THIRD_PARTY_NOTICES.md','Dockerfile','package-lock.json'])if(!existsSync(path.join(root,expected))){console.error('Missing',expected);errors++;}
console.log(`${files.length} files checked; ${errors} error(s).`);process.exitCode=errors?1:0;
