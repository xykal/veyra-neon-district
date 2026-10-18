// Entitas 3D: mobil (model Kenney GLB) & pemain (procedural + animasi jalan).
import * as THREE from './vendor/three.module.js';
import { ColorPool, ShapePool } from './world3d.js';
import { CharacterManager, SKIN_TONES, SHIRT_COLORS, PANTS_COLORS, HAIR_COLORS, SHOE_COLORS } from './char3d.js';
import { CAR_TYPES } from '../shared/constants.js';
import { avatarPalette } from '../shared/avatar.js';

const UP = new THREE.Vector3(0, 1, 0);
const RENDER_DIST = 520; // mobil di luar ini nggak dirender (hemat draw call)

/** Peta tipe mobil di server -> file model Kenney + skala. */
/**
 * Peta model -> file .glb (Kenney Car Kit, CC0).
 * len  = panjang model di ruang model (dipakai buat scaling ke fisika 2D)
 * rot  = rotasi Y kalau modelnya menghadap sumbu Z (banyak model baru)
 * spin = sumbu putaran roda di ruang model: 'z' (model lama) atau 'x' (model baru)
 */
const MODEL_MAP = {
  bus:       { file:'bus.glb', len:4.56 },
  sedan:     { file: 'sedan.glb',        len: 2.55 },
  sport:     { file: 'sport.glb',        len: 2.55 },
  truck:     { file: 'pickup.glb',       len: 2.95 },
  taxi:      { file: 'taxi.glb',         len: 2.75, rot: Math.PI / 2, spin: 'x' },
  police:    { file: 'police.glb',       len: 3.10 },
  tractor:   { file: 'tractor.glb',      len: 2.20 },
  van:       { file: 'van.glb',          len: 2.75 },
  ambulance: { file: 'ambulance.glb',    len: 3.25, rot: Math.PI / 2, spin: 'x' },
  firetruck: { file: 'firetruck.glb',    len: 3.40, rot: Math.PI / 2, spin: 'x' },
  garbage:   { file: 'garbage-truck.glb',len: 3.45, rot: Math.PI / 2, spin: 'x' },
  delivery:  { file: 'delivery.glb',     len: 3.25, rot: Math.PI / 2, spin: 'x' },
  suv:       { file: 'suv.glb',          len: 2.55, rot: Math.PI / 2, spin: 'x' },
  luxury:    { file: 'suv-luxury.glb',   len: 2.85, rot: Math.PI / 2, spin: 'x' },
  supercar:  { file: 'race.glb',         len: 2.56, rot: Math.PI / 2, spin: 'x' },
  kart:      { file: 'kart-ooli.glb',    len: 1.43, rot: Math.PI / 2, spin: 'x' },
  shovel:    { file: 'tractor-shovel.glb', len: 2.47, rot: Math.PI / 2, spin: 'x' },
};

