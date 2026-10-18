// Entry point client: nyambung ke server, kirim input, render, HUD.

import { MSG, CAR_TYPES, WEAPON, RESPAWN_TIME } from '../../shared/constants.js';
import { buildMap } from '../../shared/map.js';
import { Game } from '../../shared/game.js';
import { Renderer } from './render.js';
import { Input } from '../input.js';
import { Net, profile } from '../net.js';
import { TouchControls, isTouchDevice } from '../touch.js';
import { Sfx } from '../audio.js';

const $ = (id) => document.getElementById(id);

const state = {
  map: null,
  myId: null,
  name: '',
  cur: null,
  prev: null,
  curTime: 0,
  prevTime: 0,
  zoom: 0.9,
  aimAngle: null,
  aimTarget: null,
  mode: 'menu',
  players: new Map(),
  cars: new Map(),
  ping: 0,
  inCar: 0,
  speed: 0,
  playerById: (id) => state.players.get(id),
};

const canvas = $('game');
const minimap = $('minimap');
canvas.style.cursor = 'none';
const renderer = new Renderer(canvas, minimap);
const input = new Input(canvas);
const sfx = new Sfx();
const net = new Net();

// Peta langsung dibuat biar menu punya latar kota yang hidup
state.map = buildMap(20251018);

// expose buat debugging di console browser
window.__state = state;

let offline = null;   // { game, player } saat mode offline
let localEventQueue = [];

const touch = new TouchControls((act, down) => {
  if (!down || state.mode === 'menu') return;
  if (act === 'action') send({t:state.inCar ? MSG.EXIT : MSG.ENTER});
  if (act === 'horn') send({t:MSG.HORN});
  if (act === 'fire' && state.aimAngle !== null) send({t:MSG.FIRE,a:state.aimAngle});
  if (act === 'chat') { input.openChat(); chatinput.focus(); }
  if (act === 'board' || act === 'menu') $('scoreboard').classList.toggle('hidden');
});
for (const key of ['gps','voice']) touch.buttons[key].hidden = true;
if (isTouchDevice()) document.body.classList.add('touch-mode');
window.__touch = touch;
// ---------------------------------------------------------------- chat & HUD

const chatlog = $('chatlog');
const chatinput = $('chatinput');
input.setChatInput(chatinput);

function addChat(html, cls = '') {
  const div = document.createElement('div');
  div.className = 'chatline ' + cls;
  div.innerHTML = html;
  chatlog.appendChild(div);
  while (chatlog.children.length > 9) chatlog.removeChild(chatlog.firstChild);
  chatlog.scrollTop = chatlog.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const killfeed = $('killfeed');
function addKill(killer, victim) {
  const div = document.createElement('div');
  div.className = 'kf';
  div.innerHTML = `<b>${escapeHtml(killer)}</b> ⚔ ${escapeHtml(victim)}`;
  killfeed.appendChild(div);
  while (killfeed.children.length > 5) killfeed.removeChild(killfeed.firstChild);
  setTimeout(() => div.remove(), 7000);
}

const toasts = $('toasts');
function addToast(text) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = text;
  toasts.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

// ---------------------------------------------------------------- chat form

$('chatform').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatinput.value.trim();
  chatinput.value = '';
  input.closeChat();
  if (text) send({ t: MSG.CHAT, m: text });
});

chatinput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('chatform').requestSubmit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    input.closeChat();
  }
  e.stopPropagation();
});

// ---------------------------------------------------------------- network

net.onOpen = () => {
  $('menustatus').textContent = 'Terhubung! Mengjoining...';
};

net.onClose = () => {
  if (state.mode === 'online') {
    addToast('Koneksi terputus, mencoba menyambung ulang...');
  }
};

net.onMessage = (msg) => handlePayload(msg);

