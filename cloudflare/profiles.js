// SQLite-backed Durable Object progression. Only profile hashes, never raw bearer tokens.
import { sanitizeAppearance } from '../shared/avatar.js';
import { ProfileModel, digest } from '../server/profile-model.js';

const FIELDS = ['name','money','kills','deaths','jobs','dist','best','time','updated','appearance'];
export class SqlProfiles extends ProfileModel {
  constructor(storage) {
    super();
    this.storage = storage;
    this.sql = storage.sql;
    this.broken = false;
    this.topCache = null; this.topCacheAt = 0;
    // Quota/rate exhaustion must never take the whole Durable Object down with it.
    try {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS profiles (
        key TEXT PRIMARY KEY, name TEXT NOT NULL, money INTEGER NOT NULL,
        kills INTEGER NOT NULL, deaths INTEGER NOT NULL, jobs INTEGER NOT NULL,
        dist INTEGER NOT NULL, best INTEGER NOT NULL, time INTEGER NOT NULL,
        updated INTEGER NOT NULL, score INTEGER NOT NULL
      )`);
      // Additive schema migration: existing wallets/identities are never dropped.
      if(!this.sql.exec('PRAGMA table_info(profiles)').toArray().some(c=>c.name==='appearance'))this.sql.exec("ALTER TABLE profiles ADD COLUMN appearance TEXT NOT NULL DEFAULT '{}'");
      this.sql.exec('CREATE INDEX IF NOT EXISTS profiles_rank ON profiles(score DESC, name ASC)');
    } catch (e) {
      this.broken = true;
      console.warn('SqlProfiles schema unavailable (quota?):', e.message);
    }
  }
  guard(fn, fallback) {
    if (this.broken) return fallback;
    try { return fn(); } catch (e) {
      if (/rows read|rows written|quota|Exceeded/i.test(e.message || '')) { this.broken = true; console.warn('SqlProfiles disabled after quota error:', e.message); }
      else console.warn('SqlProfiles query failed:', e.message);
      return fallback;
    }
  }
  resume(token) {
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
      const key = digest(token);
      if (!this.rows.has(key)) {
        const row = this.guard(() => this.sql.exec('SELECT * FROM profiles WHERE key = ?', key).toArray()[0], null);
        if (row) this.rows.set(key, row);
      }
    }
    return super.resume(token);
  }
  top(limit = 25, live = []) {
    const players = [...live], n = Math.max(1, Math.min(25, Number(limit) || 25));
    // Cache board reads: lobby polls must not rescan SQLite every few seconds.
    const now = Date.now();
    let saved = this.topCache;
    if (!saved || now - this.topCacheAt > 15000) {
      saved = this.guard(() => this.sql.exec('SELECT * FROM profiles ORDER BY score DESC, name ASC LIMIT ?', n + players.length + this.rows.size).toArray(), []);
      this.topCache = saved; this.topCacheAt = now;
    }
    const merged = new ProfileModel();
    for (const r of saved) merged.rows.set(r.key, r);
    for (const [key, row] of this.rows) merged.rows.set(key, row);
    return merged.top(n, players);
  }
  save() {
    if (this.dirty) {
      this.guard(() => this.storage.transactionSync(() => {
        for (const [key, r] of this.rows) {
          const score = r.money + r.kills * 100 + r.jobs * 50;
          this.sql.exec(`INSERT INTO profiles (key, ${FIELDS.join(',')}, score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET ${FIELDS.map(f => `${f}=excluded.${f}`).join(',')}, score=excluded.score`,
            key, ...FIELDS.map(f => f==='appearance'?JSON.stringify(sanitizeAppearance(r.appearance)):r[f]), score);
        }
      }), null);
      // Successful save invalidates the board cache.
      this.topCache = null;
    }
    this.dirty = false;
    // Offline history stays in SQLite, not an unbounded in-memory Map.
    this.rows.clear();
  }
}