/** Warna cat per tipe kendaraan (biar nggak semua model sama). */
const PAINT = {
  bus: 0x258f97,
  sedan: 0x2f6fd0,
  sport: 0xf1c40f,
  truck: 0x6f7d8c,
  taxi: 0xf39c12,
  police: 0xeef2f7,
  tractor: 0x7cb342,
  van: 0x8e9aaf,
  ambulance: 0xeef4f8,
  firetruck: 0xc0392b,
  garbage: 0x5d8a3a,
  delivery: 0xf5f0e1,
  suv: 0x2c3e50,
  luxury: 0x1b2631,
  supercar: 0xff2e63,
  kart: 0x16a085,
  shovel: 0xe67e22,
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function hexToInt(h) {
  if (typeof h !== 'string') return null;
  const v = parseInt(h.replace('#', ''), 16);
  return Number.isFinite(v) ? v : null;
}

export class Entities {
  constructor(scene) {
    this.scene = scene;
    this.templates = {};   // kind -> {scene, scale, wheels:[{node,steers}], lightbar}
    this.carObjs = new Map(); // carId -> Object3D

    // --- mobil procedural (fallback + motor) ---
    this.carBody = new ColorPool(scene, new THREE.BoxGeometry(1, 1, 1), 80);
    this.carCabin = new ShapePool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x141a22 }), 200);
    this.carStripe = new ShapePool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }), 120);
    const wheelGeo = new THREE.CylinderGeometry(4.6, 4.6, 3.2, 10);
    wheelGeo.rotateX(Math.PI / 2);
    this.carWheel = new ShapePool(scene, wheelGeo, new THREE.MeshLambertMaterial({ color: 0x15171b }), 900);
    this.carLamp = new ShapePool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), 400);
    this.carTail = new ShapePool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 400);

    // --- motor (procedural) ---
    this.bikeParts = new ShapePool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xcc3333 }), 120);
    this.bikeDark = new ShapePool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x1a1d22 }), 200);
    const bikeWheel = new THREE.CylinderGeometry(8, 8, 3, 12);
    bikeWheel.rotateX(Math.PI / 2);
    this.bikeWheel = new ShapePool(scene, bikeWheel, new THREE.MeshLambertMaterial({ color: 0x15171b }), 80);
    this.bikeLamp = new ShapePool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), 40);

    // --- pemain (rig humanoid + animasi) ---
    this.chars = new CharacterManager(scene);
    this.lastPos = new Map();
    this.carState = new Map(); // mobil: kecepatan/arah sebelumnya (untuk suspensi)
    this.daylight = 1;   // 1 = siang, 0 = malam ( buat lampu headlights)
  }

  /** Muat model mobil Kenney (CC0). Kalau gagal, fallback ke box prosedural. */
  async loadModels(onProgress) {
    const {GLTFLoader}=await import('./vendor/GLTFLoader.js');
    const loader=new GLTFLoader(),kinds=Object.keys(MODEL_MAP);let done=0;
    await Promise.all(kinds.map(async kind=>{
      try {
        const def=MODEL_MAP[kind],T=CAR_TYPES[kind],gltf=await loader.loadAsync(`/assets/cars/${def.file}`);
        const root=new THREE.Group(),fit=new THREE.Group(),model=gltf.scene;
        model.rotation.y=def.rot||0;fit.add(model);root.add(fit);root.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
        model.position.x-=center.x;model.position.z-=center.z;model.position.y-=box.min.y;
        const scale=T.len/Math.max(.01,size.x);
        fit.scale.set(scale,scale,T.wid/Math.max(.01,size.z));root.updateMatrixWorld(true);
        const wheelInfo=[],lamps={};let wheelRadius=0;
        root.traverse(o=>{
          if(/^wheel-/.test(o.name)){wheelInfo.push({name:o.name,steers:/front/.test(o.name)});const wb=new THREE.Box3().setFromObject(o);wheelRadius=Math.max(wheelRadius,(wb.max.y-wb.min.y)/2);}
          if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
          const materials=Array.isArray(o.material)?o.material:[o.material];
          for(const material of materials){
            if(material.name==='paint'&&PAINT[kind]!==undefined)material.color.setHex(PAINT[kind]);
            if(/window|glass/.test(material.name)){material.transparent=true;material.opacity=.42;material.depthWrite=false;}
            if(['head','tail','lens-left','lens-right'].includes(material.name))lamps[{'lens-left':'lensL','lens-right':'lensR'}[material.name]||material.name]=material;
          }
        });
        const bounds=new THREE.Box3().setFromObject(root),height=bounds.max.y;
        const lamp=(x,z,color)=>{const material=new THREE.MeshStandardMaterial({color:0x333333,emissive:color,emissiveIntensity:.3});const mesh=new THREE.Mesh(new THREE.BoxGeometry(.35,1.25,Math.max(1.4,T.wid*.13)),material);mesh.position.set(x,Math.min(height*.55,9),z);root.add(mesh);return material;};
        if(!lamps.head){lamps.head=lamp(T.len/2-.22,T.wid*.33,0xffe4ad);lamps.head2=lamp(T.len/2-.22,-T.wid*.33,0xffe4ad);}
        if(!lamps.tail){lamps.tail=lamp(-T.len/2+.22,T.wid*.33,0xff3322);lamps.tail2=lamp(-T.len/2+.22,-T.wid*.33,0xff3322);}
        this.templates[kind]={root,scale,wheelInfo,lamps,height,radius:wheelRadius||4,spin:def.spin||'z',dimensions:{length:T.len,width:T.wid,height}};
      }catch(error){console.warn('Model fallback:',kind,error.message);}
      done++;onProgress?.(done,kinds.length);
    }));
    return Object.keys(this.templates).length===kinds.length;
  }

  getTemplate(kind) {
    return this.templates[kind] || null;
  }

  /**
   * @param {Array} players snapshot
   * @param {Array} cars snapshot
   * @param {number} myId
   * @param {number} localFacing sudut (atan2 dz,dx) untuk pemain lokal
   * @param {THREE.Vector3} camPos posisi kamera (untuk culling)
   * @param {number} dt
   */
  update(players, cars, myId, localFacing, camPos, dt, localAim, peds, localAiming=false) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();

    this.carBody.begin();
    this.carCabin.begin();
    this.carStripe.begin();
    this.carWheel.begin();
    this.carLamp.begin();
    this.carTail.begin();
    this.bikeParts.begin();
    this.bikeDark.begin();
    this.bikeWheel.begin();
    this.bikeLamp.begin();

    const seen = new Set();

    for (const c of cars) {
      const T = CAR_TYPES[c.y2] || CAR_TYPES.sedan;
      const tpl = this.getTemplate(c.y2);

      // distance culling
      let visible = true;
      if (camPos) {
        const dx = c.x - camPos.x;
        const dz = c.y - camPos.z;
        const radius = this.quality?.radius || RENDER_DIST;
        visible = dx * dx + dz * dz < radius * radius;
      }

      if(c.d===myId)visible=true;
      if (tpl && !visible) {
        if (this.carObjs.has(c.i)) { seen.add(c.i); this.carObjs.get(c.i).group.visible = false; }
        continue;
      }
      if (tpl) {
        seen.add(c.i);
        let rec = this.carObjs.get(c.i);
        if (!rec) {
          const obj = tpl.root.clone(true);
          // peta node roda template -> node roda clone (urutan sama)
          const byName = new Map();
          obj.traverse((o) => { if (o.name) byName.set(o.name, o); });
          const wheels = tpl.wheelInfo
            .map((w) => ({ node: byName.get(w.name), steers: w.steers, base:byName.get(w.name)?.quaternion.clone(), spin:0 }))
            .filter((w) => w.node);
          obj.userData.wheels = wheels;
          obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          // group pembungkus: dipakai buat suspensi (roll/pitch) tanpa ruining yaw
          const group = new THREE.Group();
          group.add(obj);
          this.scene.add(group);
          rec = { group, obj, wheels };
          this.carObjs.set(c.i, rec);
        }
        const obj = rec.obj;
        rec.group.visible = visible;
        rec.group.position.set(c.x, 0, c.y);
        rec.group.rotation.y=-c.a;
        obj.rotation.y=0;

        // ---- suspensi: badan miring (roll) & jongkok/n lifted (pitch) ----
        const st = this.carState.get(c.i) || { a: c.a, s: 0 };
        const turn = ((c.a - st.a + Math.PI) % (Math.PI * 2)) - Math.PI;
        const turnRate = turn / Math.max(dt, 0.001);
        const accel = (c.s - st.s) / Math.max(dt, 0.001);
        this.carState.set(c.i, { a: c.a, s: c.s });
        const rollT = clamp(turnRate * 0.05, -0.13, 0.13);
        const pitchT = clamp(accel * 0.0013, -0.085, 0.085);
        const k = Math.min(1, dt * 9);
        obj.rotation.x += (rollT - obj.rotation.x) * k;
        obj.rotation.z += (pitchT - obj.rotation.z) * k;

        // putaran roda + setir
        const steer=-(c.st??clamp(turnRate,-1,1))*.45;
        for(const w of rec.wheels){
          w.spin-=(c.s*dt)/Math.max(1,tpl.radius);
          w.node.quaternion.copy(w.base);
          const spin=new THREE.Quaternion().setFromAxisAngle(tpl.spin==='x'?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1),w.spin);
          w.node.quaternion.multiply(spin);
          if(w.steers)w.node.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(UP,steer));
        }
        // lampu depan nyala buat mobil biasa (malam hari)
        if (tpl.lamps.head) {
          const on = this.daylight < 0.55 ? 2.4 : 0.2;
          tpl.lamps.head.emissive.setHex(0xffe9a8);
          tpl.lamps.head.emissiveIntensity = on;
          if (tpl.lamps.head2) {
            tpl.lamps.head2.emissive.setHex(0xffe9a8);
            tpl.lamps.head2.emissiveIntensity = on;
          }
        }
        if (tpl.lamps.tail) {
          tpl.lamps.tail.emissive.setHex(0xff2a1a);
          tpl.lamps.tail.emissiveIntensity = 0.9;
          if (tpl.lamps.tail2) {
            tpl.lamps.tail2.emissive.setHex(0xff2a1a);
            tpl.lamps.tail2.emissiveIntensity = 0.9;
          }
        }
        // lampu polisi: merah-biru kelip
        if (tpl.lamps.lensL || tpl.lamps.lensR) {
          const phase = Math.floor(performance.now() / 110) % 2 === 0;
          if (tpl.lamps.lensL) {
            tpl.lamps.lensL.emissive.setHex(0xff2020);
            tpl.lamps.lensL.emissiveIntensity = phase ? 3.2 : 0.15;
          }
          if (tpl.lamps.lensR) {
            tpl.lamps.lensR.emissive.setHex(0x2060ff);
            tpl.lamps.lensR.emissiveIntensity = phase ? 0.15 : 3.2;
          }
        }
        continue;
      }

      // ---- fallback prosedural ----
      if (c.y2 === 'motorbike') {
        this.drawBike(m, q, v, s, e, c);
        continue;
      }
      const len = T.len;
      const wid = T.wid;
      e.set(0, -c.a, 0);
      q.setFromEuler(e);
      const pos = v.set(c.x, 0, c.y);

      m.compose(pos.clone().setY(7.5), q, s.set(len, 9, wid));
      this.carBody.push(c.c || T.color, m);
      m.compose(pos.clone().setY(15.5), q, s.set(len * 0.44, 8, wid * 0.78));
      this.carCabin.push(m);
      if (c.y2 === 'police') {
        m.compose(pos.clone().setY(12.5), q, s.set(len * 0.5, 1.6, wid + 0.6));
        this.carStripe.push(m);
      }
      const lx = len / 2 - 1.5;
      for (const sz of [1, -1]) {
        m.compose(pos.clone().add(new THREE.Vector3(lx, 0, sz * wid * 0.3).applyQuaternion(q)).setY(7), q, s.set(2, 2.4, 3.2));
        this.carLamp.push(m);
        m.compose(pos.clone().add(new THREE.Vector3(-lx, 0, sz * wid * 0.3).applyQuaternion(q)).setY(7), q, s.set(2, 2.2, 3.2));
        this.carTail.push(m);
      }
      for (const ax of [1, -1]) {
        for (const sz of [1, -1]) {
          const off = new THREE.Vector3(ax * len * 0.32, 4.6, sz * wid * 0.52).applyQuaternion(q);
          m.compose(pos.clone().add(off), q, s.set(1, 1, 1));
          this.carWheel.push(m);
        }
      }
    }

    // sembunyikan mobil yang udah nggak ada
    for (const [id, rec] of this.carObjs) {
      if (!seen.has(id)) {
        this.scene.remove(rec.group);
        this.carObjs.delete(id);
        this.carState.delete(id);
      }
    }

    this.carBody.end();
    this.carCabin.end();
    this.carStripe.end();
    this.carWheel.end();
    this.carLamp.end();
    this.carTail.end();
    this.bikeParts.end();
    this.bikeDark.end();
    this.bikeWheel.end();
    this.bikeLamp.end();

    // ---------------- pemain (rig humanoid) ----------------
    const validIds = new Set();
    for (const p of players) {
      if (p.d) continue;
      if (camPos && p.i !== myId && Math.hypot(p.x-camPos.x,p.y-camPos.z) > (this.quality?.radius || 700)) continue;
      validIds.add(p.i);
      const isMe = p.i === myId;
      const ch = this.chars.ensure(p.i, this.paletteFor(p));

      // gerak & arah gerak (dari delta posisi)
      const last = this.lastPos.get(p.i);
      let speed = 0;
      let moveAngle = p.a;
      if (last) {
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        const d = Math.hypot(dx, dy);
        speed = d / Math.max(dt, 0.001);
        if (d > 0.4) moveAngle = Math.atan2(dy, dx);
      }
      this.lastPos.set(p.i, { x: p.x, y: p.y });

      ch.root.visible=true;
      const aim=isMe?localAiming:!!p.am;
      const aimAngle=isMe&&Number.isFinite(localAim)?localAim:p.a;
      const measured=Number.isFinite(p.vx)&&Number.isFinite(p.vy)?Math.hypot(p.vx,p.vy):speed;
      let x=p.x,y=p.y,height=0,seated=false,face=isMe&&localFacing!==undefined?localFacing:p.a;
      if(p.v){
        const c=cars.find(c=>c.i===p.v);
        if(c){
          const T=CAR_TYPES[c.y2]||CAR_TYPES.sedan;seated=c.y2==='motorbike'?'bike':true;face=c.a;
          const heavy=['bus','firetruck','garbage','delivery','ambulance','van'].includes(c.y2),forward=T.len*(heavy?.28:.04),side=seated==='bike'?0:-T.wid*.19;
          x=c.x+Math.cos(c.a)*forward-Math.sin(c.a)*side;y=c.y+Math.sin(c.a)*forward+Math.cos(c.a)*side;
          const roof=this.templates[c.y2]?.height||18;
          height=seated==='bike'?0:c.y2==='kart'?-3:['tractor','shovel'].includes(c.y2)?5:heavy?Math.max(0,Math.min(4,roof-18)):Math.min(0,roof-16);
        }
      }
      ch.update(dt,{x,y,height,seated,facing:aim&&!seated?aimAngle:face,aim:aim&&!seated,aimAngle,moveAngle,speed:seated?0:measured});
      if(isMe)ch.setOpacity(this.localOpacity??1);
    }
    // ---------------- pejalan kaki (NPC) ----------------
    if (peds) {
      const nearby = peds.filter(n => !camPos || Math.hypot(n.x-camPos.x,n.y-camPos.z) < Math.min(550,this.quality?.radius || 700)).sort((a,b) => (a.x-camPos.x)**2+(a.y-camPos.z)**2-((b.x-camPos.x)**2+(b.y-camPos.z)**2)).slice(0,this.quality?.peds ?? 24);
      for (const n of nearby) {
        const key = 900000 + n.i;
        validIds.add(key);
        const ch = this.chars.ensure(key, Entities.pedPalette(n));
        if (n.d) {
          // ketabrak mobil -> jatuh, bikin animasi "tumbang"
          ch.update(dt,{x:n.x,y:n.y,facing:n.a,speed:0,aim:false});
          ch.root.visible = true;
          ch.root.position.set(n.x, 2.3, n.y);
          ch.root.rotation.set(0, -n.a, -Math.PI/2);
          ch.hips.position.y = 8.4;
          ch.torso.rotation.z = 0.2;
          ch.legL.hip.rotation.z = 0.5; ch.legR.hip.rotation.z = -0.3;
          ch.armL.shoulder.rotation.z = 0.8; ch.armR.shoulder.rotation.z = -0.9;
          ch.armL.elbow.rotation.z = -0.6; ch.armR.elbow.rotation.z = -0.6;
        } else {
          const last = this.lastPos.get(key);
          let speed = 0;
          let moveAngle = n.a;
          if (last) {
            const dx = n.x - last.x, dy = n.y - last.y;
            const d = Math.hypot(dx, dy);
            speed = d / Math.max(dt, 0.001);
            if (d > 0.4) moveAngle = Math.atan2(dy, dx);
          }
          this.lastPos.set(key, { x: n.x, y: n.y });
          ch.update(dt, { x: n.x, y: n.y, facing: n.a, aim: false, moveAngle, speed });
        }
      }
    }

    this.chars.prune(validIds);
    for (const id of this.lastPos.keys()) if (!validIds.has(id)) this.lastPos.delete(id);
  }

  /** Palet warna pejalan kaki (deterministik per id). */
  static pedPalette(n) {
    const h = (n.i * 2246822519) >>> 0;
    return {
      shirt: hexToInt(n.c) ?? SHIRT_COLORS[h % SHIRT_COLORS.length],
      skin: SKIN_TONES[(h >>> 5) % SKIN_TONES.length],
      pants: PANTS_COLORS[(h >>> 9) % PANTS_COLORS.length],
      hair: HAIR_COLORS[(h >>> 13) % HAIR_COLORS.length],
      shoes: SHOE_COLORS[(h >>> 15) % SHOE_COLORS.length],
    };
  }

  /** Palet warna karakter dari data pemain (deterministik per id). */
  paletteFor(p) {
    if(p.o)return avatarPalette(p.o);
    const h = (p.i * 2654435761) >>> 0;
    const shirt = hexToInt(p.c) ?? SHIRT_COLORS[h % SHIRT_COLORS.length];
    return {
      shirt,
      skin: SKIN_TONES[(h >>> 3) % SKIN_TONES.length],
      pants: PANTS_COLORS[(h >>> 7) % PANTS_COLORS.length],
      hair: HAIR_COLORS[(h >>> 11) % HAIR_COLORS.length],
      shoes: SHOE_COLORS[(h >>> 13) % SHOE_COLORS.length],
    };
  }

  /** Motor procedural: rangka, tangki, jok, setang, lampu, 2 roda. */
  drawBike(m, q, v, s, e, c) {
    e.set(0, -c.a, 0);
    q.setFromEuler(e);
    const pos = v.set(c.x, 0, c.y);
    const lean = Math.max(-0.3, Math.min(0.3, (c.s || 0) * 0.0005));
    const base = m.compose(pos.clone(), q, s.set(1, 1, 1)).clone();
    base.multiply(new THREE.Matrix4().makeRotationZ(lean));
    base.multiply(new THREE.Matrix4().makeScale(.6,.6,.6));

    // rangka
    const frame = base.clone();
    frame.multiply(new THREE.Matrix4().makeTranslation(-1, 10, 0));
    frame.multiply(new THREE.Matrix4().makeScale(30, 3.4, 5));
    this.bikeDark.push(frame);

    // tangki merah
    const tank = base.clone();
    tank.multiply(new THREE.Matrix4().makeTranslation(6, 13.5, 0));
    tank.multiply(new THREE.Matrix4().makeScale(13, 7.5, 8));
    this.bikeParts.push(tank);

    // jok
    const seat = base.clone();
    seat.multiply(new THREE.Matrix4().makeTranslation(-8, 13.5, 0));
    seat.multiply(new THREE.Matrix4().makeScale(15, 4.5, 7));
    this.bikeDark.push(seat);

    // setang
    const bar = base.clone();
    bar.multiply(new THREE.Matrix4().makeTranslation(15, 16, 0));
    bar.multiply(new THREE.Matrix4().makeScale(3.4, 3.4, 21));
    this.bikeDark.push(bar);

    // garpu depan
    const fork = base.clone();
    fork.multiply(new THREE.Matrix4().makeTranslation(13, 11, 0));
    fork.multiply(new THREE.Matrix4().makeScale(3, 12, 4));
    this.bikeDark.push(fork);

    // lampu depan
    const lamp = base.clone();
    lamp.multiply(new THREE.Matrix4().makeTranslation(18.5, 13, 0));
    lamp.multiply(new THREE.Matrix4().makeScale(3, 5, 6));
    this.bikeLamp.push(lamp);

    // knalpot
    const pipe = base.clone();
    pipe.multiply(new THREE.Matrix4().makeTranslation(-12, 8, 5.5));
    pipe.multiply(new THREE.Matrix4().makeScale(12, 3, 3));
    this.bikeDark.push(pipe);

    // 2 roda
    for (const ax of [1, -1]) {
      const off = new THREE.Vector3(ax * 8.7, 4.8, 0).applyQuaternion(q);
      m.compose(pos.clone().add(off), q, s.set(.6, .6, .6));
      this.bikeWheel.push(m);
    }
  }
}

/** Pool tracer peluru (garis cahaya di dunia 3D). */
export class Tracers {
  constructor(scene, count = 20) {
    this.items = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, mat, t: 1 });
    }
    this.next = 0;
  }

  add(from, to) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.001) return;
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    it.mesh.position.copy(mid);
    it.mesh.lookAt(to);
    it.mesh.scale.set(1.2, 1.2, len);
    it.mesh.visible = true;
    it.t = 0;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.t >= 0.14) { if (it.mesh.visible) it.mesh.visible = false; continue; }
      it.t += dt;
      it.mat.opacity = Math.max(0, 1 - it.t / 0.14);
    }
  }
}
