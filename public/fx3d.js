// fx3d.js — efek visual: asap, debu, percikan, jejak ban, kilat tembak, hujan, getaran kamera.
// Semua tanpa file eksternal (texture dibuat runtime via canvas).

import * as THREE from './vendor/three.module.js';

export function softDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/**
 * Sistem partikel sederhana: satu Points dengan buffer dinamis.
 * Partikel: {x,y,z, vx,vy,vz, life, maxLife, size, r,g,b, grav, drag}
 */
export class Particles {
  constructor(scene, max = 1200) {
    this.max = max;
    this.enabled = true;
    this.n = 0;
    this.items = [];
    const pos = new Float32Array(max * 3);
    const col = new Float32Array(max * 3);
    const siz = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(siz, 1));
    const mat = new THREE.PointsMaterial({
      size: 10,
      map: softDotTexture(),
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
      opacity: 0.55,
    });
    // ukuran per-partikel (atribut psize, bukan 'size' karena itu sudah jadi uniform)
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float psize;\n' + sh.vertexShader
        .replace('gl_PointSize = size;', 'gl_PointSize = psize;');
    };
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = geo;
    this._c = new THREE.Color();
  }

  spawn(o) {
    if (!this.enabled) return;
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({
      x: o.x, y: o.y, z: o.z,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life || 0.6, maxLife: o.life || 0.6,
      size: o.size || 8,
      r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1,
      grav: o.grav ?? 0, drag: o.drag ?? 1.6,
      fade: o.fade ?? 1,
      grow: o.grow ?? 0,
    });
  }

  setEnabled(v) { this.enabled = !!v; this.points.visible = !!v; if (!v) { this.items.length = 0; this.n = 0; this.geo.setDrawRange(0, 0); } }

  update(dt) {
    if (!this.enabled || !this.items.length && !this.n) return;
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const siz = this.geo.attributes.psize.array;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.vy = (p.vy + p.grav * dt) * d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.5) { p.y = 0.5; p.vy = Math.abs(p.vy) * 0.2; }
      const t = p.life / p.maxLife;
      const a = p.fade === 0 ? 1 : t;
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      col[n * 3] = p.r * a; col[n * 3 + 1] = p.g * a; col[n * 3 + 2] = p.b * a;
      siz[n] = p.size * (1 + p.grow * (1 - t));
      n++;
      if (n >= this.max) break;
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
  }

  clear() { this.items.length = 0; }
}

