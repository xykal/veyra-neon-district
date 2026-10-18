import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { Client, clientFrame, waitFor } from './helpers.mjs';
const start = async (t, dataDir) => {
 const dir=dataDir || mkdtempSync(path.join(os.tmpdir(),'veyra-test-'));
 const app=createApp({dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port;
 t.after(async()=>{await app.close();if(!dataDir)rmSync(dir,{recursive:true,force:true});});return {...app,port,dir,url:`http://127.0.0.1:${port}`};
};
test('HTTP health/static routes, cache validation and secret-path denial',async t=>{
 const a=await start(t);assert.equal((await fetch(a.url+'/healthz')).status,200);
 const r=await fetch(a.url+'/main.js');assert.match(r.headers.get('content-type'),/javascript/);const etag=r.headers.get('etag');await r.text();assert.ok(etag);
 assert.equal((await fetch(a.url+'/main.js',{headers:{'If-None-Match':etag}})).status,304);
 for(const p of ['/.env','/server/index.js','/data/profiles.json','/uploads/env.txt','/no-such-file','/%00'])assert.ok((await fetch(a.url+p)).status>=400,p);
 assert.equal((await fetch(a.url+'/')).headers.get('x-content-type-options'),'nosniff');
});
test('WS welcomes, snapshots, chat broadcast, ping and leaderboard',async t=>{
 const a=await start(t),x=new Client(a.port),y=new Client(a.port);t.after(()=>{x.socket.destroy();y.socket.destroy();});
 const [wx,wy]=await Promise.all([x.hello('Alpha'),y.hello('Beta')]);assert.notEqual(wx.id,wy.id);assert.match(wx.r,/^[a-f0-9]{64}$/);
 await x.message(m=>m.t==='s'&&m.p.length===2);await new Promise(r=>setTimeout(r,370));x.send({t:'chat',m:'halo dua browser'});
 await Promise.all([x.message(m=>m.t==='chat'&&m.m==='halo dua browser'),y.message(m=>m.t==='chat'&&m.m==='halo dua browser')]);
 x.send({t:'ping',ts:123});assert.equal((await x.message(m=>m.t==='pong')).ts,123);x.send({t:'lb'});assert.equal((await x.message(m=>m.t==='lb')).rows.length,1);
});
test('wallet/statistics persist across restart; raw resume token is not stored server-side',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'veyra-resume-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const a=await start(t,dir),x=new Client(a.port),w=await x.hello('Saved');const p=a.game.players.get(w.id);p.money=4321;p.kills=4;p.stats.jobs=9;
 await x.close();await waitFor(()=>a.game.players.size===0);await a.close();
 const saved=readFileSync(path.join(dir,'profiles.json'),'utf8');assert.ok(!saved.includes(w.r));
 const b=await start(t,dir),y=new Client(b.port),v=await y.hello('SavedAgain',w.r);assert.equal(v.r,w.r);const q=b.game.players.get(v.id);assert.equal(q.money,4321);assert.equal(q.kills,4);assert.equal(q.stats.jobs,9);
 const board=await (await fetch(b.url+'/api/leaderboard')).json();assert.equal(board.rows.length,1);assert.equal(board.rows[0].online,true);assert.ok(!JSON.stringify(board).includes(w.r));await y.close();
});
test('same name is not an identity; only valid resume token restores wallet',async t=>{
 const a=await start(t),x=new Client(a.port),wx=await x.hello('Same');a.game.players.get(wx.id).money=1500;
 const y=new Client(a.port),wy=await y.hello('Same','a'.repeat(64));assert.equal(a.game.players.get(wy.id).money,0);assert.notEqual(wy.r,wx.r);await x.close();await y.close();
});
test('duplicate profile connection transfers session without losing progress',async t=>{
 const a=await start(t),x=new Client(a.port),wx=await x.hello('First');a.game.players.get(wx.id).money=987;
 const y=new Client(a.port),wy=await y.hello('Second',wx.r);await x.closed;assert.equal(x.code,4001);assert.equal(a.game.players.size,1);assert.equal(a.game.players.get(wy.id).money,987);await y.close();
});
test('stale input is released after 700ms without fresh controls',async t=>{const a=await start(t),x=new Client(a.port),w=await x.hello();x.send({t:'in',i:{mx:1}});await waitFor(()=>a.game.players.get(w.id).input.mx===1);await waitFor(()=>!a.game.players.get(w.id).input.mx,1500);await x.close();});
test('voice signalling is opt-in, target-only, rejects self and non-opted peers',async t=>{
 const a=await start(t),x=new Client(a.port),y=new Client(a.port);const [wx,wy]=await Promise.all([x.hello('VoiceA'),y.hello('VoiceB')]);
 x.send({t:'vsig',d:{k:'join'}});y.send({t:'vsig',d:{k:'join'}});await x.message(m=>m.t==='vpeers'&&m.ids.length===2);await y.message(m=>m.t==='vpeers'&&m.ids.length===2);
 x.send({t:'vsig',to:wy.id,d:{k:'offer',sdp:'test-sdp'}});const offer=await y.message(m=>m.t==='vsig'&&m.d.k==='offer');assert.equal(offer.from,wx.id);
 x.send({t:'vsig',d:{k:'talk',on:true}});assert.equal((await y.message(m=>m.t==='vsig'&&m.d.k==='talk')).d.on,true);
 y.send({t:'vsig',d:{k:'leave'}});await x.message(m=>m.t==='vpeers'&&m.ids.length===1);await x.close();await y.close();
});
test('cross-origin browser WS upgrade is rejected',async t=>{const a=await start(t),x=new Client(a.port,'https://evil.invalid');await assert.rejects(x.ready,/403/);await x.closed;});
test('unmasked WS frame rejected with protocol close',async t=>{const a=await start(t),x=new Client(a.port);await x.ready;x.socket.write(clientFrame('{}',{masked:false}));await x.closed;assert.equal(x.code,1002);});
test('fragmented valid text handled; interleaved ping does not corrupt JSON',async t=>{
 const a=await start(t),x=new Client(a.port);await x.ready;const s=JSON.stringify({t:'hello',n:'Fragments'});x.socket.write(clientFrame(s.slice(0,9),{fin:false}));x.socket.write(clientFrame('hi',{opcode:9}));x.socket.write(clientFrame(s.slice(9),{opcode:0}));assert.equal((await x.message(m=>m.t==='welcome')).name,'Fragments');await x.close();
});
test('oversized WS messages are bounded',async t=>{const a=await start(t),x=new Client(a.port);await x.ready;x.socket.write(clientFrame('x'.repeat(70000)));await x.closed;assert.equal(x.code,1009);});
test('input flooding is closed, not queued unboundedly',async t=>{const a=await start(t),x=new Client(a.port);await x.hello();const frame=clientFrame(JSON.stringify({t:'in',i:{mx:0}}));x.socket.write(Buffer.concat(Array(500).fill(frame)));await x.closed;assert.equal(x.code,1008);});

test('character/outfit is validated, replicated, saved and restored across a Node restart',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'veyra-look-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const a=await start(t,dir),x=new Client(a.port);await x.ready;
 const look=[3,4,3,2,2,7,1,4,1,2,1];x.send({t:'hello',n:'Styled',o:look});const welcome=await x.message(m=>m.t==='welcome');assert.deepEqual(welcome.o,look);
 const y=new Client(a.port);await y.hello('Observer');await y.message(m=>m.t==='s'&&m.p.some(p=>p.i===welcome.id&&p.o[0]===3));
 x.send({t:'look',o:[5,2,4,3,1,4,3,2,0,0,2]});await y.message(m=>m.t==='s'&&m.p.some(p=>p.i===welcome.id&&p.o[0]===5));
 await x.close();await y.close();await a.close();
 const b=await start(t,dir),z=new Client(b.port),again=await z.hello('StyledAgain',welcome.r);assert.equal(again.o[0],5);assert.equal(again.o[6],3);await z.close();
});
