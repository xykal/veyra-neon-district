// Pembangun dunia 3D dari data peta 2D (shared/map.js).
import * as THREE from './vendor/three.module.js';
import { softDotTexture } from './fx3d.js';

const C = 600;      // cell
const RW = 96;      // lebar jalan

function rectPlane(x, z, w, d, y, material) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.set(w, 1, d);
  mesh.position.set(x + w / 2, y, z + d / 2);
  mesh.receiveShadow = true;
  return mesh;
}

/** Kumpulan instanced mesh dengan warna berbeda per instance. */
export class ColorPool {
  constructor(scene, geometry, capacity = 48, fade = false) {
    this.scene = scene;
    this.geometry = geometry;
    this.capacity = capacity;
    this.fade = fade;
    this.pools = new Map(); // color -> {mesh, n}
  }

  get(color) {
    let p = this.pools.get(color);
    if (!p) {
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
      let geo = this.geometry;
      let alphaAttr = null;
      if (this.fade) {
        // tiap pool punya geometry sendiri biar atribut alpha per-instance terpisah
        geo = this.geometry.clone();
        alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity).fill(1), 1);
        geo.setAttribute('aAlpha', alphaAttr);
        applyFadeShader(mat);
      }
      const mesh = new THREE.InstancedMesh(geo, mat, this.capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      p = { mesh, n: 0, alphaAttr };
      this.pools.set(color, p);
    }
    return p;
  }

  /** Set alpha (0..1) untuk instance tertentu (dipakai wall-fade). */
  setAlpha(ref, value) {
    if (!ref || !ref.pool || !ref.pool.alphaAttr) return;
    const arr = ref.pool.alphaAttr.array;
    if (ref.idx < arr.length) {
      arr[ref.idx] = value;
      ref.pool.alphaAttr.needsUpdate = true;
    }
  }

  begin() {
    for (const p of this.pools.values()) p.n = 0;
  }

  push(color, matrix) {
    const p = this.get(color);
    if (p.n >= this.capacity) return null;
    p.mesh.setMatrixAt(p.n, matrix);
    const idx = p.n;
    p.n++;
    return { pool: p, idx };
  }

  end() {
    for (const p of this.pools.values()) {
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Nempel shader dither-fade ke material (alpha per-instance). */
export function applyFadeShader(material) {
  if (material.userData.__fade) return material;
  material.userData.__fade = true;
  material.transparent = true;
  material.depthWrite = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAlpha = aAlpha;');
    shader.fragmentShader = 'varying float vAlpha;\n' +
      shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.a *= vAlpha;');
  };
  material.customProgramCacheKey = () => 'kota-fade';
  material.needsUpdate = true;
  return material;
}

/** Kotak instanced dengan ukuran & posisi berbeda. */
export class ShapePool {
  constructor(scene, geometry, material, capacity = 256, fade = false) {
    this.fade = fade;
    if (fade) {
      geometry = geometry.clone();
      this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
      geometry.setAttribute('aAlpha', this.alphaAttr);
      applyFadeShader(material);
    }
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.n = 0;
  }

  begin() { this.n = 0; }

  push(matrix) {
    if (this.n >= this.mesh.instanceMatrix.count) return null;
    this.mesh.setMatrixAt(this.n, matrix);
    const idx = this.n;
    this.n++;
    return { pool: this, idx };
  }

  setAlpha(ref, value) {
    if (!ref || !ref.pool || !ref.pool.alphaAttr) return;
    const arr = ref.pool.alphaAttr.array;
    if (ref.idx < arr.length) {
      arr[ref.idx] = value;
      ref.pool.alphaAttr.needsUpdate = true;
    }
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Pool instanced dengan 2 warna (mis. lampu lalu lintas merah/hijau).
 * Ganti fase = bangun ulang matrix-nya (dilakukan tiap ~10 detik, Murah).
 */
export class SignalPool {
  constructor(scene, geo, cap, color) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
  add(m4) { if (this.items.length < this.cap) this.items.push(m4.clone()); }
  commit() {
    for (let i = 0; i < this.items.length; i++) this.mesh.setMatrixAt(i, this.items[i]);
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function buildWorld(map, scene, qualityOpt) {
  let quality = qualityOpt || { name: 'tinggi', dpr: 2, shadow: true, fx: true, rain: true, windows: 1, props: 1, clouds: 46 };
  const group = new THREE.Group();
  scene.add(group);
  const n = map.size / C;

  // ---------- langit ----------
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 8; skyCanvas.height = 256;
  const sctx = skyCanvas.getContext('2d');
  const grad = sctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1a2a4a');
  grad.addColorStop(0.45, '#6d94c4');
  grad.addColorStop(0.75, '#b9cfe2');
  grad.addColorStop(1, '#e8d9b8');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 8, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ---------- bintang ----------
  const starGeo = new THREE.BufferGeometry();
  const starCount = 700;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 0.92);
    const r = 3500;
    starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = r * Math.cos(ph) * 0.9 + 120;
    starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xeaf0ff, size: 12, sizeAttenuation: false, transparent: true, opacity: 0,
    depthWrite: false, fog: false, map: softDotTexture(), alphaTest: 0.02,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);

  // disc matahari / bulan
  function discTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.32, outer);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: discTexture('rgba(255,252,225,1)', 'rgba(255,214,130,0.85)'),
    transparent: true, depthWrite: false, fog: false, opacity: 0.95,
  }));
  sunSprite.scale.set(520, 520, 1);
  sunSprite.renderOrder = -1;
  scene.add(sunSprite);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: discTexture('rgba(240,245,255,1)', 'rgba(190,205,235,0.7)'),
    transparent: true, depthWrite: false, fog: false, opacity: 0,
  }));
  moonSprite.scale.set(300, 300, 1);
  moonSprite.renderOrder = -1;
  scene.add(moonSprite);

  // ---------- awan ----------
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, 46);
  cloudMesh.frustumCulled = false;
  cloudMesh.renderOrder = -1;
  scene.add(cloudMesh);
  const clouds = [];
  const cm4 = new THREE.Matrix4();
  for (let i = 0; i < 46; i++) {
    clouds.push({
      x: (Math.random() - 0.5) * 2600,
      y: 420 + Math.random() * 220,
      z: (Math.random() - 0.5) * 2600,
      s: 90 + Math.random() * 190,
      v: 3 + Math.random() * 6,
    });
  }

  // ---------- tanah ----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(map.size + 3000, map.size + 3000),
    new THREE.MeshLambertMaterial({ color: 0x2f5136 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.size / 2, -0.5, map.size / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // ---------- trotoar (1 kotak per blok) ----------
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x55575d });
  const walkGeo = new THREE.PlaneGeometry(1, 1);
  walkGeo.rotateX(-Math.PI / 2);
  const walkPool = new ShapePool(group, walkGeo, sidewalkMat, 128);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      m4.compose(
        new THREE.Vector3(i * C + RW / 2 + (C - RW) / 2, 0.2, j * C + RW / 2 + (C - RW) / 2),
        new THREE.Quaternion(),
        new THREE.Vector3(C - RW, 1, C - RW)
      );
      walkPool.push(m4);
    }
  }
  walkPool.end();

  // ---------- aspal (tanpa overlap) ----------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33343a });
  const roadPool = new ShapePool(group, walkGeo, roadMat, 256);
  for (let i = 0; i <= n; i++) {
    // strip vertikal penuh
    m4.compose(
      new THREE.Vector3(i * C, 0.1, map.size / 2),
      new THREE.Quaternion(),
      new THREE.Vector3(RW, 1, map.size + 200)
    );
    roadPool.push(m4);
  }
  for (let j = 0; j <= n; j++) {
    // segmen horizontal antar persimpangan
    for (let i = 0; i < n; i++) {
      m4.compose(
        new THREE.Vector3(i * C + RW / 2 + (C - RW) / 2, 0.12, j * C),
        new THREE.Quaternion(),
        new THREE.Vector3(C - RW, 1, RW)
      );
      roadPool.push(m4);
    }
  }
  roadPool.end();

  // ---------- marka jalan ----------
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xe6e6c8 });
  const dashGeo = new THREE.PlaneGeometry(1, 1);
  dashGeo.rotateX(-Math.PI / 2);
  const dashPool = new ShapePool(group, dashGeo, dashMat, 2048);
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < 6; k++) {
        const off = 70 + k * 72;
        if (off + 34 > C - 70) continue;
        // vertikal
        m4.compose(
          new THREE.Vector3(i * C, 0.25, j * C + off + 17),
          new THREE.Quaternion(),
          new THREE.Vector3(4, 1, 34)
        );
        dashPool.push(m4);
        // horizontal
        m4.compose(
          new THREE.Vector3(j * C + off + 17, 0.25, i * C),
          new THREE.Quaternion(),
          new THREE.Vector3(34, 1, 4)
        );
        dashPool.push(m4);
      }
    }
  }
  dashPool.end();

  // ---------- parkir ----------
  const lotMat = new THREE.MeshLambertMaterial({ color: 0x3c3d43 });
  const lotPool = new ShapePool(group, walkGeo, lotMat, 32);
  for (const l of map.lots) {
    m4.compose(new THREE.Vector3(l.x + l.w / 2, 0.15, l.y + l.h / 2), new THREE.Quaternion(), new THREE.Vector3(l.w, 1, l.h));
    lotPool.push(m4);
  }
  lotPool.end();

  // ---------- taman ----------
  const parkMat = new THREE.MeshLambertMaterial({ color: 0x2f5c34 });
  const parkPool = new ShapePool(group, walkGeo, parkMat, 32);
  for (const p of map.parks) {
    m4.compose(new THREE.Vector3(p.x + p.w / 2, 0.16, p.y + p.h / 2), new THREE.Quaternion(), new THREE.Vector3(p.w, 1, p.h));
    parkPool.push(m4);
  }
  parkPool.end();

  // jalur taman
  const pathMat = new THREE.MeshLambertMaterial({ color: 0x7d7a63 });
  const pathPool = new ShapePool(group, walkGeo, pathMat, 64);
  for (const pr of map.props) {
    if (pr.type !== 'path') continue;
    m4.compose(new THREE.Vector3(pr.x + pr.w / 2, 0.3, pr.y + pr.h / 2), new THREE.Quaternion(), new THREE.Vector3(pr.w, 1, pr.h));
    pathPool.push(m4);
  }
  pathPool.end();

  // marka parkir
  const stallMat = new THREE.MeshBasicMaterial({ color: 0x8a8b90 });
  const stallGeo = new THREE.PlaneGeometry(1, 1);
  stallGeo.rotateX(-Math.PI / 2);
  const stallPool = new ShapePool(group, stallGeo, stallMat, 512);
  for (const pr of map.props) {
    if (pr.type !== 'stall') continue;
    const step = 46;
    for (let x = pr.x; x <= pr.x + pr.w; x += step) {
      m4.compose(new THREE.Vector3(x, 0.35, pr.y + pr.h / 2), new THREE.Quaternion(), new THREE.Vector3(2, 1, pr.h));
      stallPool.push(m4);
    }
  }
  stallPool.end();

  // ---------- air ----------
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x1d4e79, transparent: true, opacity: 0.92 });
  for (const w of map.water) {
    const mesh = rectPlane(w.x, w.y, w.w, w.h, 0.4, waterMat);
    group.add(mesh);
  }

  // ---------- gedung ----------
  const H_SCALE = 8;
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallPool = new ColorPool(group, wallGeo, 40, true);
  const buildingRefs = [];
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4c53 });
  const roofPool = new ShapePool(group, roofGeo, roofMat, 600, true);
  const acGeo = new THREE.BoxGeometry(1, 1, 1);
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  const acPool = new ShapePool(group, acGeo, acMat, 600, true);
  const buildingIndex = new Map();

  wallPool.begin();
  roofPool.begin();
  acPool.begin();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (const b of map.buildings) {
    const H = Math.max(14, b.height * H_SCALE);
    m4.compose(v.set(b.x + b.w / 2, H / 2, b.y + b.h / 2), q, s.set(b.w, H, b.h));
    const bref = wallPool.push(brighten(b.color, 1.35), m4);
    m4.compose(v.set(b.x + b.w / 2, H + 3, b.y + b.h / 2), q, s.set(b.w + 3, 6, b.h + 3));
    const rref = roofPool.push(m4);
    const entry = { ref: bref, roofRef: rref, acRefs: [], winRefs: [], neonRefs: [], rect: { x: b.x, y: b.y, w: b.w, h: b.h }, H, alpha: 1 };
    buildingRefs.push(entry);
    buildingIndex.set(b, entry);
  }
  for (const pr of map.props) {
    if (pr.type !== 'ac') continue;
    // cari gedung terdekat
    let best = null; let bd = Infinity;
    for (const b of map.buildings) {
      const d = (pr.x - b.x) ** 2 + (pr.y - b.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) continue;
    const H = Math.max(14, best.height * H_SCALE);
    m4.compose(v.set(pr.x, H + 9, pr.y), q, s.set(pr.w, 5, pr.h));
    const acref = acPool.push(m4);
    const bentry = buildingIndex.get(best);
    if (bentry) bentry.acRefs.push(acref);
  }
  wallPool.end();
  roofPool.end();
  acPool.end();

  // ---------- pohon ----------
  const trunkGeo = new THREE.CylinderGeometry(2.2, 3, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkPool = new ColorPool(group, trunkGeo, 400);
  const leafGeo = new THREE.SphereGeometry(1, 7, 5);
  const leafPool = new ColorPool(group, leafGeo, 400);
  trunkPool.begin();
  leafPool.begin();
  for (const t of map.trees) {
    const th = t.r * 2.2;
    m4.compose(v.set(t.x, 0, t.y), q, s.set(t.r * 0.18, th, t.r * 0.18));
    trunkPool.push('#4a3a2a', m4);
    m4.compose(v.set(t.x, th + t.r * 0.9, t.y), q, s.set(t.r, t.r * 1.15, t.r));
    leafPool.push(t.tone, m4);
  }
  trunkPool.end();
  leafPool.end();

  // ---------- lampu jalan ----------
  const poleGeo = new THREE.CylinderGeometry(1.1, 1.4, 1, 6);
  poleGeo.translate(0, 0.5, 0);
  const polePool = new ShapePool(group, poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3d42 }), 200);
  const lampGeo = new THREE.SphereGeometry(1, 8, 6);
  const lampPool = new ShapePool(group, lampGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), 200);
  polePool.begin();
  lampPool.begin();
  for (const pr of map.props) {
    if (pr.type !== 'light') continue;
    m4.compose(v.set(pr.x, 0, pr.y), q, s.set(1, 42, 1));
    polePool.push(m4);
    m4.compose(v.set(pr.x, 44, pr.y), q, s.set(3.2, 3.2, 3.2));
    lampPool.push(m4);
  }
  polePool.end();
  lampPool.end();

  // ---------- detail gedung: jendela, pintu, neon sign, plinth ----------
  const winGeo = new THREE.PlaneGeometry(1, 1);
  const winMat = new THREE.MeshBasicMaterial({ color: 0x2c3c52, fog: true });
  const winPool = new ShapePool(group, winGeo, winMat, 20000, true);
  const doorPool = new ShapePool(group, winGeo, new THREE.MeshBasicMaterial({ color: 0x14171c }), 900, true);
  const neonPools = [
    new ShapePool(group, winGeo, new THREE.MeshBasicMaterial({ color: 0xff4fa3 }), 300, true),
    new ShapePool(group, winGeo, new THREE.MeshBasicMaterial({ color: 0x54e6ff }), 300, true),
    new ShapePool(group, winGeo, new THREE.MeshBasicMaterial({ color: 0xffd34d }), 300, true),
    new ShapePool(group, winGeo, new THREE.MeshBasicMaterial({ color: 0x8bff6b }), 300, true),
  ];
  const plinthPool = new ColorPool(group, new THREE.BoxGeometry(1, 1, 1), 120, true);
  const WIN_W = 15, WIN_H = 19, FLOOR = 30;
  // HP:ispatcher sebagian jendela biar hemat (wajib tetep keliatan mirip)
  const wStep = quality.windows >= 0.9 ? 1 : quality.windows >= 0.6 ? 2 : 3;
  const pStep = quality.props >= 0.9 ? 1 : quality.props >= 0.6 ? 2 : 3;

  const bIndex = new Map();
  for (const b of map.buildings) {
    const H = Math.max(14, b.height * H_SCALE);
    const floors = Math.max(1, Math.floor((H - 10) / FLOOR));
    const winRefs = [];

    // plinth (lantai dasar lebih gelap)
    m4.compose(
      v.set(b.x + b.w / 2, 4, b.y + b.h / 2), q,
      s.set(b.w + 1.2, 8, b.h + 1.2)
    );
    plinthPool.push('#20242b', m4);

    for (let f = 0; f < floors; f++) {
      const y = 14 + f * FLOOR;
      if (y + WIN_H > H) break;
      // sisi selatan (z = b.y) menghadap jalan
      const colsS = Math.max(1, Math.floor((b.w - 24) / 40));
      for (let cix = 0; cix < colsS; cix++) {
        if (wStep > 1 && (cix % wStep) !== 0) continue;
        const wx = b.x + ((cix + 1) * b.w) / (colsS + 1);
        m4.compose(v.set(wx, y, b.y - 0.7), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), s.set(WIN_W, WIN_H, 1));
        winRefs.push(winPool.push(m4));
        m4.compose(v.set(wx, y, b.y + b.h + 0.7), new THREE.Quaternion(), s.set(WIN_W, WIN_H, 1));
        winRefs.push(winPool.push(m4));
      }
      // sisi barat & timur
      const colsE = Math.max(1, Math.floor((b.h - 24) / 40));
      for (let cix = 0; cix < colsE; cix++) {
        if (wStep > 1 && (cix % wStep) !== 0) continue;
        const wz = b.y + ((cix + 1) * b.h) / (colsE + 1);
        m4.compose(v.set(b.x - 0.7, y, wz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), s.set(WIN_W, WIN_H, 1));
        winRefs.push(winPool.push(m4));
        m4.compose(v.set(b.x + b.w + 0.7, y, wz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), s.set(WIN_W, WIN_H, 1));
        winRefs.push(winPool.push(m4));
      }
    }

    // pintu + canopy di sisi selatan
    const dx = b.x + b.w / 2;
    m4.compose(v.set(dx, 9, b.y - 0.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), s.set(12, 18, 1));
    const doorRef = doorPool.push(m4);
    let neonRef = null;
    // neon sign buat sebagian gedung
    if ((b.x + b.y) % 3 < 1) {
      const pool = neonPools[Math.abs(Math.round(b.x + b.y)) % neonPools.length];
      const sy = Math.min(H - 8, 24 + (floors > 1 ? 18 : 0));
      m4.compose(v.set(dx, sy, b.y - 1.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), s.set(Math.min(b.w - 10, 46), 7, 1));
      neonRef = pool.push(m4);
    }
    // sambungkan ref ke entry gedung (buat wall-fade)
    const bent = buildingIndex.get(b);
    if (bent) { bent.winRefs = winRefs; bent.neonRefs = neonRef ? [neonRef] : []; bent.doorRefs = doorRef ? [doorRef] : []; }
  }
  winPool.end();
  doorPool.end();
  plinthPool.end();
  for (const np of neonPools) np.end();

  // ---------- zebra cross + garis berhenti di persimpangan ----------
  const zebraPool = new ShapePool(group, dashGeo, new THREE.MeshBasicMaterial({ color: 0xd8d8cc }), 900);
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const cx = i * C, cz = j * C;
      for (let k = 0; k < 5; k++) {
        const off = -RW / 2 + 12 + k * 15;
        // melintang di sisi utara & selatan
        m4.compose(v.set(cx + off, 0.28, cz - RW / 2 - 14), q, s.set(7, 1, RW * 0.8));
        zebraPool.push(m4);
        m4.compose(v.set(cx + off, 0.28, cz + RW / 2 + 14), q, s.set(7, 1, RW * 0.8));
        zebraPool.push(m4);
        m4.compose(v.set(cx - RW / 2 - 14, 0.28, cz + off), q, s.set(RW * 0.8, 1, 7));
        zebraPool.push(m4);
        m4.compose(v.set(cx + RW / 2 + 14, 0.28, cz + off), q, s.set(RW * 0.8, 1, 7));
        zebraPool.push(m4);
      }
    }
  }
  zebraPool.end();

  // ---------- properti jalan: bangku, hidran, tempat sampah, halte, papan reklame ----------
  const propWood = new ShapePool(group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), 200);
  const propMetal = new ShapePool(group, new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshLambertMaterial({ color: 0x44474d }), 300);
  const propRed = new ShapePool(group, new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshLambertMaterial({ color: 0xc0392b }), 200);
  const propGreen = new ShapePool(group, new THREE.CylinderGeometry(1, 0.85, 1, 10), new THREE.MeshLambertMaterial({ color: 0x2f6b3a }), 200);
  const propBoard = new ShapePool(group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x2b3a4a }), 80);
  const benchSeat = new ShapePool(group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }), 200);
  let propIdx = 0;
  for (const pr of map.props) {
    if (pStep > 1 && (propIdx++ % pStep) !== 0) continue;
    if (pr.type === 'bench') {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pr.a || 0, 0));
      m4.compose(v.set(pr.x, 7, pr.y), rot, s.set(34, 2.2, 12));
      benchSeat.push(m4);
      m4.compose(v.set(pr.x - Math.cos(pr.a || 0) * 12, 3.5, pr.y - Math.sin(pr.a || 0) * 12), rot, s.set(4, 7, 4));
      propMetal.push(m4);
      m4.compose(v.set(pr.x + Math.cos(pr.a || 0) * 12, 3.5, pr.y + Math.sin(pr.a || 0) * 12), rot, s.set(4, 7, 4));
      propMetal.push(m4);
    } else if (pr.type === 'light') {
      // tiang lampu jalan + armatur
      m4.compose(v.set(pr.x, 0, pr.y), q, s.set(1.1, 42, 1.1));
      propMetal.push(m4);
    }
  }
  // hidran, tempat sampah, haltebus, planter di trotoar tiap persimpangan
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const cx = i * C, cz = j * C;
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      corners.forEach(([sx, sz], idx) => {
        const px = cx + sx * (RW / 2 + 16);
        const pz = cz + sz * (RW / 2 + 16);
        const roll = (i * 7 + j * 13 + idx) % 5;
        if (roll === 0) {
          m4.compose(v.set(px, 6, pz), q, s.set(5, 12, 5));
          propRed.push(m4);
          m4.compose(v.set(px, 13, pz), q, s.set(7, 3, 7));
          propRed.push(m4);
        } else if (roll === 1) {
          m4.compose(v.set(px, 9, pz), q, s.set(5.5, 18, 5.5));
          propGreen.push(m4);
          m4.compose(v.set(px, 19, pz), q, s.set(6.5, 2.5, 6.5));
          propGreen.push(m4);
        } else if (roll === 2) {
          m4.compose(v.set(px, 16, pz), q, s.set(80, 5, 10));
          propBoard.push(m4);
          m4.compose(v.set(px - 30, 8, pz), q, s.set(5, 16, 5));
          propMetal.push(m4);
          m4.compose(v.set(px + 30, 8, pz), q, s.set(5, 16, 5));
          propMetal.push(m4);
        }
      });
    }
  }
  propWood.end(); propMetal.end(); propRed.end(); propGreen.end(); propBoard.end(); benchSeat.end();

  // ---------- lampu lalu lintas (tiang + lampu merah/hijau) ----------
  const tlPole = new ShapePool(group, new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshLambertMaterial({ color: 0x2f3238 }), 400);
  const tlBox = new ShapePool(group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x1e2228 }), 400);
  const tlRed = new SignalPool(group, new THREE.SphereGeometry(2.6, 8, 6), 400, 0xff2a1a);
  const tlGreen = new SignalPool(group, new THREE.SphereGeometry(2.6, 8, 6), 400, 0x39ff7a);
  const tlPositions = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const cx = i * C, cz = j * C;
      for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        const px = cx + sx * (RW / 2 + 12);
        const pz = cz + sz * (RW / 2 + 12);
        tlPositions.push([px, pz, sx < 0 && sz < 0]);
        m4.compose(v.set(px, 22, pz), q, s.set(2.2, 44, 2.2));
        tlPole.push(m4);
        m4.compose(v.set(px, 46, pz), q, s.set(8, 20, 6));
        tlBox.push(m4);
      }
    }
  }
  tlPole.end(); tlBox.end();

  // ---------- pencahayaan ----------
  const hemi = new THREE.HemisphereLight(0xbcd4f0, 0x2b3a2a, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d0, 1.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.near = 10; sc.far = 900;
  sc.left = -320; sc.right = 320; sc.top = 320; sc.bottom = -320;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);

  scene.fog = new THREE.Fog(0x9fb4c8, 260, 1500);

  const state = { t: 0, tlPhase: -1 };
  const windowCount = winPool.mesh.count;
  // Permute window order once, so lower draw counts retain windows in every district.
  const sourceWindows=winPool.mesh.instanceMatrix.array.slice();
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  let stride=Math.max(1,Math.floor(windowCount*.618));
  while(gcd(stride,windowCount)!==1)stride++;
  for(let i=0;i<windowCount;i++) {
    const j=i*stride%windowCount;
    winPool.mesh.instanceMatrix.array.set(sourceWindows.subarray(i*16,i*16+16),j*16);
  }
  for(const b of buildingRefs)for(const ref of b.winRefs)if(ref)ref.idx=ref.idx*stride%windowCount;
  winPool.mesh.instanceMatrix.needsUpdate=true;

  // ganti fase lampu lalu lintas: merah/hijau swap
  function setTrafficPhase(phase) {
    tlRed.clear(); tlGreen.clear();
    for (const [px, pz, ns] of tlPositions) {
      const nsGreen = phase === 0;            // 0 = jalur utara-selatan hijau
      const greenOn = ns ? nsGreen : !nsGreen;
      // lampu mati Disembunyikan (skala 0)
      const on = 1, off = 0.0001;
      m4.compose(v.set(px, 44, pz), q, s.set(on, on, on));
      tlGreen.add(m4);
      m4.compose(v.set(px, 53, pz), q, s.set(on, on, on));
      tlRed.add(m4);
      // tukar: yang mati di-scale 0
      const g = tlGreen.items.pop();
      const r = tlRed.items.pop();
      if (greenOn) { g.scale(new THREE.Vector3(on, on, on)); r.scale(new THREE.Vector3(off, off, off)); }
      else { g.scale(new THREE.Vector3(off, off, off)); r.scale(new THREE.Vector3(on, on, on)); }
      tlGreen.items.push(g); tlRed.items.push(r);
    }
    tlRed.commit(); tlGreen.commit();
  }
  setTrafficPhase(0);

  return {
    group,
    sky,
    sun,
    hemi,
    ambient,
    buildingRefs,
    wallPool,
    setTrafficPhase,
    pools: { winPool, doorPool, zebraPool, tlRed, tlGreen, neonPools },
    /** Turunin detail dunia buat HP: PROJECTED buildings, props, awan. */
    setQuality(q) {
      quality = q;
      // awan
      cloudMesh.count = Math.min(clouds.length, q.clouds ?? 46);
      cloudMesh.visible = cloudMesh.count > 0;
      winPool.mesh.count = Math.floor(windowCount * (q.windows ?? 1));

    },
    /** Update siklus siang/malam + posisi shadow mengikuti pemain */
    /**
     * Update siklus siang/malam + fade gedung yang nutupin kamera.
     * @param {THREE.Vector3} camPos posisi kamera
     * @param {{x:number,z:number}} focus posisi pemain
     */
    update(dt, focus, camPos, blockedRect, weather = 0) {
      state.t += dt;
      // 1 siklus = 30 menit, mulai dari sore (selalu cukup terang buat main)
      const day = (window.__timeOfDay !== undefined && window.__timeOfDay !== null)
        ? window.__timeOfDay
        : ((Date.now() / 1000 / 1800) + 0.22) % 1;
      const ang = day * Math.PI * 2;
      const height = Math.sin(ang);
      const daylight = Math.max(.4, Math.min(1, height * 1.4 + 0.45));
      sun.intensity = 0.22 + daylight * 1.15;
      hemi.intensity = 0.34 + daylight * 0.46;
      ambient.intensity = 0.20 + daylight * 0.30;
      const sx = Math.cos(ang) * 400;
      const sy = Math.max(420, height * 420 + 420);
      if (focus) {
        sun.position.set(focus.x + sx * 0.5, sy, focus.z + sx * 0.4);
        sun.target.position.set(focus.x, 0, focus.z);
        sun.target.updateMatrixWorld();
      }
      // jendela gedung: gelap pas siang, nyala hangat pas malem
      const glow = 1 - Math.min(1, Math.max(0, (daylight - 0.35) / 0.5));
      winMat.color.setRGB(
        0.17 + glow * 0.83,
        0.24 + glow * 0.67,
        0.32 + glow * 0.21
      );

      // warna langit & kabut (hujan = abu-abu + kabut lebih rapat)
      const wet = weather === 2 ? 1 : 0;
      const cloudy = weather >= 1 ? 1 : 0;
      const light = (0.22 + daylight * 0.5) * (1 - wet * 0.28 - cloudy * 0.08);
      scene.fog.color.setHSL(0.58 - wet * 0.04, 0.22 - wet * 0.14, light);
      scene.background = scene.fog.color;
      if (wet) {
        scene.fog.near = 150; scene.fog.far = 850;
        sun.intensity *= 0.55;
        hemi.intensity *= 0.8;
      } else {
        scene.fog.near = 260; scene.fog.far = 1450;
      }

      // langit & bintang ngikutin kamera
      const cp = camPos || { x: 0, y: 0, z: 0 };
      sky.position.set(cp.x, 0, cp.z);
      // langit berubah warna mengikuti waktu (biru -> jingga -> gelap)
      const dusk = Math.max(0, 1 - Math.abs(daylight - 0.5) * 2.6);
      sky.material.color.setRGB(
        0.28 + daylight * 0.72,
        0.34 + daylight * 0.66 - dusk * 0.12,
        0.52 + daylight * 0.48 - dusk * 0.22
      );
      stars.position.set(cp.x, 0, cp.z);
      stars.material.opacity = Math.max(0, 1 - daylight * 1.5);

      // posisi matahari / bulan di langit
      const sunDirX = Math.cos(ang);
      const sunDirY = height;
      sunSprite.position.set(cp.x + sunDirX * 2600, Math.max(-400, sunDirY * 2600), cp.z + sunDirX * 900);
      sunSprite.material.opacity = Math.max(0, Math.min(1, (daylight - 0.25) * 2.2));
      moonSprite.position.set(cp.x - sunDirX * 2600, Math.max(-400, -sunDirY * 2600), cp.z - sunDirX * 900);
      moonSprite.material.opacity = Math.max(0, Math.min(1, (0.5 - daylight) * 2.4));

      // awan geser pelan
      for (let i = 0; i < cloudMesh.count; i++) {
        const c = clouds[i];
        c.x += c.v * dt;
        if (c.x > 1500) c.x = -1500;
        cm4.compose(
          new THREE.Vector3(c.x, c.y, c.z),
          new THREE.Quaternion(),
          new THREE.Vector3(c.s, c.s * 0.28, c.s * 0.8)
        );
        cloudMesh.setMatrixAt(i, cm4);
      }
      cloudMesh.instanceMatrix.needsUpdate = true;

      // wall-fade: gedung yang nutupin pandangan kamera jadi transparan (dither)
      if (camPos && focus) {
        const cands = [];
        for (const b of buildingRefs) {
          let target = 1;
          // gedung yang ngehalangin kamera (pull-in collision) -> transparan
          if (blockedRect && b.rect.x === blockedRect.x && b.rect.y === blockedRect.y) {
            target = 0.15;
          } else {
            const cx = b.rect.x + b.rect.w / 2;
            const cz = b.rect.y + b.rect.h / 2;
            if (Math.abs(cx - focus.x) < 650 && b.H > camPos.y * 0.45) {
              const pad = 3;
              const r = { x: b.rect.x - pad, y: b.rect.y - pad, w: b.rect.w + pad * 2, h: b.rect.h + pad * 2 };
              if (segHitsRect(camPos.x, camPos.z, focus.x, focus.z, r)) {
                // jarak gedung dari kamera (buang yg jauh di belakang)
                const t = segParam(camPos.x, camPos.z, focus.x, focus.z, cx, cz);
                if (t > 0.02 && t < 0.98) cands.push({ b, t });
              }
            }
          }
          b.target = target;
        }
        // fade maksimal 2 gedung paling dekat sama kamera
        cands.sort((a, c) => a.t - c.t);
        for (let i = 0; i < Math.min(2, cands.length); i++) cands[i].b.target = 0.15;

        for (const b of buildingRefs) {
          const target = b.target ?? 1;
          if (b.alpha === target) continue;
          // transisi halus biar nggak "pop"
          b.alpha += (target - b.alpha) * Math.min(1, dt * 18);
          if (Math.abs(b.alpha - target) < 0.004) b.alpha = target;
          wallPool.setAlpha(b.ref, b.alpha);
          if (b.roofRef !== null) roofPool.setAlpha(b.roofRef, b.alpha);
          for (const ar of b.acRefs) acPool.setAlpha(ar, b.alpha);
          for (const wr of b.winRefs || []) winPool.setAlpha(wr, b.alpha);
          for (const dr of b.doorRefs || []) doorPool.setAlpha(dr, b.alpha);
          for (const nr of b.neonRefs || []) if (nr.pool) nr.pool.setAlpha(nr, b.alpha);
        }
      }
      return { daylight, night: 1 - daylight };
    },
  };
}

/** Parameter t (0..1) titik terdekat segmen dgn titik (px,pz). */
function segParam(x0, z0, x1, z1, px, pz) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return 0;
  return ((px - x0) * dx + (pz - z0) * dz) / len2;
}

/** True kalau segmen (x0,z0)-(x1,z1) melewati rect. */
function segHitsRect(x0, z0, x1, z1, r) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tmin = 0;
  let tmax = 1;
  for (const [p, q] of [[-dx, x0 - r.x], [dx, r.x + r.w - x0], [-dz, z0 - r.y], [dz, r.y + r.h - z0]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) { if (t > tmin) tmin = t; }
      else { if (t < tmax) tmax = t; }
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/** Cerahkan warna hex (untuk tampilan 3D yang lebih cerah). */
function brighten(hex, k) {
  const c = hex.replace('#', '');
  const num = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  const r = Math.min(255, Math.round(((num >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((num >> 8) & 255) * k));
  const b = Math.min(255, Math.round((num & 255) * k));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
