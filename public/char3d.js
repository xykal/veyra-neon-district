// char3d.js — karakter humanoid low-poly + rig animasi (jalan / lari / idle / aim)
// Semua skala dalam "unit dunia" (1 unit = 1 piksel peta). Karakter ~30 unit = ~1,7 m.
// Arah depan karakter = +X (bukan +Z), supaya sama dengan model mobil Kenney.

import * as THREE from './vendor/three.module.js';

export const SKIN_TONES = [0xf2cba4, 0xe0aa83, 0xc68642, 0x8d5524, 0x6b4226, 0xffdcb0, 0xd9a06b];
export const SHIRT_COLORS = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0x34495e, 0xff6f00];
export const PANTS_COLORS = [0x2c3e50, 0x1f2833, 0x4a4a4a, 0x3b3b3b, 0x5d4037, 0x283747, 0x7f8c8d];
export const HAIR_COLORS = [0x161616, 0x3b2410, 0x6b4423, 0xa9762f, 0xd9c39a, 0x8b8b8b, 0x4b2f6b, 0x2b2118];
export const SHOE_COLORS = [0x15171b, 0x2c2c30, 0x6b4a2f, 0xeeeeee];

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

const geometryCache = new Map();
function part(geo, material) {
  const pos = geo.attributes.position.array;
  const key = geo.type + JSON.stringify(geo.parameters) + ':' + pos[0] + ':' + pos[1] + ':' + pos[2];
  const shared = geometryCache.get(key);
  if (shared && shared !== geo) { geo.dispose(); geo = shared; }
  else if (!shared) geometryCache.set(key, geo);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

/** Silinder dengan sumbu Y, ujung atas di pivot (0,0,0), panjang ke bawah. */
function limbGeo(rTop, rBot, len, seg = 7) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

function angleDiff(a, b) {
  let d = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Karakter humanoid: pinggul -> torso -> kepala/lengan, pinggul -> kaki.
 * Semua animasi pakai rotasi pivot ( Groups ), bukan skinning, biar ringan.
 */
export class Character {
  constructor(scene, palette = {}) {
    this.scene = scene;
    this.pal = {
      skin: palette.skin ?? SKIN_TONES[0],
      shirt: palette.shirt ?? SHIRT_COLORS[0],
      pants: palette.pants ?? PANTS_COLORS[0],
      hair: palette.hair ?? HAIR_COLORS[0],
      shoes: palette.shoes ?? SHOE_COLORS[0],
    };
    this.root = new THREE.Group();
    this.phase = 0;
    this.blink = 0;
    this.t = 0;
    this.aimBlend = 0;
    this.build();
    scene.add(this.root);
  }

  build() {
    const P = this.pal;
    const mSkin = mat(P.skin);
    const mShirt = mat(P.shirt);
    const mPants = mat(P.pants);
    const mHair = mat(P.hair);
    const mShoe = mat(P.shoes);
    const mDark = mat(0x1b1e24);
    const mGun = mat(0x2b3038);
    this.mats = { skin: mSkin, shirt: mShirt, pants: mPants, hair: mHair, shoes: mShoe, dark: mDark, gun: mGun };

    // ---------- pinggul ----------
    this.hips = new THREE.Group();
    this.hips.position.y = 13.4;
    this.root.add(this.hips);

    const hipMesh = part(new THREE.BoxGeometry(4.6, 4.4, 7.2), mPants);
    hipMesh.position.y = 0.6;
    this.hips.add(hipMesh);

    // ---------- torso ----------
    this.torso = new THREE.Group();
    this.torso.position.y = 2.4;
    this.hips.add(this.torso);

    const chest = part(new THREE.CylinderGeometry(4.4, 3.7, 10.4, 10), mShirt);
    chest.position.y = 5.2;
    chest.scale.set(0.72, 1, 0.6);
    this.torso.add(chest);

    // jaket/kolom
    const collar = part(new THREE.CylinderGeometry(2.4, 2.8, 1.5, 8), mat(0x1f2630));
    collar.position.y = 10.1;
    collar.scale.set(0.8, 1, 0.7);
    this.torso.add(collar);

    // ---------- kepala ----------
    this.neck = new THREE.Group();
    this.neck.position.y = 10.6;
    this.torso.add(this.neck);

    const neckMesh = part(limbGeo(1.5, 1.7, 1.6, 6), mSkin);
    neckMesh.position.y = 1.6;
    this.neck.add(neckMesh);

    const head = part(new THREE.SphereGeometry(3.35, 14, 11), mSkin);
    head.position.y = 4.3;
    head.scale.set(0.95, 1.1, 0.92);
    this.neck.add(head);
    this.head = head;

    const hair = part(new THREE.SphereGeometry(3.5, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.62), mHair);
    hair.position.y = 4.35;
    hair.scale.set(0.99, 1.16, 0.95);
    this.neck.add(hair);

    const fringe = part(new THREE.BoxGeometry(1.4, 1.6, 6.4), mHair);
    fringe.position.set(2.55, 5.6, 0);
    this.neck.add(fringe);

    // wajah sederhana: dua mata + mulut
    const eyeGeo = new THREE.BoxGeometry(0.8, 0.95, 0.5);
    for (const sz of [1, -1]) {
      const eye = part(eyeGeo, mDark);
      eye.position.set(2.85, 4.5, sz * 1.35);
      this.neck.add(eye);
    }
    const mouth = part(new THREE.BoxGeometry(0.5, 0.5, 1.6), mat(0x9c5b4a));
    mouth.position.set(2.9, 3.0, 0);
    this.neck.add(mouth);

    // ---------- lengan ----------
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0, 9.2, side * 3.1);
      this.torso.add(shoulder);
      const upper = part(limbGeo(1.95, 1.6, 5.8), mShirt);
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -5.8;
      shoulder.add(elbow);
      const lower = part(limbGeo(1.5, 1.2, 5.4), mSkin);
      elbow.add(lower);
      const hand = new THREE.Group();
      hand.position.y = -5.4;
      elbow.add(hand);
      const palm = part(new THREE.SphereGeometry(1.4, 8, 6), mSkin);
      palm.scale.set(1.0, 1.15, 0.75);
      hand.add(palm);
      return { shoulder, elbow, hand };
    };
    this.armL = makeArm(1);
    this.armR = makeArm(-1);

    // pistol di tangan kanan
    this.gun = new THREE.Group();
    const gunBody = part(new THREE.BoxGeometry(6.2, 1.7, 1.7), mGun);
    gunBody.position.set(2.6, 0, 0);
    this.gun.add(gunBody);
    const gunGrip = part(new THREE.BoxGeometry(1.5, 2.6, 1.5), mGun);
    gunGrip.position.set(-0.1, -1.5, 0);
    this.gun.add(gunGrip);
    const gunBarrel = part(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 6), mat(0x15181d));
    gunBarrel.rotation.z = Math.PI / 2;
    gunBarrel.position.set(6.0, 0.1, 0);
    this.gun.add(gunBarrel);
    this.gun.position.set(0.4, -0.6, 0);
    this.armR.hand.add(this.gun);

    // ---------- kaki ----------
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0, 0.4, side * 1.95);
      this.hips.add(hip);
      const thigh = part(limbGeo(2.35, 1.85, 6.8), mPants);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -6.8;
      hip.add(knee);
      const shin = part(limbGeo(1.8, 1.35, 6.5), mPants);
      knee.add(shin);
      const ankle = new THREE.Group();
      ankle.position.y = -6.5;
      knee.add(ankle);
      const shoe = part(new THREE.BoxGeometry(5.0, 1.6, 2.9), mShoe);
      shoe.position.set(0.9, -0.7, 0);
      ankle.add(shoe);
      const sole = part(new THREE.BoxGeometry(5.1, 0.5, 3.0), mat(0x0f1114));
      sole.position.set(0.9, -1.5, 0);
      ankle.add(sole);
      return { hip, knee, ankle };
    };
    this.legL = makeLeg(1);
    this.legR = makeLeg(-1);
  }

  /** Ganti warna kulit/baju (dipakai kalau rebirth / ganti Vehicles). */
  setPalette(p) {
    if (!p) return;
    Object.assign(this.pal, p);
    if (this.mats) {
      if (p.skin !== undefined) { this.mats.skin.color.setHex(p.skin); this.mats.hair.color.setHex(p.hair); }
      if (p.shirt !== undefined) this.mats.shirt.color.setHex(p.shirt);
      if (p.pants !== undefined) this.mats.pants.color.setHex(p.pants);
      if (p.shoes !== undefined) this.mats.shoes.color.setHex(p.shoes);
    }
  }

  /**
   * @param {number} dt detik
   * @param {object} s {x, y, facing, aim, aimAngle, moveAngle, speed}
   */
  update(dt, s) {
    this.t += dt;
    const speed = Math.abs(s.speed || 0);
    const run = Math.min(1, Math.max(0, (speed - 185) / 95));
    const walk = Math.min(1, speed / 120);
    this.phase += speed * dt * 0.075;

    // posisi & arah
    this.root.position.set(s.x, 0, s.y);
    const face = s.aim ? (s.aimAngle ?? s.facing) : s.facing;
    this.root.rotation.z = 0;
    this.root.rotation.y = -face;

    // blend pose aim
    const wantAim = s.aim ? 1 : 0;
    this.aimBlend += (wantAim - this.aimBlend) * Math.min(1, dt * 12);
    const aim = this.aimBlend;

    // pinggul ikut arah jalan (bisa strafe)
    if (s.moveAngle !== undefined && s.moveAngle !== null) {
      let d = angleDiff(s.moveAngle, face);
      d = Math.max(-0.85, Math.min(0.85, d));
      this.hips.rotation.y = d * (1 - aim * 0.55);
    } else {
      this.hips.rotation.y = 0;
    }

    const ph = this.phase;
    const amp = (0.30 + 0.55 * run) * Math.min(1, walk * 1.6);
    const swing = Math.sin(ph) * amp;
    const bob = Math.abs(Math.sin(ph)) * (0.9 + run * 0.9);

    // ---- kaki ----
    const kneeBend = 0.12 + run * 0.35;
    this.legL.hip.rotation.z = swing;
    this.legR.hip.rotation.z = -swing;
    this.legL.knee.rotation.z = -Math.max(0, Math.sin(ph + 1.0)) * (0.5 + 0.7 * run) - kneeBend * 0.4;
    this.legR.knee.rotation.z = -Math.max(0, Math.sin(ph + 1.0 + Math.PI)) * (0.5 + 0.7 * run) - kneeBend * 0.4;
    this.legL.ankle.rotation.z = Math.max(0, -Math.sin(ph + 0.4)) * 0.45;
    this.legR.ankle.rotation.z = Math.max(0, -Math.sin(ph + 0.4 + Math.PI)) * 0.45;

    // ---- badan ----
    this.hips.position.y = 13.4 + bob - run * 0.8;
    this.torso.rotation.z = -run * 0.16 + Math.sin(this.t * 1.3) * 0.01;
    this.torso.rotation.y = Math.sin(ph) * 0.07 * (1 - aim);
    this.torso.scale.y = 1 + Math.sin(this.t * 1.9) * 0.012 * (1 - walk);

    // ---- lengan ----
    // jalan: lengan berayun berlawanan kaki
    const armSwing = -swing * 0.62;
    this.armL.shoulder.rotation.z = armSwing;
    this.armR.shoulder.rotation.z = -armSwing;
    this.armL.elbow.rotation.z = -0.28 - run * 0.35;
    this.armR.elbow.rotation.z = -0.28 - run * 0.35;
    this.armL.shoulder.rotation.x = 0;
    this.armR.shoulder.rotation.x = 0;

    // aim: lengan kanan nunjuk ke depan, lengan kiri pegang
    if (aim > 0.001) {
      const aimPose = (o, target) => { o.rotation.z = o.rotation.z * (1 - aim) + target * aim; };
      aimPose(this.armR.shoulder, -1.42);
      aimPose(this.armR.elbow, -0.12);
      aimPose(this.armL.shoulder, -0.95);
      aimPose(this.armL.elbow, -1.05);
      this.torso.rotation.y = this.torso.rotation.y * (1 - aim) + 0.18 * aim;
      // kepala sedikit)};
      this.neck.rotation.y = -0.12 * aim;
    } else {
      this.neck.rotation.y *= 0.85;
    }

    // jalan bolak-balik kecil di lengan idle
    this.armL.shoulder.rotation.x = Math.sin(this.t * 1.4) * 0.03;
    this.armR.shoulder.rotation.x = Math.sin(this.t * 1.4 + 1) * 0.03;
  }

  /** Posisi muzzle buat efek tembakan (koordinat dunia). */
  muzzleWorld(out = new THREE.Vector3()) {
    this.gun.getWorldPosition(out);
    out.x += 5.5;
    return out;
  }

  dispose() {
    this.scene.remove(this.root);
    const materials = new Set();
    this.root.traverse((o) => {
      if (o.isMesh) materials.add(o.material);
    });
    for (const material of materials) material.dispose();
  }
}

/** Kelola banyak karakter (pemain + NPC) dengan palet & animasi. */
export class CharacterManager {
  constructor(scene) {
    this.scene = scene;
    this.chars = new Map();
  }

  /** @param {string|number} id @param {object} palette */
  ensure(id, palette) {
    let c = this.chars.get(id);
    if (!c) {
      c = new Character(this.scene, palette);
      this.chars.set(id, c);
    }
    return c;
  }

  remove(id) {
    const c = this.chars.get(id);
    if (c) { c.dispose(); this.chars.delete(id); }
  }

  /** Buang karakter yang gak ada di snapshot. */
  prune(validIds) {
    for (const id of [...this.chars.keys()]) {
      if (!validIds.has(id)) this.remove(id);
    }
  }
}
