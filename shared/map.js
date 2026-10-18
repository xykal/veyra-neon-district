// Generator peta kota. Deterministik (seeded) => server & client bikin peta yang sama persis.

export const WORLD = { size: 4800 };
export const CELL = 600;            // jarak antar persimpangan
export const ROAD_W = 96;           // lebar jalan
export const SIDEWALK = 22;         // lebar trotoar

export const COLORS = {
  grass: '#28422c',
  grassDark: '#223a27',
  sidewalk: '#6d6f74',
  sidewalkEdge: '#7b7d82',
  asphalt: '#33343a',
  asphaltLine: '#d8d8c0',
  laneDash: '#e2e2c8',
  water: '#1d4e79',
  waterShallow: '#2a6ea3',
  park: '#2f5c34',
  parkPath: '#7d7a63',
  lot: '#3c3d43',
  lotLine: '#8a8b90',
};

const BUILDING_COLORS = [
  '#7a6a58', '#6e7a86', '#8a6f6f', '#5f6b5f', '#7d7466',
  '#5c5f70', '#8b8172', '#6b5b6b', '#747a72', '#8a7a63',
];
const ROOF_COLORS = ['#3a3a40', '#45464d', '#33343a', '#4a4b52', '#2f3036'];
const SHOP_COLORS = ['#9b4a3f', '#3f6b9b', '#4f9b63', '#9b8b3f', '#6b3f9b', '#3f9b9b'];

/** PRNG sederhana & deterministik */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function subdivide(x, y, w, h, rnd, depth, out) {
  const bigEnough = w > 230 || h > 230;
  const area = w * h;
  const stopChance = area > 60000 ? 0.05 : area > 25000 ? 0.13 : 0.28;
  if (depth >= 3 || !bigEnough || rnd() < stopChance) {
    out.push({ x, y, w, h });
    return;
  }
  const vertical = w > h ? rnd() < 0.8 : rnd() < 0.2;
  const ratio = 0.38 + rnd() * 0.24;
  if (vertical) {
    const cut = Math.max(90, w * ratio);
    subdivide(x, y, cut, h, rnd, depth + 1, out);
    subdivide(x + cut, y, w - cut, h, rnd, depth + 1, out);
  } else {
    const cut = Math.max(90, h * ratio);
    subdivide(x, y, w, cut, rnd, depth + 1, out);
    subdivide(x, y + cut, w, h - cut, rnd, depth + 1, out);
  }
}

function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

/**
 * Bangun peta kota.
 * @returns {object} map
 */
