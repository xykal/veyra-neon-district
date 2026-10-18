// Expose only browser assets + shared simulation; never server files, saves or secrets.
import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RELEASE } from '../shared/version.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist/cloudflare-assets');
rmSync(out, { recursive:true, force:true });
mkdirSync(out, { recursive:true });
cpSync(path.join(root, 'public'), out, { recursive:true });
cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive:true });
const release=path.join(out,'r',RELEASE);
mkdirSync(release,{recursive:true});
cpSync(path.join(root,'public'),path.join(release,'public'),{recursive:true});
cpSync(path.join(root,'shared'),path.join(release,'shared'),{recursive:true});
writeFileSync(path.join(out, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: same-origin
  Cache-Control: public, max-age=3600, must-revalidate
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/2d/
  Cache-Control: no-cache
/2d/index.html
  Cache-Control: no-cache
`);
let count = 0;
const walk = d => { for (const e of readdirSync(d, { withFileTypes:true })) e.isDirectory() ? walk(path.join(d, e.name)) : count++; };
walk(out);
console.log(`Cloudflare assets: ${count} public files → dist/cloudflare-assets/`);
