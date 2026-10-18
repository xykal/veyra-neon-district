import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SqlProfiles } from '../cloudflare/profiles.js';
import { digest } from '../server/profile-model.js';

function storage() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    sql:{ exec(query, ...args) { const stmt = db.prepare(query); return { toArray:() => stmt.all(...args) }; } },
    transactionSync(fn) { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
// Real SQLite, with the same synchronous SQL cursor/transaction surface as a Durable Object.
const adapter = () => {
  const s = storage();
  s.sql.exec = (query, ...args) => {
    const stmt = s.db.prepare(query);
    const result = stmt.columns().length ? stmt.all(...args) : (stmt.run(...args), []);
    return { toArray:() => result };
  };
  return s;
};
const player = (name, session, money = 0) => ({ name, profileKey:session.key, money, kills:2, deaths:1, stats:{ jobs:3, dist:99, best:120, time:30 } });

test('Cloudflare SQL: cold restart restores progress, never stores raw resume token', t => {
  const s = adapter(); t.after(() => s.db.close());
  const first = new SqlProfiles(s), session = first.resume('');
  first.record(player('Saved', session, 4321)); first.save();
  assert.equal(first.rows.size, 0);
  const second = new SqlProfiles(s), restored = second.resume(session.token);
  assert.equal(restored.token, session.token); assert.equal(restored.key, digest(session.token));
  const p = {}; second.restore(p, restored);
  assert.equal(p.money, 4321); assert.equal(p.stats.jobs, 3); assert.equal(p.kills, 2);
  assert.ok(!JSON.stringify(s.sql.exec('SELECT * FROM profiles').toArray()).includes(session.token));
  assert.notEqual(second.resume('f'.repeat(64)).token, session.token);
});

test('Cloudflare SQL: live/saved ranking is deduplicated and includes offline players', t => {
  const s = adapter(); t.after(() => s.db.close());
  const p = new SqlProfiles(s), a = p.resume(''), b = p.resume('');
  p.record(player('Alpha', a, 100)); p.record(player('Beta', b, 1000)); p.save();
  const live = player('AlphaNew', a, 5000), board = p.top(25, [live]);
  assert.equal(board.length, 2); assert.equal(board[0].name, 'AlphaNew'); assert.equal(board[0].online, true);
  assert.equal(board[1].online, false); assert.ok(!JSON.stringify(board).includes(a.key));
});

test('Cloudflare SQL: lower live scores cannot hide the next eligible offline record', t => {
  const s = adapter(); t.after(() => s.db.close());
  const p = new SqlProfiles(s), sessions = [];
  for (let i = 0; i < 30; i++) { const a = p.resume(''); sessions.push(a); p.record(player('P'+i, a, 10000-i)); }
  p.save();
  const board = p.top(25, [player('P0Live', sessions[0], 0)]);
  assert.equal(board.length, 25); assert.equal(board[0].name, 'P1'); assert.equal(board.at(-1).name, 'P25');
});

test('Cloudflare SQL: parameter binding handles hostile names and bounds invalid numbers', t => {
  const s = adapter(); t.after(() => s.db.close());
  const p = new SqlProfiles(s), a = p.resume('');
  p.record(player("'; DROP TABLE profiles; --", a, Infinity)); p.save();
  assert.equal(p.top()[0].money, 0); assert.equal(s.sql.exec('SELECT COUNT(*) AS n FROM profiles').toArray()[0].n, 1);
});

test('Cloudflare SQL: additive appearance migration preserves a pre-0.3 wallet and identity',t=>{
 const s=adapter();t.after(()=>s.db.close());
 s.db.exec('CREATE TABLE profiles (key TEXT PRIMARY KEY,name TEXT NOT NULL,money INTEGER NOT NULL,kills INTEGER NOT NULL,deaths INTEGER NOT NULL,jobs INTEGER NOT NULL,dist INTEGER NOT NULL,best INTEGER NOT NULL,time INTEGER NOT NULL,updated INTEGER NOT NULL,score INTEGER NOT NULL)');
 const token='9'.repeat(64),key=digest(token);
 s.db.prepare('INSERT INTO profiles VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(key,'Legacy',4321,4,2,3,200,120,99,Date.now(),4871);
 const store=new SqlProfiles(s),session=store.resume(token),p={name:'LegacyAgain'};store.restore(p,session);
 assert.equal(p.money,4321);assert.equal(p.kills,4);assert.equal(session.token,token);
 p.appearance={...p.appearance,model:4,top:2,bottom:1};store.record(p);store.save();
 const cold=new SqlProfiles(s),restored={};cold.restore(restored,cold.resume(token));assert.equal(restored.money,4321);assert.equal(restored.appearance.model,4);assert.equal(restored.appearance.top,2);
 assert.equal(s.sql.exec('SELECT COUNT(*) AS n FROM profiles').toArray()[0].n,1);
});
