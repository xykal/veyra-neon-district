import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, sanitizeName, sanitizeChat } from '../shared/game.js';
import { buildMap, routeBetween, randomRoadPoint, mulberry32 } from '../shared/map.js';
import { stepCar, segmentHitsRect, resolveCarCollisions } from '../shared/physics.js';
import { CAR_TYPES } from '../shared/constants.js';
const empty = () => ({size:4800,cell:600,blockers:[],grid:{cellSize:600,cols:8,map:new Map()}});
const car = overrides => ({type:'sport',x:1800,y:1800,a:0,speed:0,vx:0,vy:0,steerAngle:0,hp:100,...overrides});

test('deterministic world; 22 accessible POIs and 18 vehicle classes',()=>{
  const a=buildMap(13),b=buildMap(13);assert.deepEqual(a,b);assert.notDeepEqual(a.buildings,buildMap(14).buildings);
  assert.equal(Object.keys(CAR_TYPES).length,18);assert.equal(a.pois.length,22);
  for(const p of a.pois)assert.ok(!a.blockers.some(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h));
});
test('GPS routes follow roads, no building/water intersections (all POI pairs)',()=>{
  const map=buildMap();
  for(const a of map.pois)for(const b of map.pois){const route=routeBetween(map,a,b);assert.ok(!route.unreachable);for(let i=1;i<route.points.length;i++){const p=route.points[i-1],q=route.points[i];assert.ok(!map.blockers.some(r=>segmentHitsRect(p.x,p.y,q.x,q.y,r)));}assert.ok(Number.isFinite(route.length));}
});
test('road spawns remain in playable bounds',()=>{const map=buildMap(),rnd=mulberry32(51);for(let i=0;i<1000;i++){const p=randomRoadPoint(map,rnd);assert.ok(p.x>=30&&p.x<=4770&&p.y>=30&&p.y<=4770);}});
test('physics finite, forward throttle, braking and wet grip',()=>{
  for(const type of Object.keys(CAR_TYPES)){const c=car({type});for(let k=0;k<120;k++)stepCar(c,{throttle:1},1/60,empty());assert.ok(c.speed>80,type);assert.ok(c.speed<=CAR_TYPES[type].maxSpeed);const before=c.speed;for(let k=0;k<30;k++)stepCar(c,{throttle:-1},1/60,empty());assert.ok(c.speed<before);assert.ok(Number.isFinite(c.x+c.y+c.a+c.vx+c.vy));}
});
test('handbrake produces more lateral slip than normal grip',()=>{
  const slip=handbrake=>{const c=car({speed:300,vx:300});for(let k=0;k<30;k++)stepCar(c,{throttle:1,steer:.65,handbrake},1/60,empty());return Math.abs(Math.sin(c.a)*c.vx-Math.cos(c.a)*c.vy);};assert.ok(slip(true)>slip(false)*1.2);
});
test('collision impulse changes vector velocity, not just cosmetic speed',()=>{
  const a=car({x:100,y:100,vx:240,speed:240}),b=car({x:120,y:100,vx:0,speed:0,parked:true});resolveCarCollisions([a,b]);assert.ok(a.vx<100);assert.ok(a.hp<100);assert.equal(a.speed,a.vx);
});
test('front-on building impact damages vehicle',()=>{const map=empty();map.blockers=[{x:1900,y:1750,w:50,h:100}];map.grid.map.set('3:2',[0]);map.grid.map.set('3:3',[0]);const c=car({x:1880,speed:400,vx:400});stepCar(c,{throttle:1},1/30,map);assert.ok(c.hp<100);});
test('enter/exit vehicle ownership; speed vectors stop on exit',()=>{const g=new Game(),p=g.addPlayer('Driver'),c=[...g.cars.values()].find(c=>c.parked);p.x=c.x;p.y=c.y;g.tryEnterCar(p);assert.equal(p.car,c.id);c.vx=123;c.vy=10;g.tryExitCar(p);assert.equal(p.car,null);assert.equal(c.driver,null);assert.equal(c.vx,0);});
test('a player cannot steal a currently occupied vehicle',()=>{const g=new Game(),a=g.addPlayer('A'),b=g.addPlayer('B'),c=[...g.cars.values()].find(c=>c.parked);a.x=b.x=c.x;a.y=b.y=c.y;g.tryEnterCar(a);g.tryEnterCar(b);assert.notEqual(b.car,a.car);});
test('pistol hits first victim; wall blocks the full victim-distance segment',()=>{
  const g=new Game(),a=g.addPlayer('A'),b=g.addPlayer('B');g.map=empty();a.x=100;a.y=100;b.x=250;b.y=100;
  g.map.blockers=[{x:160,y:50,w:25,h:100}];g.map.grid.map.set('0:0',[0]);g.pendingShots.push({id:a.id,a:0,sx:100,sy:100});g.processShots();assert.equal(b.health,100);assert.equal(a.wanted,0);
  g.map.blockers=[];g.map.grid.map.clear();g.pendingShots.push({id:a.id,a:0,sx:100,sy:100});g.processShots();assert.equal(b.health,66);assert.equal(a.wanted,1);
});
test('authoritative job rewards money and increments job statistics',()=>{const g=new Game(),p=g.addPlayer('Courier');const c=[...g.cars.values()].find(c=>c.parked);p.x=c.x;p.y=c.y;g.tryEnterCar(p);p.x=g.job.x;p.y=g.job.y;const reward=g.job.reward;g.stepJobs();assert.equal(p.money,reward);assert.equal(p.stats.jobs,1);});
test('invalid input is finite and clamped; chat/name lengths bounded',()=>{const g=new Game(),p=g.addPlayer('Input');g.handleMessage(p,JSON.stringify({t:'in',i:{mx:1e99,my:'bad',steer:'bad',throttle:-50}}));assert.equal(p.input.mx,1);assert.equal(p.input.my,0);assert.equal(p.input.steer,0);assert.equal(p.input.throttle,-1);assert.ok(sanitizeName('<b>test</b>').length<=16);assert.ok(sanitizeChat('x'.repeat(10000)).length<=200);});
test('interest snapshots include own vehicle, cull distant cars and pedestrians',()=>{const g=new Game(),p=g.addPlayer('Interest');p.x=10;p.y=10;const full=g.buildSnapshot(),near=g.buildSnapshot(p);assert.ok(near.c.length<full.c.length);assert.ok(near.n.length<=full.n.length);assert.ok(near.p.some(x=>x.i===p.id));assert.ok(!JSON.stringify(near).includes('profileKey'));});
test('leaderboard requests only emit server-owned statistics',()=>{const g=new Game(),p=g.addPlayer('Legit'),messages=[];g.io={sendRaw:(_id,s)=>messages.push(JSON.parse(s)),broadcastRaw:()=>{}};g.handleMessage(p,JSON.stringify({t:'lb',money:999999}));assert.equal(p.money,0);assert.equal(messages.at(-1).t,'lb');});