function handlePayload(msg) {
  switch (msg.t) {
    case MSG.WELCOME: {
      profile.save(msg.r);
      touch.setEnabled(isTouchDevice()); document.body.classList.remove('menu-mode');
      state.myId = msg.id;
      state.name = msg.name;
      state.map = buildMap(msg.seed);
      state.mode = 'online';
      offline = null;
      $('menu').classList.add('gone');
      $('pname').textContent = msg.name;
      addChat('Selamat datang di <b class="who">Veyra Lite</b>! Tekan [T] untuk chat.', 'sys');
      break;
    }
    case MSG.SNAPSHOT: {
      applySnapshot(msg);
      break;
    }
    case MSG.CHAT: {
      const mine = msg.i === state.myId;
      addChat(`<span class="who${mine ? ' mine' : ''}" style="color:${mine ? '#ffd166' : '#7ec8ff'}">${escapeHtml(msg.n)}</span>: ${escapeHtml(msg.m)}`);
      break;
    }
    case MSG.KILL: {
      addKill(msg.k, msg.v);
      break;
    }
    case MSG.SYSTEM: {
      addChat(escapeHtml(msg.m), 'sys');
      break;
    }
    case MSG.SFX: {
      onSfx(msg);
      break;
    }
    case MSG.PONG: {
      state.ping = Math.max(0, Date.now() - msg.ts);
      break;
    }
    default: break;
  }
}

function applySnapshot(snap) {
  state.prev = state.cur;
  state.prevTime = state.curTime;
  state.cur = snap;
  state.curTime = performance.now();
  state.players.clear();
  for (const p of snap.p) state.players.set(p.i, p);
  state.cars.clear();
  for (const c of snap.c) state.cars.set(c.i, c);
  const me = state.players.get(state.myId);
  if (me) {
    state.inCar = me.v || 0;
    const car = state.cars.get(state.inCar);
    state.speed = car ? car.s : 0;
  }
}

function onSfx(msg) {
  switch (msg.k) {
    case 'shot': {
      sfx.shot();
      renderer.addTracer(msg.x, msg.y, msg.x + Math.cos(msg.a) * 520, msg.y + Math.sin(msg.a) * 520);
      break;
    }
    case 'hit': {
      sfx.hit();
      renderer.addPulse(msg.x, msg.y, 'rgba(255,90,90,1)', 40);
      break;
    }
    case 'horn': {
      const d = Math.hypot(msg.x - camX(), msg.y - camY());
      if (d < 900) sfx.horn();
      break;
    }
    case 'door': {
      sfx.door();
      break;
    }
    default: break;
  }
}

function send(obj) {
  if (state.mode === 'online') {
    net.send(obj);
  } else if (offline) {
    offline.game.handleMessage(offline.player, JSON.stringify(obj));
  }
}

function camX() { return renderer.cam.x; }
function camY() { return renderer.cam.y; }

// ---------------------------------------------------------------- menu

const menu = $('menu');
const nickname = $('nickname');
const playbtn = $('playbtn');

nickname.value = 'Warga' + Math.floor(Math.random() * 900 + 100);
$('menustatus').textContent = 'Siap. Klik MASUK KOTA untuk terhubung ke server.';
if (new URLSearchParams(location.search).has('nogfx')) {
  addChat('Browser kamu nggak support WebGL, jadi main di versi <b class="who">2D</b>.', 'sys');
}

playbtn.addEventListener('click', () => {
  const name = nickname.value.trim() || 'Warga';
  sfx.init();
  sfx.resume();
  sfx.ui();
  playbtn.disabled = true;
  playbtn.textContent = 'MENGHUBUNGKAN...';
  startSession(name);
});

let connectTimer = null;

function startSession(name) {
  state.name = name;
  $('pname').textContent = name;

  // mode demo paksa: ?offline=1
  if (new URLSearchParams(location.search).has('offline')) {
    startOffline(name);
    return;
  }

  if (net.connected) {
    net.send({ t: MSG.HELLO, n: name, r:profile.load() });
    return;
  }
  net.onOpen = () => {
    net.send({ t: MSG.HELLO, n: name, r:profile.load() });
  };
  net.connect();

  // fallback: kalau server tidak terjangkau -> mode demo offline
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (state.mode === 'menu') startOffline(name);
  }, 5000);
}

