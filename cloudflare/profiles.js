// SQLite-backed Durable Object progression. Only profile hashes, never raw bearer tokens.
import { ProfileModel, digest } from '../server/profile-model.js';

const FIELDS = ['name','money','kills','deaths','jobs','dist','best','time','updated'];
export class SqlProfiles extends ProfileModel {
  constructor(storage) {
    super();
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS profiles (
      key TEXT PRIMARY KEY, name TEXT NOT NULL, money INTEGER NOT NULL,
      kills INTEGER NOT NULL, deaths INTEGER NOT NULL, jobs INTEGER NOT NULL,
      dist INTEGER NOT NULL, best INTEGER NOT NULL, time INTEGER NOT NULL,
      updated INTEGER NOT NULL, score INTEGER NOT NULL
    )`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS profiles_rank ON profiles(score DESC, name ASC)');
  }
  resume(token) {
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
      const key = digest(token);
      if (!this.rows.has(key)) {
        const [row] = this.sql.exec('SELECT * FROM profiles WHERE key = ?', key).toArray();
        if (row) this.rows.set(key, row);
      }
    }
    return super.resume(token);
  }
  top(limit = 25, live = []) {
    const players = [...live], n = Math.max(1, Math.min(25, Number(limit) || 25));
    // Reserve enough rows when a live profile's score is lower than its saved score.
    const saved = this.sql.exec('SELECT * FROM profiles ORDER BY score DESC, name ASC LIMIT ?', n + players.length + this.rows.size).toArray();
    const merged = new ProfileModel();
    for (const r of saved) merged.rows.set(r.key, r);
    for (const [key, row] of this.rows) merged.rows.set(key, row);
    return merged.top(n, players);
  }
  save() {
    if (this.dirty) {
      this.storage.transactionSync(() => {
        for (const [key, r] of this.rows) {
          const score = r.money + r.kills * 100 + r.jobs * 50;
          this.sql.exec(`INSERT INTO profiles (key, ${FIELDS.join(',')}, score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET ${FIELDS.map(f => `${f}=excluded.${f}`).join(',')}, score=excluded.score`,
            key, ...FIELDS.map(f => r[f]), score);
        }
      });
    }
    this.dirty = false;
    // Offline history stays in SQLite, not an unbounded in-memory Map.
    this.rows.clear();
  }
}
