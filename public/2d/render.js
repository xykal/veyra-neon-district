// Renderer canvas: peta kota + entitas (pemain, mobil) + minimap.

import { CAR_TYPES } from '../../shared/constants.js';
import { COLORS } from '../../shared/map.js';
import { lerp, lerpAngle, clamp } from '../../shared/physics.js';

const INTERP_DELAY = 110; // ms

export class Renderer {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mm = minimap;
    this.mmctx = minimap.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 0.9, init: false };
    this.tracers = [];
    this.pulses = [];
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.time = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.w = w;
    this.h = h;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  addTracer(x0, y0, x1, y1) {
    this.tracers.push({ x0, y0, x1, y1, t: 0 });
    if (this.tracers.length > 60) this.tracers.shift();
  }

  addPulse(x, y, color = '#ff6b6b', r = 34) {
    this.pulses.push({ x, y, color, r, t: 0 });
  }

  // ------------------------------------------------------------ main draw

  draw(state, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const map = state.map;
    if (!map) return;

    // ---- entity data (interpolasi) ----
    const { players, cars, alpha } = this.interpolate(state);
    const me = players.find((p) => p.i === state.myId) || null;

    // ---- kamera ----
    if (!me) {
      // mode menu: kamera berputar pelan keliling kota
      if (!this.cam.init) { this.cam.x = map.size / 2; this.cam.y = map.size / 2; this.cam.init = true; }
      this.cam.x += 34 * dt;
      this.cam.y += 16 * dt;
      if (this.cam.x > map.size - 100) this.cam.x = 100;
      if (this.cam.y > map.size - 100) this.cam.y = 100;
    } else {
      let tx = me.x;
      let ty = me.y;
      if (state.aimTarget) { tx = state.aimTarget.x; ty = state.aimTarget.y; }
      if (!this.cam.init) { this.cam.x = tx; this.cam.y = ty; this.cam.init = true; }
      const follow = 1 - Math.pow(0.0016, dt);
      this.cam.x += (tx - this.cam.x) * follow;
      this.cam.y += (ty - this.cam.y) * follow;
    }
    this.cam.zoom += (state.zoom - this.cam.zoom) * Math.min(1, 10 * dt);

    const z = this.cam.zoom;
    const halfW = this.w / (2 * z);
    const halfH = this.h / (2 * z);
    const view = {
      x0: this.cam.x - halfW, x1: this.cam.x + halfW,
      y0: this.cam.y - halfH, y1: this.cam.y + halfH,
    };

    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);

    this.drawWorld(ctx, map, view);
    this.drawCars(ctx, cars, view, state);
    this.drawPlayers(ctx, players, state, view);
    this.drawEffects(ctx, dt);

    ctx.restore();
    this.drawMinimap(state, players, cars, map);
    this.drawVignette(ctx);
  }

  interpolate(state) {
    const cur = state.cur;
    const prev = state.prev;
    if (!cur) return { players: [], cars: [], alpha: 1 };
    const t = performance.now() - INTERP_DELAY;
    let alpha = 1;
    if (prev && state.curTime > state.prevTime) {
      alpha = clamp((t - state.prevTime) / (state.curTime - state.prevTime), 0, 1);
    }
    const prevP = new Map();
    const prevC = new Map();
    if (prev) {
      for (const p of prev.p) prevP.set(p.i, p);
      for (const c of prev.c) prevC.set(c.i, c);
    }
    const players = cur.p.map((p) => {
      const q = prevP.get(p.i);
      if (!q) return { ...p };
      return {
        ...p,
        x: lerp(q.x, p.x, alpha),
        y: lerp(q.y, p.y, alpha),
        a: lerpAngle(q.a, p.a, alpha),
      };
    });
    const cars = cur.c.map((c) => {
      const q = prevC.get(c.i);
      if (!q) return { ...c };
      return {
        ...c,
        x: lerp(q.x, c.x, alpha),
        y: lerp(q.y, c.y, alpha),
        a: lerpAngle(q.a, c.a, alpha),
        s: lerp(q.s, c.s, alpha),
      };
    });
    return { players, cars, alpha };
  }

  // ------------------------------------------------------------ world

  drawWorld(ctx, map, view) {
    // tanah
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(view.x0 - 40, view.y0 - 40, view.x1 - view.x0 + 80, view.y1 - view.y0 + 80);

    // tampalan rumput sedikit lebih gelap (tekstur)
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    const gs = 300;
    for (let x = Math.floor(view.x0 / gs) * gs; x < view.x1; x += gs) {
      for (let y = Math.floor(view.y0 / gs) * gs; y < view.y1; y += gs) {
        if ((x / gs + y / gs) % 2 === 0) ctx.fillRect(x, y, gs, gs);
      }
    }

    // air
    for (const w of map.water) {
      if (!overlap(w, view)) continue;
      ctx.fillStyle = COLORS.water;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = COLORS.waterShallow;
      ctx.fillRect(w.x, w.y, w.w, 8);
      ctx.fillRect(w.x, w.y, 8, w.h);
    }

    // trotoar
    ctx.fillStyle = COLORS.sidewalk;
    for (const s of map.sidewalks) {
      if (!overlap(s, view)) continue;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }

    // jalan
    ctx.fillStyle = COLORS.asphalt;
    for (const r of map.roads) {
      if (!overlap(r, view)) continue;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    // marka jalan (putih putus-putus di tengah, di tengah blok saja)
    ctx.fillStyle = COLORS.laneDash;
    const C = map.cell;
    const half = map.roadW / 2;
    for (let i = 0; i <= map.size / C; i++) {
      const p = i * C;
      // vertikal
      if (p + half > view.x0 && p - half < view.x1) {
        for (let j = 0; j < map.size / C; j++) {
          const y0 = j * C + 70;
          if (y0 > view.y1 || y0 + C - 140 < view.y0) continue;
          for (let y = y0; y < y0 + C - 140; y += 72) ctx.fillRect(p - 1.5, y, 3, 34);
        }
      }
      // horizontal
      if (p + half > view.y0 && p - half < view.y1) {
        for (let j = 0; j < map.size / C; j++) {
          const x0 = j * C + 70;
          if (x0 > view.x1 || x0 + C - 140 < view.x0) continue;
          for (let x = x0; x < x0 + C - 140; x += 72) ctx.fillRect(x, p - 1.5, 34, 3);
        }
      }
    }

    // taman
    for (const p of map.parks) {
      if (!overlap(p, view)) continue;
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }

    // parkir
    for (const l of map.lots) {
      if (!overlap(l, view)) continue;
      ctx.fillStyle = COLORS.lot;
      ctx.fillRect(l.x, l.y, l.w, l.h);
    }

    // properti (jalur taman, marka parkir, bangku)
    for (const pr of map.props) {
      if (pr.type === 'path') {
        if (!overlap(pr, view)) continue;
        ctx.fillStyle = COLORS.parkPath;
        ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
      } else if (pr.type === 'stall') {
        if (!overlap(pr, view)) continue;
        ctx.strokeStyle = COLORS.lotLine;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const step = 46;
        for (let x = pr.x; x <= pr.x + pr.w; x += step) {
          ctx.moveTo(x, pr.y);
          ctx.lineTo(x, pr.y + pr.h);
        }
        ctx.stroke();
      }
    }

    // bangunan (fake 3D)
    for (const b of map.buildings) {
      if (!overlap({ x: b.x, y: b.y - b.height, w: b.w, h: b.h + b.height }, view)) continue;
      const H = b.height;
      // bayangan
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      // dinding
      ctx.fillStyle = shade(b.color, -0.18);
      ctx.fillRect(b.x, b.y - H, b.w, b.h + H);
      // atap
      ctx.fillStyle = shade(b.color, -0.45);
      ctx.fillRect(b.x, b.y - H, b.w, b.h);
      // outline
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + 0.75, b.y - H + 0.75, b.w - 1.5, b.h - 1.5);
      // detail atap
      if (b.style !== 'shop') {
        ctx.fillStyle = shade(b.color, -0.30);
        ctx.fillRect(b.x + 5, b.y - H + 5, b.w - 10, b.h - 10);
      }
    }

    // AC unit di atap
    for (const pr of map.props) {
      if (pr.type !== 'ac') continue;
      if (!overlap(pr, view)) continue;
      ctx.fillStyle = '#8e9299';
      ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
    }

    // pohon
    for (const t of map.trees) {
      if (t.x < view.x0 - 30 || t.x > view.x1 + 30 || t.y < view.y0 - 30 || t.y > view.y1 + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.tone;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // lampu jalan
    for (const pr of map.props) {
      if (pr.type !== 'light') continue;
      if (pr.x < view.x0 - 20 || pr.x > view.x1 + 20 || pr.y < view.y0 - 20 || pr.y > view.y1 + 20) continue;
      const glow = 0.5 + 0.5 * Math.sin(this.time * 1.6 + pr.x * 0.01);
      ctx.fillStyle = `rgba(255,220,150,${0.25 + glow * 0.15})`;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9d2a0';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ cars

  drawCars(ctx, cars, view, state) {
    for (const c of cars) {
      if (c.x < view.x0 - 60 || c.x > view.x1 + 60 || c.y < view.y0 - 60 || c.y > view.y1 + 60) continue;
      const T = CAR_TYPES[c.y2] || CAR_TYPES.sedan;
      const len = T.len;
      const wid = T.wid;
      const braking = c.d && Math.abs(c.s) < 2;

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);

      // bayangan
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 5);
      ctx.fill();

      // bodi
      ctx.fillStyle = c.c || T.color;
      roundRect(ctx, -len / 2, -wid / 2, len, wid, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.4;
      roundRect(ctx, -len / 2, -wid / 2, len, wid, 5);
      ctx.stroke();

      // kaca depan & atap
      ctx.fillStyle = 'rgba(20,26,34,0.85)';
      roundRect(ctx, len * 0.02, -wid / 2 + 2.5, len * 0.22, wid - 5, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,38,48,0.7)';
      roundRect(ctx, -len * 0.28, -wid / 2 + 3, len * 0.3, wid - 6, 3);
      ctx.fill();

      // lampu
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(len / 2 - 3, -wid / 2 + 2, 3, 4);
      ctx.fillRect(len / 2 - 3, wid / 2 - 6, 3, 4);
      ctx.fillStyle = braking ? '#ff3b30' : 'rgba(150,30,30,0.7)';
      ctx.fillRect(-len / 2, -wid / 2 + 2, 3, 4);
      ctx.fillRect(-len / 2, wid / 2 - 6, 3, 4);

      if (c.y2 === 'police') {
        const flash = Math.floor(this.time * 8) % 2 === 0;
        ctx.fillStyle = flash ? '#ff3b30' : '#3b82f6';
        ctx.fillRect(-3, -wid / 2 + 1, 6, 4);
        ctx.fillStyle = flash ? '#3b82f6' : '#ff3b30';
        ctx.fillRect(-3, wid / 2 - 5, 6, 4);
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(-len / 2 + 1, -wid / 2 + 1, len - 2, 2);
      }
      if (c.y2 === 'taxi') {
        ctx.fillStyle = '#111';
        ctx.fillRect(-5, -4, 10, 8);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(-3, -2, 6, 4);
      }
      ctx.restore();

      // nama driver's di atas mobil
      const drv = state.playerById ? state.playerById(c.d) : null;
      if (drv) {
        ctx.font = '600 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText(drv.n, c.x + 1, c.y - wid / 2 - 9);
        ctx.fillStyle = '#ffd9a0';
        ctx.fillText(drv.n, c.x, c.y - wid / 2 - 10);
      }
    }
  }

  // ------------------------------------------------------------ players

  drawPlayers(ctx, players, state, view) {
    for (const p of players) {
      if (p.x < view.x0 - 60 || p.x > view.x1 + 60 || p.y < view.y0 - 60 || p.y > view.y1 + 60) continue;
      if (p.d) {
        // marker kubur
        ctx.fillStyle = 'rgba(255,80,80,0.5)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const isMe = p.i === state.myId;
      const aim = isMe && state.aimAngle !== null ? state.aimAngle : p.a;
      const inCar = !!p.v;

      if (!inCar) {
        // bayangan
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.ellipse(p.x + 3, p.y + 5, 13, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // senjata
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(aim);
        ctx.fillStyle = '#22262c';
        ctx.fillRect(8, -2, 13, 4);
        ctx.restore();

        // badan
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // kepala
        ctx.fillStyle = '#e8c39e';
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(aim) * 3, p.y + Math.sin(aim) * 3, 6.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // nama
      ctx.font = `${isMe ? '700' : '600'} 12px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      const ny = p.y - 22;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillText(p.n, p.x + 1, ny + 1);
      ctx.fillStyle = isMe ? '#ffd166' : '#ffffff';
      ctx.fillText(p.n, p.x, ny);

      // bar HP
      if (p.h < 100) {
        const w = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(p.x - w / 2, ny + 4, w, 4);
        ctx.fillStyle = p.h > 50 ? '#59d98a' : p.h > 25 ? '#ffb347' : '#ff4d4d';
        ctx.fillRect(p.x - w / 2, ny + 4, (w * Math.max(0, p.h)) / 100, 4);
      }
    }
  }

  drawEffects(ctx, dt) {
    // jejak peluru
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      if (t.t > 0.13) { this.tracers.splice(i, 1); continue; }
      const a = 1 - t.t / 0.13;
      ctx.strokeStyle = `rgba(255,240,170,${a * 0.9})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
    }
    // denyut
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t += dt;
      if (p.t > 0.45) { this.pulses.splice(i, 1); continue; }
      const k = p.t / 0.45;
      ctx.strokeStyle = p.color.replace(')', `,${1 - k})`).replace('rgb', 'rgba');
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.3 + k), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ minimap

  drawMinimap(state, players, cars, map) {
    const ctx = this.mmctx;
    const size = this.mm.width;
    const zoom = 0.3;
    const cx = state.myId != null && players.find((p) => p.i === state.myId)
      ? players.find((p) => p.i === state.myId).x : map.size / 2;
    const cy = state.myId != null && players.find((p) => p.i === state.myId)
      ? players.find((p) => p.i === state.myId).y : map.size / 2;
    const scale = zoom;
    const viewW = size / scale;
    const x0 = cx - viewW / 2;
    const y0 = cy - viewW / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#16241a';
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-x0, -y0);

    const view = { x0, y0, x1: x0 + viewW, y1: y0 + viewW };

    ctx.fillStyle = COLORS.water;
    for (const w of map.water) if (overlap(w, view)) ctx.fillRect(w.x, w.y, w.w, w.h);

    ctx.fillStyle = '#7b7d84';
    for (const r of map.roads) if (overlap(r, view)) ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.fillStyle = '#4a4b52';
    for (const b of map.buildings) if (overlap(b, view)) ctx.fillRect(b.x, b.y, b.w, b.h);

    // mobil
    for (const c of cars) {
      if (c.x < view.x0 || c.x > view.x1 || c.y < view.y0 || c.y > view.y1) continue;
      ctx.fillStyle = c.d ? '#ff9f43' : 'rgba(200,200,205,0.75)';
      ctx.fillRect(c.x - 7, c.y - 4, 14, 8);
    }
    // pemain
    for (const p of players) {
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.i === state.myId ? 11 : 8, 0, Math.PI * 2);
      ctx.fill();
      if (p.i === state.myId) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    ctx.restore();

    // garis pinggiran
    ctx.strokeStyle = 'rgba(255,179,71,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  drawVignette(ctx) {
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.42, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}

function overlap(r, view) {
  return r.x + r.w > view.x0 && r.x < view.x1 && r.y + r.h > view.y0 && r.y < view.y1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shade(hex, amt) {
  const c = hex.replace('#', '');
  const num = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  const f = (v) => Math.round(clamp(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