export function buildMap(seed = 20251018) {
  const rnd = mulberry32(seed);
  const S = WORLD.size;
  const n = S / CELL; // 8x8 blok

  const roads = [];
  const sidewalks = [];
  const buildings = [];
  const parks = [];
  const lots = [];
  const water = [];
  const trees = [];
  const props = [];
  const spawns = [];

  // Jalan vertikal & horizontal (dRAW rect panjang, berimpit di persimpangan)
  for (let i = 0; i <= n; i++) {
    const p = i * CELL;
    roads.push({ x: p - ROAD_W / 2, y: -60, w: ROAD_W, h: S + 120, dir: 'v', line: i });
    roads.push({ x: -60, y: p - ROAD_W / 2, w: S + 120, h: ROAD_W, dir: 'h', line: i });
  }

  // Layout manual supaya kota terlihat "dirancang", bukan acak
  const waterCells = new Set(['6,1', '1,6']);
  const parkCells = new Set(['2,2', '4,5', '0,4', '5,6']);
  const lotCells = new Set(['3,1', '5,3', '1,2', '6,4']);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const key = `${i},${j}`;
      const bx = i * CELL + ROAD_W / 2;
      const by = j * CELL + ROAD_W / 2;
      const bw = CELL - ROAD_W;
      const bh = CELL - ROAD_W;

      // trotoar mengelilingi blok
      sidewalks.push({ x: bx, y: by, w: bw, h: bh });

      const ix = bx + SIDEWALK;
      const iy = by + SIDEWALK;
      const iw = bw - SIDEWALK * 2;
      const ih = bh - SIDEWALK * 2;

      if (waterCells.has(key)) {
        water.push({ x: ix, y: iy, w: iw, h: ih });
        continue;
      }

      if (parkCells.has(key)) {
        const p = { x: ix, y: iy, w: iw, h: ih };
        parks.push(p);
        // jalur silang
        props.push({ type: 'path', x: ix, y: iy + ih / 2 - 10, w: iw, h: 20 });
        props.push({ type: 'path', x: ix + iw / 2 - 10, y: iy, w: 20, h: ih });
        const count = 16;
        for (let t = 0; t < count; t++) {
          const tx = ix + 18 + rnd() * (iw - 36);
          const ty = iy + 18 + rnd() * (ih - 36);
          // jangan taruh pohon di jalur
          const onPath = Math.abs(tx - (ix + iw / 2)) < 22 || Math.abs(ty - (iy + ih / 2)) < 22;
          if (!onPath) trees.push({ x: tx, y: ty, r: 12 + rnd() * 9, tone: pick(rnd, ['#1f4a26', '#2a5c2f', '#183d20']) });
        }
        // bangku
        for (let b = 0; b < 4; b++) {
          props.push({ type: 'bench', x: ix + 40 + rnd() * (iw - 80), y: iy + 40 + rnd() * (ih - 80), a: rnd() * Math.PI });
        }
        continue;
      }

      if (lotCells.has(key)) {
        const l = { x: ix, y: iy, w: iw, h: ih };
        lots.push(l);
        // marka parkir
        const rows = 3;
        for (let r = 0; r < rows; r++) {
          const ly = iy + (ih / rows) * r + 14;
          props.push({ type: 'stall', x: ix + 14, y: ly, w: iw - 28, h: 30 });
        }
        continue;
      }

      // Blok bangunan
      const plots = [];
      subdivide(ix, iy, iw, ih, rnd, 0, plots);
      for (const p of plots) {
        const gap = 5;
        const bw2 = Math.max(28, p.w - gap);
        const bh2 = Math.max(28, p.h - gap);
        const area = bw2 * bh2;
        let style;
        if (area > 60000) style = 'tower';
        else if (area > 22000) style = 'mid';
        else style = 'shop';

        const b = {
          x: p.x + gap / 2,
          y: p.y + gap / 2,
          w: bw2,
          h: bh2,
          style,
          color: style === 'shop' ? pick(rnd, SHOP_COLORS) : pick(rnd, BUILDING_COLORS),
          roof: pick(rnd, ROOF_COLORS),
          height: style === 'tower' ? 22 + rnd() * 40 : style === 'mid' ? 10 + rnd() * 18 : 4 + rnd() * 8,
        };
        buildings.push(b);

        // detail atap
        if (style !== 'shop' && rnd() < 0.55) {
          props.push({
            type: 'ac',
            x: b.x + b.w * (0.2 + rnd() * 0.4),
            y: b.y + b.h * (0.2 + rnd() * 0.4),
            w: 12 + rnd() * 16,
            h: 10 + rnd() * 12,
          });
        }
      }
    }
  }

  // Lampu jalan di sudut persimpangan
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const cx = i * CELL;
      const cy = j * CELL;
      const o = ROAD_W / 2 + 10;
      props.push({ type: 'light', x: cx - o, y: cy - o });
      props.push({ type: 'light', x: cx + o, y: cy + o });
    }
  }

  // Titik spawn: di trotoar dekat persimpangan
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = i * CELL + CELL / 2;
      const cy = j * CELL + CELL / 2;
      spawns.push({ x: cx, y: cy });
    }
  }

  // Pohon acak di tepi trotoar kota
  for (let k = 0; k < 120; k++) {
    const onRoadLine = Math.floor(rnd() * (n + 1));
    const along = rnd() * S;
    const side = rnd() < 0.5 ? -1 : 1;
    const off = ROAD_W / 2 + 6;
    if (rnd() < 0.5) {
      const x = onRoadLine * CELL + side * off;
      const y = along;
      if (!inWater(x, y, water)) trees.push({ x, y, r: 9 + rnd() * 5, tone: pick(rnd, ['#24512b', '#2b5f32']) });
    } else {
      const x = along;
      const y = onRoadLine * CELL + side * off;
      if (!inWater(x, y, water)) trees.push({ x, y, r: 9 + rnd() * 5, tone: pick(rnd, ['#24512b', '#2b5f32']) });
    }
  }

  // Blocker untuk tabrakan: bangunan + air (+ trotoar dibatasi tangan)
  const blockers = [];
  for (const b of buildings) blockers.push({ x: b.x, y: b.y, w: b.w, h: b.h, top:Math.max(14,b.height*8) });
  for (const w of water) blockers.push({ x: w.x, y: w.y, w: w.w, h: w.h });

  // ---- POI (tujuan GPS) ----
  const POI_DEFS = [
    ['bank', 'Bank Sentosa', 3],
    ['bank', 'Bank Makmur', 17],
    ['hospital', 'RS Sejahtera', 6],
    ['hospital', 'Puskesmas Kota', 22],
    ['police', 'Markas Polisi', 10],
    ['police', 'Pos Jaga Malam' , 41],
    ['hotel', 'Hotel Grand Sempurna', 14],
    ['hotel', 'Hotel Merpati', 33],
    ['cafe', 'Kafe Senja', 26],
    ['cafe', 'Kopi Tiang', 45],
    ['resto', 'Warung Pak Kumis', 8],
    ['resto', 'Restoran Pagi', 37],
    ['market', 'Pasar Kita', 19],
    ['market', 'Pasar Fresh', 52],
    ['gas', 'SPBU Maju', 29],
    ['gas', 'SPBU Nusantara', 58],
    ['park', 'Taman Kota', 12],
    ['park', 'Taman Rindang', 47],
    ['kantor', 'Kantor Wali Kota', 21],
    ['sekolah', 'Sekolah Bahasa', 34],
    ['gudang', 'Gudang Logistik', 44],
    ['bengkel', 'Bengkel Otomotif', 60],
  ];
  const pois = [];
  for (let k = 0; k < POI_DEFS.length; k++) {
    const [type, name, bi] = POI_DEFS[k];
    const s = sidewalks[bi % sidewalks.length];
    if (!s) continue;
    pois.push({
      id: k,
      type,
      name,
      x: s.x + 12,
      y: s.y + s.h / 2,
      block: { x: s.x, y: s.y, w: s.w, h: s.h },
    });
  }

  // Ground-contact props are distinct from building/water blockers used by GPS.
  // Rendering and these footprints must agree at every graphics tier.
  const solidProps = [];
  const box = (x,y,w,h,kind) => solidProps.push({x:x-w/2,y:y-h/2,w,h,kind});
  for (const tree of trees) { const r=tree.r*.182; box(tree.x,tree.y,2*r,2*r,'tree'); }
  for (const pr of props) {
    if(pr.type==='light') box(pr.x,pr.y,2.8,2.8,'pole');
    if(pr.type==='bench') { const a=pr.a||0,w=Math.abs(Math.cos(a))*20+Math.abs(Math.sin(a))*6,h=Math.abs(Math.sin(a))*20+Math.abs(Math.cos(a))*6; box(pr.x,pr.y,w,h,'bench'); }
  }
  for(let i=0;i<=n;i++)for(let j=0;j<=n;j++) {
    const cx=i*CELL,cy=j*CELL;
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy],idx)=>{
      const x=cx+sx*(ROAD_W/2+16),y=cy+sy*(ROAD_W/2+16),kind=(i*7+j*13+idx)%5;
      if(kind===0)box(x,y,9.1,9.1,'hydrant');
      if(kind===1)box(x,y,8.45,8.45,'bin');
      if(kind===2){box(x-17.5,y,3,3,'bus-stop');box(x+17.5,y,3,3,'bus-stop');}
    });
    for(const [sx,sy]of[[-1,-1],[1,1]])box(cx+sx*(ROAD_W/2+12),cy+sy*(ROAD_W/2+12),2.2,2.2,'signal');
  }
  const solids=[...blockers,...solidProps];
  const map = {
    seed,
    size: S,
    pois,
    cell: CELL,
    roadW: ROAD_W,
    roads,
    sidewalks,
    buildings,
    parks,
    lots,
    water,
    trees,
    props,
    spawns,
    blockers,
    solidProps,
    solids,
    solidGrid: buildGrid(solids, S),
    grid: buildGrid(blockers, S),
  };
  return map;
}

