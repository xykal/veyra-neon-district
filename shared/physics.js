// Fisika & tabrakan. Dipakai server (authoritative) dan client (fallback mode offline).

import { nearbyBlockers } from './map.js';
import { CAR_TYPES, PLAYER_RADIUS, WALK_SPEED, SPRINT_SPEED } from './constants.js';

/** Dorong lingkaran keluar dari rect (axis-aligned). Return {x,y,hit}. */
export function resolveCircleRect(px, py, r, rect) {
  const nx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  const dx = px - nx;
  const dy = py - ny;
  const d2 = dx * dx + dy * dy;

  if (d2 > r * r) return null;

  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = r - d;
    return { x: px + (dx / d) * push, y: py + (dy / d) * push, nx: dx / d, ny: dy / d, depth: push };
  }
  // pusat di dalam rect: dorong ke sisi terdekat
  const left = px - rect.x;
  const right = rect.x + rect.w - px;
  const top = py - rect.y;
  const bottom = rect.y + rect.h - py;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: py, nx: -1, ny: 0, depth: r + left };
  if (m === right) return { x: rect.x + rect.w + r, y: py, nx: 1, ny: 0, depth: r + right };
  if (m === top) return { x: px, y: rect.y - r, nx: 0, ny: -1, depth: r + top };
  return { x: px, y: rect.y + rect.h + r, nx: 0, ny: 1, depth: r + bottom };
}

/** Gerakkan karakter berjalan, tabrak buildings/water. */
export function stepPlayer(p, input, dt, map) {
  let mx = input.mx || 0;
  let my = input.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }

  const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  const tx = mx * speed;
  const ty = my * speed;

  // akselerasi halus supaya ga "nyendat"
  const accel = 18;
  p.vx += (tx - p.vx) * Math.min(1, accel * dt);
  p.vy += (ty - p.vy) * Math.min(1, accel * dt);

  let nx = p.x + p.vx * dt;
  let ny = p.y + p.vy * dt;

  const rects = nearbyBlockers(map, nx, ny, PLAYER_RADIUS + 90);
  for (const r of rects) {
    const res = resolveCircleRect(nx, ny, PLAYER_RADIUS, r);
    if (res) {
      nx = res.x; ny = res.y;
      const vn = p.vx * res.nx + p.vy * res.ny;
      if (vn < 0) { p.vx -= vn * res.nx; p.vy -= vn * res.ny; }
    }
  }

  p.x = clamp(nx, 10, map.size - 10);
  p.y = clamp(ny, 10, map.size - 10);

  if (len > 0.05) p.a = Math.atan2(my, mx);
  p.moving = len > 0.05;
}

/**
 * Fisika mobil: model ""bicycle model" + slip lateral.
 * Mobil punya vektor kecepatan (vx,vy) terpisah dari arah bodi (a),
 * jadi bisa SLIP (drift) kalo rem tangan / cengkeram tipis.
 */
