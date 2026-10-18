// Real workerd + SQLite + static-assets integration. No mocked Durable Object runtime.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client, clientFrame } from '../helpers.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let child, port, url, dir, logs = '';
const clients = new Set();
const delay = ms => new Promise(r => setTimeout(r, ms));
async function freePort() {
  const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const p = s.address().port; await new Promise(r => s.close(r)); return p;
}
async function start() {
  port = await freePort(); url = `http://127.0.0.1:${port}`; logs = '';
  child = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--persist-to',dir,'--show-interactive-dev-session=false'], {
    cwd:root, detached:true, stdio:['ignore','pipe','pipe'],
    env:{ ...process.env, WRANGLER_SEND_METRICS:'false', BROWSER:'none', NO_COLOR:'1' },
  });
  child.stdout.on('data', d => { logs = (logs+d).slice(-16000); });
  child.stderr.on('data', d => { logs = (logs+d).slice(-16000); });
  const until = Date.now()+45000;
  while (Date.now()<until) {
    if (child.exitCode !== null) throw new Error(`workerd exited: ${logs}`);
    try { const r = await fetch(url+'/healthz', { signal:AbortSignal.timeout(1000) }); if (r.ok) return; } catch { /* boot */ }
    await delay(150);
  }
  throw new Error('workerd startup timed out: '+logs);
}
async function stop() {
  for (const c of clients) c.socket.destroy(); clients.clear();
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
  const forced = setTimeout(() => { try { process.kill(-child.pid,'SIGKILL'); } catch { /* exited */ } }, 5000);
  await exited; clearTimeout(forced);
}
async function connect(t, name, token = '') {
  const c = new Client(port, url); clients.add(c);
  t.after(() => { c.socket.destroy(); clients.delete(c); });
  return { c, welcome:await c.hello(name, token) };
}
before(async () => {
  mkdirSync(path.join(root,'.test-data'), { recursive:true });
  dir = mkdtempSync(path.join(root,'.test-data/cf-'));
  await start();
});
after(async () => { await stop(); if (dir) rmSync(dir,{recursive:true,force:true}); });

test('Cloudflare HTTP: assets, Lite, health, cache, secret paths, request methods', async () => {
  const health = await (await fetch(url+'/healthz')).json();
  assert.equal(health.runtime, 'cloudflare-durable-objects'); assert.equal(health.simulation,'idle');
  for (const p of ['/','/2d/','/main.js','/shared/game.js','/assets/cars/bus.glb']) {
    const r = await fetch(url+p); assert.equal(r.status,200,p); await r.arrayBuffer();
    assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  }
  const js = await fetch(url+'/main.js'), etag = js.headers.get('etag'); await js.text();
  assert.ok(etag); assert.equal((await fetch(url+'/main.js',{headers:{'If-None-Match':etag}})).status,304);
  for (const p of ['/.env','/.dev.vars','/server/index.js','/cloudflare/index.js','/data/profiles.json','/uploads/env.txt','/no-such-file']) assert.equal((await fetch(url+p)).status,404,p);
  assert.equal((await fetch(url+'/api/leaderboard',{method:'POST'})).status,405);
  assert.equal((await fetch(url+'/healthz',{method:'HEAD'})).status,200);
});

test('Cloudflare multiplayer: same city, snapshots, chat, movement, stale input and ping', async t => {
  const a = await connect(t,'Alpha'), b = await connect(t,'Beta');
  assert.notEqual(a.welcome.id,b.welcome.id);
  await a.c.message(m => m.t==='s' && m.p.length===2); await b.c.message(m => m.t==='s' && m.p.length===2);
  a.c.send({t:'chat',m:'real workerd multiplayer'});
  await b.c.message(m => m.t==='chat' && m.m==='real workerd multiplayer');
  a.c.send({t:'ping',ts:123}); assert.equal((await a.c.message(m=>m.t==='pong')).ts,123);
  a.c.send({t:'in',i:{mx:1,my:.5}}); await delay(1100);
  const board = await (await fetch(url+'/api/leaderboard')).json();
  assert.ok(board.rows.find(r=>r.name==='Alpha').dist>0);
  const health = await (await fetch(url+'/healthz')).json(); assert.equal(health.players,2); assert.equal(health.simulation,'active');
  await a.c.close(); await b.c.close();
  const idle = await (await fetch(url+'/healthz')).json(); assert.equal(idle.players,0); assert.equal(idle.simulation,'idle');
});

