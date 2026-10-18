import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { Character } from '../public/char3d.js';
import { Game } from '../shared/game.js';
import { PLAYER_RADIUS,CAR_TYPES } from '../shared/constants.js';
import { stepPlayer,stepCar,carBody,overlapBoxes,circleCar,circleFree,resolveActors } from '../shared/physics.js';
import { findVehicle,vehicleDoors } from '../shared/interactions.js';
import { constrainCamera } from '../shared/camera.js';
import { AVATAR_MODELS,DEFAULT_APPEARANCE,packAppearance,sanitizeAppearance } from '../shared/avatar.js';
const map=(rects=[])=>({size:4800,cell:600,blockers:rects,buildings:[],water:[],spawns:[{x:2400,y:2400}],grid:{cellSize:4800,cols:1,map:new Map([['0:0',rects.map((_,i)=>i)]])}});
const car=(extra={})=>({id:1,type:'sedan',x:400,y:400,a:0,vx:0,vy:0,speed:0,steerAngle:0,parked:true,hp:100,...extra});

test('appearance: six bodies, bounded enums, compact round-trip and no arbitrary asset paths',()=>{
  assert.equal(AVATAR_MODELS.length,6);
  const input={...DEFAULT_APPEARANCE,model:5,top:4,bottom:3,accessory:3};assert.deepEqual(sanitizeAppearance(packAppearance(input)),input);
  for(const invalid of [null,[],{},'invalid',{model:999,skin:-2,top:NaN,bottom:'2',url:'https://attacker.example/model.glb'}]){
    const clean=sanitizeAppearance(invalid);assert.deepEqual(Object.keys(clean),Object.keys(DEFAULT_APPEARANCE));assert.ok(clean.model>=0&&clean.model<6);assert.ok(!('url'in clean));
  }
});

test('skinned citizen faces +X; quarter-turns never invert camera/character heading',()=>{
  const scene=new THREE.Scene(),c=new Character(scene);
  try{
    assert.ok(c.mesh.isSkinnedMesh);assert.equal(c.bones.length,15);assert.ok(c.mesh.geometry.attributes.skinWeight);
    for(const a of[0,Math.PI/2,Math.PI,-Math.PI/2]){
      c.update(1/60,{x:100,y:200,facing:a,speed:0});
      const front=new THREE.Vector3(1,0,0).transformDirection(c.root.matrixWorld);
      assert.ok(front.dot(new THREE.Vector3(Math.cos(a),0,Math.sin(a)))>.999);
    }
  }finally{c.dispose();}
});

test('aim: pistol muzzle points forwards, not backwards; idle holsters the pistol',()=>{
  const scene=new THREE.Scene(),c=new Character(scene,{hair:3,top:2,bottom:1});
  try{
    for(let i=0;i<60;i++)c.update(1/60,{x:0,y:0,facing:Math.PI/2,speed:0,aim:true});
    const gun=c.gun.getWorldPosition(new THREE.Vector3()),muzzle=c.muzzleWorld();
    assert.ok(muzzle.sub(gun).normalize().dot(new THREE.Vector3(0,0,1))>.98);assert.ok(c.gun.visible);
    for(let i=0;i<60;i++)c.update(1/60,{x:0,y:0,facing:0,speed:0,aim:false});
    assert.equal(c.gun.visible,false);assert.equal(c.motion,'idle');
    assert.ok(c.legL.ankle.getWorldPosition(new THREE.Vector3()).y>.65);
  }finally{c.dispose();}
});

test('all six modular bodies build valid finite skinned geometry and walk/sprint/seat poses',()=>{
  const scene=new THREE.Scene();
  for(let model=0;model<6;model++){
    const c=new Character(scene,{model,top:model%5,bottom:model%4,hair:model%8,accessory:model%4});
    for(let i=0;i<45;i++)c.update(1/60,{x:5,y:5,facing:.7,moveAngle:.7,speed:62});
    assert.equal(c.motion,'sprint');
    for(const b of c.bones)assert.ok(b.matrixWorld.elements.every(Number.isFinite));
    c.update(1/60,{x:5,y:5,facing:0,speed:0,seated:true});assert.equal(c.motion,'seated');assert.equal(c.gun.visible,false);c.dispose();
  }
});

test('swept player capsule cannot cross a thin wall in one long sprint frame',()=>{
  const m=map([{x:110,y:50,w:1,h:120}]),p={x:100,y:100,a:0,vx:1000,vy:0};
  stepPlayer(p,{mx:1,sprint:true},.1,m);assert.ok(p.x<=110-PLAYER_RADIUS+.01);assert.ok(p.vx<.01);
});

test('full bus front, not just its centre circle, stops at a wall at speed',()=>{
  const m=map([{x:1042,y:300,w:1,h:200}]),c=car({type:'bus',x:995,y:400,vx:350,speed:350,parked:false});
  stepCar(c,{throttle:1},.1,m);assert.ok(c.x+CAR_TYPES.bus.len/2<=1042+.02);assert.ok(c.hp<100);assert.ok(c.vx<1);
});