export function stepCar(car, input, dt, map, wet = false) {
  const T = CAR_TYPES[car.type] || CAR_TYPES.sedan;
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  const handbrake = !!input.handbrake;

  const maxS = car.maxSpeed || T.maxSpeed;
  const baseAccel = T.accel * (car.type === 'police' ? 1.05 : 1) * (wet ? 0.88 : 1);

  // ---------- komponen kecepatan (frame bodi) ----------
  const ca = Math.cos(car.a), sa = Math.sin(car.a);
  let vx = car.vx !== undefined ? car.vx : ca * car.speed;
  let vy = car.vy !== undefined ? car.vy : sa * car.speed;
  let fwd = vx * ca + vy * sa;
  let lat = -vx * sa + vy * ca;

  // ---------- mesin & rem (longitudinal) ----------
  // torque turun seiring naiknya kecepatan (rasa mobil beneran)
  const ratio = clamp(Math.abs(fwd) / maxS, 0, 1);
  const torqueCurve = Math.max(0.16, 1 - Math.pow(ratio, 1.7));
  if (throttle > 0) {
    fwd += baseAccel * throttle * torqueCurve * dt;
  } else if (throttle < 0) {
    if (fwd > 5) fwd += T.brake * throttle * dt;
    else fwd += baseAccel * 0.5 * throttle * dt; // mundur
  }

  // drag + gesekan (rem tangan = cengkeraman hilang)
  const dragK = handbrake ? 1.9 : (Math.abs(throttle) < 0.05 ? 0.28 : 0.05);
  const qDrag = 0.0002;
  fwd -= (dragK * fwd + qDrag * fwd * Math.abs(fwd)) * dt;
  if (Math.abs(fwd) < 4 && Math.abs(throttle) < 0.05) fwd = 0;
  fwd = clamp(fwd, -maxS * 0.42, maxS);

  // ---------- kemudi ----------
  const speedFactor = Math.min(1, Math.abs(fwd) / 160);
  car.steerAngle += (steer - car.steerAngle) * Math.min(1, 8 * dt);
  const dir = fwd < -5 ? -1 : 1;
  let yawRate = car.steerAngle * T.turn * speedFactor * dir * (handbrake ? 1.4 : 1);
  // kalo udah melebar banget, ban kehilangan cengkeraman -> putarannya dikurangi
  if (Math.abs(lat) > Math.abs(fwd) * 0.75) yawRate *= 0.25;
  car.yawRate = yawRate;

  // ---------- slip lateral ----------
  // gaya ban di frame bodi: laju lateral dikikis (cengkeraman), rem tangan = licin
  // cengkeraman ban: gede = nempel, kecil (rem tangan / hujan) = melebar
  const grip = (handbrake ? 6.5 : 26) * (wet ? 0.65 : 1);
  lat *= Math.exp(-grip * dt);
  // mobil yang melebar kehilangan tenaga (side scrub)
  fwd -= Math.abs(lat) * 0.45 * dt * (fwd >= 0 ? 1 : -1);

  // kecepatan dunia disusun ulang pada ARAH LAMA (hanya gaya ban yg mengubah kecepatan),
  // lalu bodi berputar -> muncullah slip karena kecepatan nggak ikut berputar
  vx = fwd * ca - lat * sa;
  vy = fwd * sa + lat * ca;
  car.a += yawRate * dt;
  car.vx = vx; car.vy = vy;
  car.speed = fwd;
  car.slip = Math.abs(lat);

  // ---------- tabrak bangunan ----------
  let nx = car.x + vx * dt;
  let ny = car.y + vy * dt;
  const rects = nearbyBlockers(map, nx, ny, Math.max(T.len, T.wid) + 90);
  car.hit = false;
  const rr = T.wid / 2 + 2;
  for (const r of rects) {
    const res = resolveCircleRect(nx, ny, rr, r);
    if (!res) continue;
    nx = res.x;
    ny = res.y;
    const vn = vx * res.nx + vy * res.ny;
    if (vn < 0) {
      const impact = Math.abs(vn);
      car.hp = Math.max(0, (car.hp ?? 100) - Math.min(45,Math.max(0,impact-55)*.08));
      car.impact = Math.min(1,impact/400);
      const svx = vx - vn * res.nx;
      const svy = vy - vn * res.ny;
      const sp = Math.hypot(svx, svy);
      if (sp > 12) {
        car.speed = sp * 0.55 * (car.speed < 0 ? -1 : 1);
        car.a = Math.atan2(svy, svx);
        // damage: nabrak kenceng = bodi penyok
        if (car.hp === undefined) car.hp = 100;

        car.impact = Math.min(1, sp / 400);
      } else {
        car.speed = 0;
        if (car.hp === undefined) car.hp = 100;

      }
      car.hit = true;
      // pantul sedikit
      vx = svx * 0.5; vy = svy * 0.5;
      car.vx = vx; car.vy = vy;
    }
  }
  // batas map (biar mobil AI gak keluar kota)
  const lim = map.size - 30;
  if (nx < 30) { nx = 30; car.vx = Math.abs(car.vx) * 0.3; }
  if (nx > lim) { nx = lim; car.vx = -Math.abs(car.vx) * 0.3; }
  if (ny < 30) { ny = 30; car.vy = Math.abs(car.vy) * 0.3; }
  if (ny > lim) { ny = lim; car.vy = -Math.abs(car.vy) * 0.3; }

  car.x = nx;
  car.y = ny;

  return car;
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Tabrakan antar mobil (lingkaran-elips disederhanakan) */
export function resolveCarCollisions(cars) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    const ta = CAR_TYPES[a.type] || CAR_TYPES.sedan;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const tb = CAR_TYPES[b.type] || CAR_TYPES.sedan;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      // perkiraan jarak minimum antar mobil ( Approaches: bisa saling lewat di lajur berbeda)
      const minDist = (ta.len + tb.len) / 4;
      if (dist < minDist && dist > 0.001) {
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        const aFixed = a.parked && !a.driver;
        const bFixed = b.parked && !b.driver;
        if (aFixed && bFixed) continue;
        const ma = aFixed ? 0 : tb.mass / (ta.mass + tb.mass);
        const mb = bFixed ? 0 : ta.mass / (ta.mass + tb.mass);
        a.x -= nx * overlap * 2 * ma;
        a.y -= ny * overlap * 2 * ma;
        b.x += nx * overlap * 2 * mb;
        b.y += ny * overlap * 2 * mb;

        const avx=a.vx ?? Math.cos(a.a)*a.speed, avy=a.vy ?? Math.sin(a.a)*a.speed;
        const bvx=b.vx ?? Math.cos(b.a)*b.speed, bvy=b.vy ?? Math.sin(b.a)*b.speed;
        const relative=(bvx-avx)*nx+(bvy-avy)*ny;
        const ia=aFixed?0:1/ta.mass, ib=bFixed?0:1/tb.mass;
        if (relative<0 && ia+ib>0) {
          const impulse=-1.16*relative/(ia+ib);
          if (!aFixed) { a.vx=avx-impulse*ia*nx; a.vy=avy-impulse*ia*ny; a.speed=a.vx*Math.cos(a.a)+a.vy*Math.sin(a.a); }
          if (!bFixed) { b.vx=bvx+impulse*ib*nx; b.vy=bvy+impulse*ib*ny; b.speed=b.vx*Math.cos(b.a)+b.vy*Math.sin(b.a); }
          for (const c of [a,b]) c.hp=Math.max(0,(c.hp??100)-Math.min(25,Math.max(0,-relative-60)*.045));
        }
        a.bumped = true;
        b.bumped = true;
      }
    }
  }
}

/** Raycast dengan garis segment vs rect (untuk tembakan mengenai tembok) */
export function segmentHitsRect(x0, y0, x1, y1, r) {
  // Liang Zhang / slab method
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  for (const [p, q] of [[-dx, x0 - r.x], [dx, r.x + r.w - x0], [-dy, y0 - r.y], [dy, r.y + r.h - y0]]) {
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

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
