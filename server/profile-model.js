// Shared profile rules for filesystem Node hosting and Cloudflare SQLite storage.
import { createHash, randomBytes } from 'node:crypto';

export const bounded = (v, max = 1e9) => Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
export const digest = s => createHash('sha256').update(s).digest('hex');
export class ProfileModel {
  constructor() { this.rows = new Map(); this.dirty = false; }
  resume(token) {
    const valid = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
    const key = valid ? digest(token) : '';
    if (key && this.rows.has(key)) return { token, key, data: this.rows.get(key) };
    const fresh = randomBytes(32).toString('hex');
    return { token: fresh, key: digest(fresh), data: null };
  }
  restore(player, session) {
    player.profileKey = session.key;
    const d = session.data;
    if (!d) return;
    player.money = Math.round(bounded(d.money));
    player.kills = Math.floor(bounded(d.kills, 1e6));
    player.deaths = Math.floor(bounded(d.deaths, 1e6));
    player.stats = { jobs: Math.floor(bounded(d.jobs, 1e7)), dist: bounded(d.dist, 1e12), best: bounded(d.best, 5000), time: bounded(d.time, 1e10) };
    // Spawn baru: tidak memulihkan HP, wanted, posisi, atau mobil yang sudah dipakai orang lain.
  }
  record(p) {
    if (!p?.profileKey) return;
    this.rows.set(p.profileKey, {
      name: p.name, money: Math.round(bounded(p.money)), kills: Math.floor(bounded(p.kills)),
      deaths: Math.floor(bounded(p.deaths)), jobs: Math.floor(bounded(p.stats?.jobs)),
      dist: Math.round(bounded(p.stats?.dist, 1e12)), best: Math.round(bounded(p.stats?.best, 5000)),
      time: Math.round(bounded(p.stats?.time, 1e10)), updated: Date.now(),
    });
    this.dirty = true;
  }
  top(limit = 25, live = []) {
    const merged = new Map(this.rows);
    for (const p of live) {
      if (p.profileKey) merged.set(p.profileKey, { name: p.name, money: p.money || 0, kills: p.kills || 0, jobs: p.stats?.jobs || 0, best: p.stats?.best || 0, dist:p.stats?.dist || 0, online: true });
    }
    const score = r => (r.money || 0) + (r.kills || 0)*100 + (r.jobs || 0)*50;
    return [...merged.values()].sort((a, b) => score(b)-score(a) || a.name.localeCompare(b.name))
      .slice(0, limit).map(({ name, money, kills, jobs, best, dist, online }) => ({ name, money, kills, jobs, best, dist:dist || 0, score:score({money,kills,jobs}), online: !!online }));
  }
}