function startOffline(name) {
  net.close(); clearTimeout(connectTimer);
  touch.setEnabled(isTouchDevice()); document.body.classList.remove('menu-mode');
  const game = new Game({ seed: 20251018 });
  const player = game.addPlayer(name);
  offline = { game, player };
  game.io = {
    broadcastRaw: (raw) => handlePayload(JSON.parse(raw)),
    sendRaw: (_id, raw) => handlePayload(JSON.parse(raw)),
  };
  state.mode = 'offline';
  state.myId = player.id;
  state.map = game.map;
  $('menu').classList.add('gone');
  $('pname').textContent = name;
  $('mode').textContent = 'DEMO OFFLINE';
  addChat('Server tidak terjangkau — masuk <b class="who">mode demo offline</b>.', 'sys');
  addToast('Mode demo offline (AI lalu lintas, tidak ada pemain lain)');
}

// ---------------------------------------------------------------- keyboard

input.onKey = (k) => {
  if (state.mode === 'menu') return;
  if (k === 't') {
    input.openChat();
    chatinput.focus();
    return;
  }
  if (k === 'f') {
    send({ t: state.inCar ? MSG.EXIT : MSG.ENTER });
    return;
  }
  if (k === 'h') {
    send({ t: MSG.HORN });
    return;
  }
  if (k === 'r') {
    send({ t: MSG.RESPAWN });
  }
};

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    if (state.mode !== 'menu') $('scoreboard').classList.remove('hidden');
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
});

canvas.addEventListener('mousedown', () => {
  if (state.mode === 'menu') return;
  if (input.chatOpen) return;
  if (state.aimAngle !== null) send({ t: MSG.FIRE, a: state.aimAngle });
});

// ---------------------------------------------------------------- loop

