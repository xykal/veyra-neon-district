// Dependency-free runtime bundle: no transpiler, network fetch or build-time secrets.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const name of ['server','shared','public','LICENSE','THIRD_PARTY_NOTICES.md'])cpSync(path.join(root,name),path.join(out,name),{recursive:true});
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
writeFileSync(path.join(out,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,private:true,type:'module',scripts:{start:'node server/index.js'},engines:pkg.engines,license:pkg.license},null,2)+'\n');
const entries=[];
function walk(d){for(const e of readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else entries.push(`${createHash('sha256').update(readFileSync(p)).digest('hex')}  ${path.relative(out,p).replaceAll('\\','/')}`);}}
walk(out);writeFileSync(path.join(out,'SHA256SUMS'),entries.join('\n')+'\n');
console.log(`${pkg.name} v${pkg.version}: ${entries.length} runtime files → dist/ (no npm runtime dependencies).`);
