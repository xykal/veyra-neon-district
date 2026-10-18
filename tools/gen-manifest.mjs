#!/usr/bin/env node
/**
 * gen-manifest.mjs — bikin metadata model kendaraan dari file .glb (Kenney Car Kit).
 *
 * Nol dependency: parser GLB ditulis sendiri (header + chunk JSON + chunk BIN).
 * Dipakai buat auto-detect ukuran bodi, posisi roda, dan lampu depan/belakang
 * supaya manifest.json selalu sinkron sama file .glb.
 *
 * Jalankan:  node tools/gen-manifest.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAR_DIR = join(ROOT, 'public', 'assets', 'cars');
const OUT = join(CAR_DIR, 'manifest.json');

// ---------------------------------------------------------------- util matriks
function identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }

function mul(a, b) {
  // kolom-utama (column-major) seperti three.js
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function fromNode(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation || [0, 0, 0];
  const s = node.scale || [1, 1, 1];
  const q = node.rotation || [0, 0, 0, 1];
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  // quaternion -> matrix 3x3 (column-major)
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function xform(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

// ---------------------------------------------------------------- parser GLB
function parseGLB(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('bukan file GLB');
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  while (off < total) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('JSON chunk ga ketemu');
  return json;
}

function nodeMatrix(gltf, index, parent = identity()) {
  const node = gltf.nodes[index];
  const world = mul(parent, fromNode(node));
  const out = [];
  for (const c of node.children || []) out.push({ index: c, world });
  return out;
}

function walk(gltf, index, parent = identity(), visit) {
  const node = gltf.nodes[index];
  const world = mul(parent, fromNode(node));
  visit(node, world);
  for (const c of node.children || []) walk(gltf, c, world, visit);
}

function meshBox(gltf, meshIndex, world) {
  const mesh = gltf.meshes[meshIndex];
  if (!mesh) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.primitives || []) {
    const acc = gltf.accessors[prim.attributes.POSITION];
    if (!acc || !acc.min || !acc.max) continue;
    for (let i = 0; i < 8; i++) {
      const p = [
        i & 1 ? acc.max[0] : acc.min[0],
        i & 2 ? acc.max[1] : acc.min[1],
        i & 4 ? acc.max[2] : acc.min[2],
      ];
      const w = xform(world, p);
      for (let a = 0; a < 3; a++) {
        if (w[a] < min[a]) min[a] = w[a];
        if (w[a] > max[a]) max[a] = w[a];
      }
    }
  }
  if (!Number.isFinite(min[0])) return null;
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

// ---------------------------------------------------------------- analisis model
function analyze(file) {
  const buf = readFileSync(file);
  const gltf = parseGLB(buf);
  const scene = gltf.scenes[gltf.scene || 0];

  let body = null;
  const wheels = [];
  const lamps = [];

  for (const root of scene.nodes) {
    walk(gltf, root, identity(), (node, world) => {
      const origin = xform(world, [0, 0, 0]);
      const box = node.mesh !== undefined ? meshBox(gltf, node.mesh, world) : null;

      if (box) {
        // gabung bbox kerangka (tanpa roda) buat ukuran bodi
        const isWheel = /^wheel-/.test(node.name);
        if (!isWheel) {
          if (!body) body = { min: box.min.slice(), max: box.max.slice() };
          else {
            for (let a = 0; a < 3; a++) {
              body.min[a] = Math.min(body.min[a], box.min[a]);
              body.max[a] = Math.max(body.max[a], box.max[a]);
            }
          }
        } else {
          const sx = box.size[0], sy = box.size[1], sz = box.size[2];
          const radius = Math.max(sx, sy) / 2;
          wheels.push({
            node: node.name,
            at: origin.map((v) => +v.toFixed(4)),
            radius: +radius.toFixed(4),
            width: +Math.max(0.01, Math.min(sx, sy, sz) === sz ? sz : Math.min(sx, sy)).toFixed(4),
            steers: /front/.test(node.name),
          });
        }
      }

      // lampu: cari material bernama head/tail
      if (node.mesh !== undefined) {
        const mesh = gltf.meshes[node.mesh];
        for (const prim of mesh.primitives || []) {
          const mat = gltf.materials && gltf.materials[prim.material];
          const mn = (mat && mat.name) || '';
          if (mn === 'head' || mn === 'tail') {
            const b = meshBox(gltf, node.mesh, world);
            if (b) {
              const cx = (b.min[0] + b.max[0]) / 2;
              lamps.push({
                at: [+cx.toFixed(4), +((b.min[1] + b.max[1]) / 2).toFixed(4), +((b.min[2] + b.max[2]) / 2).toFixed(4)],
                facing: cx >= 0 ? 1 : -1,
                tail: mn === 'tail',
              });
            }
          }
        }
      }
    });
  }

  const size = body
    ? [body.max[0] - body.min[0], body.max[1] - body.min[1], body.max[2] - body.min[2]]
    : [1, 1, 1];
  return { size, wheels, lamps };
}

// ---------------------------------------------------------------- main
const PAINT = {
  sedan: 0x2f6fd0, sport: 0xf1c40f, truck: 0x6f7d8c, taxi: 0xf39c12,
  police: 0xeef2f7, tractor: 0x7cb342, van: 0x8e9aaf,
  ambulance: 0xe8f1f5, firetruck: 0xd0392b, garbage: 0x5d8a3a,
  delivery: 0xf5f0e1, suv: 0x2c3e50, luxury: 0x1b2631,
  supercar: 0xff2e63, kart: 0x16a085, shovel: 0xf39c12,
};

const SOURCE = {
  sedan: 'sedan', sport: 'sedan-sports', truck: 'truck', taxi: 'taxi',
  police: 'police', tractor: 'tractor', van: 'van', ambulance: 'ambulance',
  firetruck: 'firetruck', garbage: 'garbage-truck', delivery: 'delivery',
  suv: 'suv', luxury: 'suv-luxury', supercar: 'race', kart: 'kart-ooli',
  shovel: 'tractor-shovel',
};

const FILES = {
  bus: 'bus.glb',
  sedan: 'sedan.glb', sport: 'sport.glb', truck: 'pickup.glb', taxi: 'taxi.glb',
  police: 'police.glb', tractor: 'tractor.glb', van: 'van.glb',
  ambulance: 'ambulance.glb', firetruck: 'firetruck.glb', garbage: 'garbage-truck.glb',
  delivery: 'delivery.glb', suv: 'suv.glb', luxury: 'suv-luxury.glb',
  supercar: 'race.glb', kart: 'kart-ooli.glb', shovel: 'tractor-shovel.glb',
};

const cars = {};
if (existsSync(OUT)) {
  try {
    const prev = JSON.parse(readFileSync(OUT, 'utf8'));
    Object.assign(cars, prev.cars || {});
  } catch { /* file rusak, mulai ulang */ }
}