let last = performance.now();
let pingTimer = 0;
let inputAcc = 0;
let fireAcc = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.mode !== 'menu') {
    // 1. hitung input & kirim (batasi 30Hz biar hemat bandwidth)
    const ti=touch.enabled ? touch.read() : null;
    const up = ti ? Math.max(0,-ti.y) : +input.isDown('w', 'arrowup');
    const down = ti ? Math.max(0,ti.y) : +input.isDown('s', 'arrowdown');
    const left = ti ? Math.max(0,-ti.x) : +input.isDown('a', 'arrowleft');
    const right = ti ? Math.max(0,ti.x) : +input.isDown('d', 'arrowright');
    const sprint = ti ? ti.sprint : input.isDown('shift');

    inputAcc += dt;
    if (inputAcc >= 1 / 30) {
      inputAcc = 0;
      if (state.inCar) {
        send({ t: MSG.INPUT, i: { throttle: up-down, steer: right-left, handbrake: ti ? ti.brake : input.isDown(' ') } });
      } else {
        send({ t: MSG.INPUT, i: { mx: right-left, my: down-up, sprint } });
      }
    }

    // 2. aim ke mouse
    const me = state.players.get(state.myId);
    if (me) {
      const wx = renderer.cam.x + (input.mouse.x - renderer.w / 2) / renderer.cam.zoom;
      const wy = renderer.cam.y + (input.mouse.y - renderer.h / 2) / renderer.cam.zoom;
      const look=touch.consumeLook();
      if(ti) { if(look.dx || look.dy) state.aimAngle = Math.atan2(look.dy,look.dx); else state.aimAngle ??= me.a; }
      else state.aimAngle = Math.atan2(wy - me.y, wx - me.x);
      if (state.inCar) {
        const car = state.cars.get(state.inCar);
        if (car) state.aimTarget = { x: car.x + Math.cos(car.a) * 130, y: car.y + Math.sin(car.a) * 130 };
        else state.aimTarget = null;
      } else {
        state.aimTarget = null;
      }
    }

    // 3. tembak (tahan mouse, throttle client biar server gak dibanjiri)
    fireAcc += dt;
    if ((input.mouse.down || touch.holding.fire) && state.aimAngle !== null && fireAcc >= 0.12) {
      fireAcc = 0;
      send({ t: MSG.FIRE, a: state.aimAngle });
    }

    // 4. offline: jalankan simulasi lokal
    if (offline) {
      const p = offline.player;
      if (p.car) {
        p.input.throttle = up-down;
        p.input.steer = right-left;
        p.input.handbrake = ti ? ti.brake : input.isDown(' ');
      } else {
        p.input.mx = right-left;
        p.input.my = down-up;
        p.input.sprint = sprint;
      }
      offline.game.tick(dt);
    }

    // 5. ping
    pingTimer += dt;
    if (pingTimer > 2) {
      pingTimer = 0;
      if (state.mode === 'online') net.send({ t: MSG.PING, ts: Date.now() });
    }

    updateHud();
  }

  touch.setDriving(!!state.inCar);
  state.zoom = touch.enabled ? .7 : input.zoom;
  renderer.draw(state, dt);

  // crosshair
  const ch = $('crosshair');
  if (state.mode === 'menu') {
    ch.classList.add('hidden');
  } else {
    ch.classList.remove('hidden');
    ch.style.left = input.mouse.x + 'px';
    ch.style.top = input.mouse.y + 'px';
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- HUD

function updateHud() {
  const me = state.players.get(state.myId);
  if (me) {
    const hp = Math.max(0, Math.round(me.h));
    $('hpfill').style.width = hp + '%';
    $('hptext').textContent = hp;
    $('kills').textContent = me.k;
    const wanted = me.w || 0;
    if (wanted > 0) {
      $('wantedrow').style.display = '';
      $('wanted').textContent = '★'.repeat(wanted) + '☆'.repeat(Math.max(0, 5 - wanted));
    } else {
      $('wantedrow').style.display = 'none';
    }
    $('pname').textContent = me.n;
  }
  $('ping').textContent = (state.mode === 'online' ? state.ping : 0) + ' ms';
  if (state.mode === 'online' && $('mode').textContent !== 'ONLINE') $('mode').textContent = 'ONLINE';

  // speedometer
  const speedo = $('speedo');
  if (state.inCar) {
    const car = state.cars.get(state.inCar);
    const T = car ? (CAR_TYPES[car.y2] || CAR_TYPES.sedan) : CAR_TYPES.sedan;
    speedo.classList.remove('hidden');
    $('speedval').textContent = Math.round(Math.abs(state.speed) * 0.32);
    $('carname').textContent = T.label.toUpperCase();
  } else {
    speedo.classList.add('hidden');
  }

  // dead overlay
  const deadEl = $('dead');
  if (me && me.d) {
    deadEl.classList.remove('hidden');
    const secs = Math.max(0, (me.r || 0) / 1000);
    $('deadinfo').textContent = `Respawn dalam ${secs.toFixed(1)} detik...`;
  } else {
    deadEl.classList.add('hidden');
  }

  // scoreboard
  if (!$('scoreboard').classList.contains('hidden')) {
    const rows = [...state.players.values()].sort((a, b) => b.k - a.k || a.n.localeCompare(b.n));
    $('sbcount').textContent = `(${rows.length} pemain)`;
    $('sbtbody').innerHTML = rows.map((p, idx) => {
      const veh = p.v ? (CAR_TYPES[state.cars.get(p.v)?.y2]?.label || 'Mobil') : '-';
      return `<tr class="${p.i === state.myId ? 'me' : ''}">
        <td>${idx + 1}</td>
        <td><span class="dot" style="background:${p.c}"></span>${escapeHtml(p.n)}</td>
        <td>${Math.max(0, Math.round(p.h))}</td>
        <td>${p.k}</td>
        <td>${veh}</td>
      </tr>`;
    }).join('');
  }

  // engine sound
  sfx.setEngine(!!state.inCar, state.speed, 0);
}

requestAnimationFrame(frame);