function inWater(x, y, water) {
  for (const w of water) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

/**
 * Rute jalan dari titik A ke titik B (mengikuti grid persimpangan kota).
 * Balikin array waypoint [{x,y}, ...] + panjang jalur (unit dunia).
 */
export function routeBetween(map, from, to) {
  const C = map.cell, n = Math.round(map.size / C);
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const clear = (a,b) => !map.blockers.some(r => routeIntersects(a,b,r));
  if (distance(from,to) < .1) return {points:[{x:from.x,y:from.y}],length:0};
  const attach = p => {
    const out = [];
    const x0 = Math.max(0,Math.min(n-1,Math.floor(p.x/C))), y0 = Math.max(0,Math.min(n-1,Math.floor(p.y/C)));
    for (const x of [x0*C,(x0+1)*C]) {
      const foot = {x,y:p.y};
      if (!clear(p,foot)) continue;
      for (const y of [y0*C,(y0+1)*C]) out.push({foot,node:{x,y}});
    }
    for (const y of [y0*C,(y0+1)*C]) {
      const foot = {x:p.x,y};
      if (!clear(p,foot)) continue;
      for (const x of [x0*C,(x0+1)*C]) out.push({foot,node:{x,y}});
    }
    return out;
  };
  let best = null;
  for(const a of attach(from)) for(const b of attach(to)) {
    const choices = [];
    // Same road: don't send a player around an intersection unnecessarily.
    if (a.foot.x === b.foot.x || a.foot.y === b.foot.y) {
      if (clear(a.foot,b.foot)) choices.push([from,a.foot,b.foot,to]);
    }
    choices.push([from,a.foot,a.node,{x:b.node.x,y:a.node.y},b.node,b.foot,to]);
    choices.push([from,a.foot,a.node,{x:a.node.x,y:b.node.y},b.node,b.foot,to]);
    for(const route of choices) {
      const points = route.filter((p,i) => !i || distance(p,route[i-1]) > .1).map(p=>({x:p.x,y:p.y}));
      let length=0;
      for(let i=1;i<points.length;i++) length+=distance(points[i-1],points[i]);
      if (!best || length<best.length) best={points,length};
    }
  }
  return best || {points:[{x:from.x,y:from.y}],length:distance(from,to),unreachable:true};
}
function routeIntersects(a,b,r) {
  let lo=0,hi=1;
  const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.w-a.x],[-dy,a.y-r.y],[dy,r.y+r.h-a.y]]) {
    if(p===0) {if(q<0)return false;}
    else {const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}
  }
  return true;
}

