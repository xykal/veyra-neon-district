import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const bounded = (v, max = 1e9) => Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
const digest = (s) => createHash('sha256').update(s).digest('hex');
export class Profiles {
  constructor(file) {
    this.file = file;
    this.rows = new Map();
    this.dirty = false;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      for (const [key, row] of Object.entries(saved.profiles || {})) {
        if (/^[a-f0-9]{64}$/.test(key) && row && typeof row.name === 'string') this.rows.set(key, row);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error('Tidak bisa membaca progres; periksa file/izin dan pulihkan backup sebelum restart: '+e.message);
    }
  }
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
  save() {
    if (!this.dirty) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify({ version: 1, profiles: Object.fromEntries(this.rows) }), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.dirty = false;
  }
}