/** Jejak ban (skid mark) — pita lebar di tanah, memudar pelan. */
export class SkidMarks {
  constructor(scene, maxStrips = 24, maxPoints = 46) {
    this.scene = scene;
    this.maxStrips = maxStrips;
    this.maxPoints = maxPoints;
    this.strips = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  /** Buat strip baru (satu ban). */
  addStrip() {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(this.maxPoints * 2 * 3);
    const uvs = new Float32Array(this.maxPoints * 2 * 2);
    const idx = [];
    for (let i = 0; i < this.maxPoints; i++) {
      const t = i / (this.maxPoints - 1);
      uvs[(i * 2) * 2] = 0; uvs[(i * 2) * 2 + 1] = t;
      uvs[(i * 2 + 1) * 2] = 1; uvs[(i * 2 + 1) * 2 + 1] = t;
    }
    for (let i = 0; i < this.maxPoints - 1; i++) {
      const a0 = i * 2, b0 = i * 2 + 1, a1 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
      idx.push(a0, b0, a1, b0, b1, a1);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x101014, transparent: true, opacity: 0.5,
      depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    const strip = { mesh, geo, mat, pts: [], life: 9 };
    this.strips.push(strip);
    if (this.strips.length > this.maxStrips) {
      const old = this.strips.shift();
      this.group.remove(old.mesh);
      old.geo.dispose(); old.mat.dispose();
    }
    return strip;
  }

  /**
   * Tambah titik jejak ban.
   * @param {number} x @param {number} y posisi titik
   * @param {number} nx @param {number} ny normal (arah lebar ban)
   * @param {number} halfW setengah lebar ban
   */
  pushPoint(strip, x, y, nx, ny, halfW) {
    strip.pts.push([x - nx * halfW, y - ny * halfW, x + nx * halfW, y + ny * halfW]);
    if (strip.pts.length > this.maxPoints) strip.pts.shift();
    const arr = strip.geo.attributes.position.array;
    for (let i = 0; i < strip.pts.length; i++) {
      const p = strip.pts[i];
      arr.set([p[0], .35, p[1], p[2], .35, p[3]], i * 6);
    }
    strip.geo.setDrawRange(0, Math.max(0, strip.pts.length - 1) * 6);
    strip.geo.attributes.position.needsUpdate = true;
  }

  update(dt) {
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const s = this.strips[i];
      s.life -= dt;
      s.mat.opacity = Math.max(0, Math.min(0.55, s.life * 0.12));
      if (s.life <= 0) {
        this.group.remove(s.mesh);
        s.geo.dispose(); s.mat.dispose();
        this.strips.splice(i, 1);
      }
    }
  }
}

/** Kilat tembak: sprite/additive yang cepat hilang. */
export class Flashes {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.tex = softDotTexture();
  }
  flash(x, y, z, color = 0xffd27a, size = 26, life = 0.09) {
    const mat = new THREE.SpriteMaterial({
      map: this.tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.set(size, size, 1);
    this.scene.add(sp);
    this.items.push({ sp, mat, life, maxLife: life, size });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.sp); f.mat.dispose();
        this.items.splice(i, 1);
        continue;
      }
      const t = f.life / f.maxLife;
      f.mat.opacity = t;
      f.sp.scale.setScalar(f.size * (0.6 + 0.7 * (1 - t)));
    }
  }
}

/** Hujan: titik-titik jatuh yang ngikutin kamera. */
export class Rain {
  constructor(scene, count = 2600, box = 420) {
    this.count = count; this.limit = count;
    this.box = box;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box;
      pos[i * 3 + 1] = Math.random() * 180;
      pos[i * 3 + 2] = (Math.random() - 0.5) * box;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaaccee, size: 1.6, transparent: true, opacity: 0.55, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.geo = geo;
  }
  setActive(v) { this.points.visible = v; }
  setQuality(tier) { this.limit = Math.floor(this.count * (tier === 0 ? .12 : tier === 1 ? .5 : 1)); this.geo.setDrawRange(0, this.limit); }
  update(dt, center) {
    if (!this.points.visible) return;
    const arr = this.geo.attributes.position.array;
    const b = this.box;
    for (let i = 0; i < this.limit; i++) {
      arr[i * 3 + 1] -= 520 * dt;
      arr[i * 3] += 26 * dt;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 150 + Math.random() * 40;
        arr[i * 3] = center.x + (Math.random() - 0.5) * b;
        arr[i * 3 + 2] = center.z + (Math.random() - 0.5) * b;
      }
      // jaga posisi relatif kamera
      const dx = arr[i * 3] - center.x;
      const dz = arr[i * 3 + 2] - center.z;
      if (dx > b / 2) arr[i * 3] -= b;
      if (dx < -b / 2) arr[i * 3] += b;
      if (dz > b / 2) arr[i * 3 + 2] -= b;
      if (dz < -b / 2) arr[i * 3 + 2] += b;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/** Getaran kamera (shake) simple. */
export class Shake {
  constructor() { this.amp = 0; this.t = 0; }
  add(a) { this.amp = Math.min(1.6, this.amp + a); }
  update(dt) {
    this.t += dt;
    this.amp *= Math.max(0, 1 - dt * 3.2);
    if (this.amp < 0.001) { this.amp = 0; return { x: 0, y: 0 }; }
    const a = this.amp;
    return {
      x: Math.sin(this.t * 47) * a * 1.5,
      y: Math.cos(this.t * 39) * a * 1.2,
    };
  }
}