for (const [kind, file] of Object.entries(FILES)) {
  const path = join(CAR_DIR, file);
  if (!existsSync(path)) { console.log('skip (belum ada):', file); continue; }
  const a = analyze(path);
  cars[kind] = {
    file,
    source: SOURCE[kind] || kind,
    size: a.size.map((v) => +v.toFixed(4)),
    paint: PAINT[kind] ?? 0x9aa7b4,
    wheels: a.wheels.sort((w1, w2) => w1.node.localeCompare(w2.node)),
    lamps: a.lamps.sort((l1, l2) => l2.at[0] - l1.at[0]),
    plates: {
      front: { face: +(a.size[0] / 2).toFixed(4), height: 0.2375 },
      rear: { face: +(-a.size[0] / 2).toFixed(4), height: 0.3375 },
    },
    livery: kind === 'police' ? { x: [-0.435, 0.435], y: [0.495, 0.8], side: 0.55 } : null,
  };
  console.log(
    `${kind.padEnd(10)} size=${a.size.map((v) => v.toFixed(2)).join('x').padEnd(18)} ` +
    `roda=${a.wheels.length} lampu=${a.lamps.length}`
  );
}

writeFileSync(OUT, JSON.stringify({ cars }, null, 2));
console.log('\nmanifest ditulis ->', OUT);