/** Spatial hash sederhana untuk query tabrakan */
function buildGrid(rects, size, cellSize = 300) {
  const grid = new Map();
  const cols = Math.ceil(size / cellSize);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const c0 = Math.max(0, Math.floor(r.x / cellSize));
    const c1 = Math.min(cols - 1, Math.floor((r.x + r.w) / cellSize));
    const r0 = Math.max(0, Math.floor(r.y / cellSize));
    const r1 = Math.min(cols - 1, Math.floor((r.y + r.h) / cellSize));
    for (let c = c0; c <= c1; c++) {
      for (let rr = r0; rr <= r1; rr++) {
        const k = c + ':' + rr;
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(i);
      }
    }
  }
  return { cellSize, cols, map: grid };
}

/** Ambil daftar blocker di sekitar titik */
export function nearbyBlockers(map,x,y,radius=80) { return queryGrid(map.blockers,map.grid,x,y,radius); }
export function nearbySolids(map,x,y,radius=80) { return queryGrid(map.solids || map.blockers,map.solidGrid || map.grid,x,y,radius); }
function queryGrid(rects,g,x,y,radius) {
  const c0 = Math.max(0, Math.floor((x - radius) / g.cellSize));
  const c1 = Math.min(g.cols - 1, Math.floor((x + radius) / g.cellSize));
  const r0 = Math.max(0, Math.floor((y - radius) / g.cellSize));
  const r1 = Math.min(g.cols - 1, Math.floor((y + radius) / g.cellSize));
  const seen = new Set();
  const out = [];
  for (let c = c0; c <= c1; c++) {
    for (let rr = r0; rr <= r1; rr++) {
      const arr = g.map.get(c + ':' + rr);
      if (!arr) continue;
      for (const idx of arr) {
        if (!seen.has(idx)) { seen.add(idx); out.push(rects[idx]); }
      }
    }
  }
  return out;
}

/** True kalau titik berada di dalam air (posisi terlarang) */
export function isWater(map, x, y) {
  for (const w of map.water) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

/** Jalan terdekat yang bisa dilalui mobil (untuk spawn & AI) */
export function randomRoadPoint(map, rnd, lane = 16) {
  const n = map.size / map.cell;
  for (let attempt = 0; attempt < 40; attempt++) {
    const line = Math.floor(rnd() * (n + 1));
    const along = 80 + rnd() * (map.size - 160);
    const vertical = rnd() < 0.5;
    const off = (rnd() < 0.5 ? -1 : 1) * lane;
    const x = vertical ? line * map.cell + off : along;
    const y = vertical ? along : line * map.cell + off;
    if (!isWater(map, x, y)) return { x:Math.max(30,Math.min(map.size-30,x)), y:Math.max(30,Math.min(map.size-30,y)), a: vertical ? (off>0 ? -Math.PI/2 : Math.PI/2) : (off>0 ? 0 : Math.PI) };
  }
  return { x: 100, y: 100, a: 0 };
}
