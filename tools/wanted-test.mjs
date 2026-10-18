// Uji logika wanted level + pengejaran polisi (server-side, tanpa browser).
// Jalankan: node tools/wanted-test.mjs
import { Game } from '../shared/game.js';

const g = new Game({ seed: 20251018 });
let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  OK  ' : ' FAIL ') + msg);
  if (!cond) fail++;
};

const pelaku = g.addPlayer('Pelaku');
const korban = g.addPlayer('Korban');
korban.x = pelaku.x + 25;
korban.y = pelaku.y;

// tembak 2x
g.pendingShots.push({ id: pelaku.id, a: 0, sx: pelaku.x, sy: pelaku.y });
g.processShots();
ok(pelaku.wanted === 1, `wanted = 1 setelah nembak (${pelaku.wanted})`);
ok(korban.health < 100, `korban kena peluru (hp ${korban.health})`);

g.pendingShots.push({ id: pelaku.id, a: 0, sx: pelaku.x, sy: pelaku.y });
g.processShots();
ok(pelaku.wanted === 2, `wanted = 2 setelah nembak lagi (${pelaku.wanted})`);

// pengejaran polisi
const polisi = [...g.cars.values()].find((c) => c.type === 'police');
ok(!!polisi, 'ada mobil polisi di map');
if (polisi) {
  polisi.parked = false;
  polisi.ai = true;
  polisi.x = pelaku.x + 400;
  polisi.y = pelaku.y;
  const d0 = Math.hypot(polisi.x - pelaku.x, polisi.y - pelaku.y);
  let dMin = d0;
  for (let i = 0; i < 400; i++) {
    g.stepAi(polisi, 1 / 30);
    dMin = Math.min(dMin, Math.hypot(polisi.x - pelaku.x, polisi.y - pelaku.y));
  }
  ok(dMin < d0 - 100, `polisi mengejar: jarak ${Math.round(d0)} -> ${Math.round(dMin)}`);
  console.log(`  info: kecepatan polisi ${Math.round(polisi.speed)} px/s, sudut ${polisi.a.toFixed(2)}`);
}

// tangkap kalau polisi udah deket
if (polisi) {
  polisi.x = pelaku.x + 20;
  polisi.y = pelaku.y;
  g.stepAi(polisi, 1 / 30);
  ok(pelaku.dead === true, 'pemain tertangkap polisi');
  ok(pelaku.wanted === 0, 'wanted reset setelah tertangkap');
}

// decay
const p3 = g.addPlayer('Lama');
p3.wanted = 3;
p3.lastCrime = Date.now() - 60000;
p3.lastWantedDrop = Date.now() - 20000;
g.decayWanted(p3, Date.now());
ok(p3.wanted === 2, `wanted turun pelan (${p3.wanted})`);

console.log(fail === 0 ? '\nSEMUA UJI LOLOS' : `\n${fail} UJI GAGAL`);
process.exit(fail === 0 ? 0 : 1);