test('Cloudflare identity: duplicate handoff closes old client; nickname is not an account', async t => {
  const a = await connect(t,'Original'), b = await connect(t,'Resumed',a.welcome.r);
  await a.c.closed; assert.equal(a.c.code,4001); assert.equal(a.welcome.r,b.welcome.r);
  const c = await connect(t,'Resumed'); assert.notEqual(c.welcome.r,b.welcome.r);
  assert.equal((await (await fetch(url+'/healthz')).json()).players,2);
  await b.c.close(); await c.c.close();
});

test('Cloudflare signalling: opt-in roster and target-only SDP; never self-signal', async t => {
  const a = await connect(t,'VoiceA'), b = await connect(t,'VoiceB'), outsider = await connect(t,'NoMic');
  a.c.send({t:'vsig',d:{k:'join'}}); b.c.send({t:'vsig',d:{k:'join'}});
  await a.c.message(m=>m.t==='vpeers'&&m.ids.length===2);
  a.c.send({t:'vsig',to:b.welcome.id,d:{k:'offer',sdp:'test-sdp'}});
  assert.equal((await b.c.message(m=>m.t==='vsig'&&m.d.k==='offer')).from,a.welcome.id);
  assert.ok(!outsider.c.messages.some(m=>m.t==='vsig'&&m.d.k==='offer'));
  const n = a.c.messages.length;
  a.c.send({t:'vsig',to:a.welcome.id,d:{k:'answer',sdp:'self'}});
  await delay(75); assert.ok(!a.c.messages.slice(n).some(m=>m.t==='vsig'&&m.d.k==='answer'));
  await Promise.all([a.c.close(),b.c.close(),outsider.c.close()]);
});

test('Cloudflare security: rejects cross-origin upgrade', async () => {
  const c = new Client(port,'https://unrelated.example');
  try { await assert.rejects(c.ready,/403/); } finally { c.socket.destroy(); }
});

test('Cloudflare native socket: 64KiB application limit and text-only messages', async t => {
  const a = await connect(t,'Oversize');
  a.c.socket.write(clientFrame('x'.repeat(65537))); await a.c.closed; assert.equal(a.c.code,1009);
  const b = await connect(t,'Binary');
  b.c.socket.write(clientFrame('binary',{opcode:2})); await b.c.closed; assert.equal(b.c.code,1003);
});

test('Cloudflare flood is disconnected, not queued into simulation', async t => {
  const { c } = await connect(t,'Flood');
  c.socket.write(Buffer.concat(Array.from({length:400},()=>clientFrame('{"t":"in","i":{"mx":1}}'))));
  await c.closed; assert.equal(c.code,1008);
});

test('Cloudflare SQL persists a real moving player across workerd restart', async t => {
  const a = await connect(t,'Durable');
  a.c.send({t:'in',i:{mx:.5,my:1}}); await delay(1100);
  await a.c.close();
  const saved = (await (await fetch(url+'/api/leaderboard')).json()).rows.find(r=>r.name==='Durable');
  assert.ok(saved.dist>0); assert.equal(saved.online,false);
  await stop(); await start();
  const b = await connect(t,'DurableAgain',a.welcome.r);
  assert.equal(b.welcome.r,a.welcome.r);
  const resumed = (await (await fetch(url+'/api/leaderboard')).json()).rows.find(r=>r.name==='DurableAgain');
  assert.ok(resumed.dist>=saved.dist); assert.equal(resumed.online,true);
  const board = await (await fetch(url+'/api/leaderboard')).json();
  assert.ok(!JSON.stringify(board).includes(a.welcome.r));
  await b.c.close();
});
