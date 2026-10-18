import { RELEASE } from '../shared/version.js';
// Public deployment checks. No admin credentials, profile creation, or database mutation.
const raw = process.argv[2] || process.env.CLOUDFLARE_PUBLIC_URL;
if (!raw) throw new Error('Pass the deployed HTTPS base URL.');
const target = new URL(raw);
if (!['http:','https:'].includes(target.protocol)) throw new Error('Expected HTTP(S) URL.');
const base = target.origin, expected = process.env.EXPECTED_SHA || '';
let healthy = false;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const response = await fetch(base+'/healthz', { signal:AbortSignal.timeout(10000), cache:'no-store' });
    const value = await response.json();
    if (response.ok && value.ok && value.runtime === 'cloudflare-durable-objects' && (!expected || value.build === expected)) {
      healthy = true; console.log(`Cloudflare health OK; build ${value.build}; players ${value.players}; ${value.simulation}`); break;
    }
  } catch { /* DNS propagation / initial deploy / version rollout */ }
  await new Promise(r => setTimeout(r, 1500));
}
if (!healthy) throw new Error('Expected Cloudflare build did not become healthy.');
for (const route of ['/','/2d/','/main.js','/shared/game.js','/assets/cars/bus.glb','/api/leaderboard',`/r/${RELEASE}/public/main.js`,`/r/${RELEASE}/public/lobby.js`,`/r/${RELEASE}/shared/avatar.js`]) {
  const response = await fetch(base+route, { signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  await response.arrayBuffer();
  console.log(`HTTP ${response.status} ${route}`);
}
await new Promise((resolve, reject) => {
  const ws = new WebSocket(base.replace(/^http/,'ws')+'/');
  const timer = setTimeout(() => { try { ws.close(); } catch { /* disconnected */ } reject(new Error('Public WSS handshake timed out')); },15000);
  ws.onopen = () => ws.close(1000,'Connectivity check');
  ws.onclose = event => {
    clearTimeout(timer);
    if (event.code === 1000) { console.log('Public WSS upgrade + clean close OK (no profile created)'); resolve(); }
    else reject(new Error(`Public WSS closed with code ${event.code}`));
  };
  ws.onerror = () => { clearTimeout(timer); reject(new Error('Public WSS connection failed')); };
});
