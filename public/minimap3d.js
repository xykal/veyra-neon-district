// Minimap 2D (dipakai juga di mode 3D).
import { COLORS } from '/shared/map.js';

export class Minimap {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
  }

  /** Set rute GPS (array {x,y}) atau null buat hapus. */
  setRoute(points) {
    this.route = points && points.length > 1 ? points : null;
  }

  draw(players, cars, myId, job) {
    const ctx = this.ctx;
    const size = this.canvas.width;
    const zoom = 0.3;
    const me = players.find((p) => p.i === myId);
    const cx = me ? me.x : this.map.size / 2;
    const cy = me ? me.y : this.map.size / 2;
    const scale = zoom;
    const viewW = size / scale;
    const x0 = cx - viewW / 2;
    const y0 = cy - viewW / 2;
    const view = { x0, y0, x1: x0 + viewW, y1: y0 + viewW };

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#16241a';
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-x0, -y0);

    ctx.fillStyle = COLORS.water;
    for (const w of this.map.water) if (ov(w, view)) ctx.fillRect(w.x, w.y, w.w, w.h);

    ctx.fillStyle = '#7b7d84';
    for (const r of this.map.roads) if (ov(r, view)) ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.fillStyle = '#4a4b52';
    for (const b of this.map.buildings) if (ov(b, view)) ctx.fillRect(b.x, b.y, b.w, b.h);

    for (const c of cars) {
      if (c.x < view.x0 || c.x > view.x1 || c.y < view.y0 || c.y > view.y1) continue;
      ctx.fillStyle = c.d ? '#ff9f43' : 'rgba(200,200,205,0.75)';
      ctx.fillRect(c.x - 7, c.y - 4, 14, 8);
    }
    // rute GPS
    if (this.route) {
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 9;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      for (const pt of this.route) {
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      const last = this.route[this.route.length - 1];
      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.arc(last.x, last.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#06202c';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // marker job
    if (job && !job.t) {
      const jx = job.x, jy = job.y;
      if (jx >= view.x0 && jx <= view.x1 && jy >= view.y0 && jy <= view.y1) {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(jx, jy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1a1200';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
    for (const p of players) {
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.i === myId ? 12 : 8, 0, Math.PI * 2);
      ctx.fill();
      if (p.i === myId) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,179,71,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }
}

function ov(r, view) {
  return r.x + r.w > view.x0 && r.x < view.x1 && r.y + r.h > view.y0 && r.y < view.y1;
}