test('oriented vehicle corner remains outside walls through turning/substeps',()=>{
  const wall={x:480,y:300,w:10,h:300},m=map([wall]),c=car({x:435,y:400,a:.4,vx:400,vy:80,speed:400,parked:false});
  for(let i=0;i<60;i++){stepCar(c,{throttle:1,steer:.7},1/60,m);assert.equal(overlapBoxes(carBody(c),{x:485,y:450,a:0,hx:5,hy:150}),null);}
});

test('walking player cannot pass through a parked car',()=>{
  const m=map(),c=car(),p={x:350,y:400,a:0,vx:0,vy:0};
  for(let i=0;i<240;i++)stepPlayer(p,{mx:1,sprint:true},1/60,m,[c]);
  assert.ok(p.x<=c.x-CAR_TYPES.sedan.len/2-PLAYER_RADIUS+.02);assert.equal(circleCar(p.x,p.y,PLAYER_RADIUS-.01,c),null);
});

test('near moving traffic no longer blocks entering an eligible parked vehicle',()=>{
  const m=map(),p={x:400,y:385},moving=car({id:1,speed:100,vx:100,parked:false}),parked=car({id:2,x:418,y:410});
  const candidate=findVehicle(p,[moving,parked],m);assert.equal(candidate.id,2);assert.equal(candidate.allowed,true);
});

test('vehicle interaction cannot reach through a building wall',()=>{
  const m=map([{x:104,y:60,w:2,h:80}]),p={x:85,y:100},c=car({x:130,y:100});
  const candidate=findVehicle(p,[c],m);assert.equal(candidate.allowed,false);assert.match(candidate.reason,/terhalang/);
});

test('exit selects clear door; fully blocked doors keep driver seated',()=>{
  const g=new Game();g.map=map([{x:350,y:360,w:100,h:27}]);g.cars.clear();const c=g.addCar({type:'sedan',x:400,y:400,a:0,parked:true}),p=g.addPlayer('Exit');
  p.car=c.id;c.driver=p.id;assert.equal(g.tryExitCar(p),true);assert.ok(p.y>400);assert.ok(circleFree(p.x,p.y,PLAYER_RADIUS,g.map,g.cars.values()));
  g.map=map([{x:350,y:360,w:100,h:27},{x:350,y:413,w:100,h:37}]);p.car=c.id;c.driver=p.id;p.x=c.x;p.y=c.y;
  assert.equal(g.tryExitCar(p),false);assert.equal(p.car,c.id);
});

test('spawn offers a genuinely reachable car without intersecting its physical body',()=>{
  for(const seed of[13,99,20251018]){
    const g=new Game({seed});
    for(let i=0;i<12;i++){const p=g.addPlayer('Spawn'+i);assert.ok(circleFree(p.x,p.y,PLAYER_RADIUS,g.map,g.cars.values()));assert.equal(findVehicle(p,g.cars.values(),g.map)?.allowed,true);}
  }
});

test('capsule actors have personal space instead of walking through each other',()=>{
  const a={x:100,y:100},b={x:102,y:100};resolveActors([a,b],map());assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=2*PLAYER_RADIUS-.01);
});

test('camera sphere pulls in before a wall, but does not collide above a short roof',()=>{
  const wall={x:50,y:50,w:5,h:100,top:200},m=map([wall]);
  const hit=constrainCamera(m,{x:100,y:10,z:100},{x:10,y:30,z:100});assert.ok(hit.x>57);assert.ok(hit.fraction<.82);
  wall.top=8;assert.equal(constrainCamera(m,{x:100,y:20,z:100},{x:10,y:30,z:100}).fraction,1);
});

test('fixed-step locomotion is independent of 30/60/120 Hz client frame rates',()=>{
  const simulate=hz=>{const g=new Game({seed:3});g.map=map();g.cars.clear();g.peds.clear();g.aiTarget=0;const p=g.addPlayer('Tick');p.x=p.y=2000;p.vx=p.vy=0;p.input={mx:1,my:.4,sprint:true};for(let i=0;i<hz*2;i++)g.tick(1/hz);return{x:p.x,y:p.y};};
  const a=simulate(30),b=simulate(60),c=simulate(120);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.001);assert.ok(Math.hypot(a.x-c.x,a.y-c.y)<.001);
});

test('prediction moves immediately and replays only commands newer than the server acknowledgement',async()=>{
 const {Prediction}=await import('../public/prediction.js');const p=new Prediction(),m=map(),me={i:1,x:200,y:200,a:0,vx:0,vy:0,v:0,q:0};
 let acknowledged,expected;
 for(let q=1;q<=5;q++){const v=p.advance(me,null,{mx:1,my:0},1/30,q,m,[]);if(q===3)acknowledged={...v,q:3,i:1,v:0};if(q===5)expected={...p.body};}
 assert.ok(p.body.x>me.x);p.reconcile(acknowledged,null,m,[]);
 assert.ok(Math.abs(p.body.x-expected.x)<.0001);assert.ok(p.history.every(c=>c.q>3));
});
