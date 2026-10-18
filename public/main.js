// VEYRA: NEON DISTRICT - client 3D (Three.js). Server tetap 2D authoritative: (x, y) peta = (x, z) dunia.
import * as THREE from './vendor/three.module.js';
import { MSG, CAR_TYPES } from '/shared/constants.js';
import { buildMap, nearbyBlockers } from '/shared/map.js';
import { Game } from '/shared/game.js';
import { Net, profile } from './net.js';
import { Sfx } from './audio.js';
import { buildWorld } from './world3d.js';
import { Entities, Tracers } from './models3d.js';
import { Particles, SkidMarks, Flashes, Rain, Shake } from './fx3d.js';
import { Minimap } from './minimap3d.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { Gps } from './gps.js';
import { Voice } from './voice.js';

const $ = (id) => document.getElementById(id);

const state = {
  map: null,
  myId: null,
  name: '',
  cur: null,
  prev: null,
  curTime: 0,
  prevTime: 0,
  players: new Map(),
  cars: new Map(),
  mode: 'menu',
  ping: 0,
  lb: [],
  inCar: 0,
  speed: 0,
};

const canvas = $('game');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const minimapCanvas = $('minimap');

window.__state = state;

const net = new Net();
const sfx = new Sfx();
// efek visual (dibuat setelah scene siap)
let fxParticles = null, skid = null, flashes = null, rain = null, shake = null, jobMarker = null;
let gps = null;
let voice = null;
const skidStrips = new Map(); // carId -> {l, r}
const carPrevAngle = new Map(); // carId -> sudut sebelumnya ( buat deteksi slip )
let tlPhase = -1;
let offline = null;

// ---------------------------------------------------------------- 3D setup

let renderer, scene, camera, world, entities, tracers, minimap;
let worldNodes = [];
const cam = { yaw: 0, pitch: 0.5, dist: 165, freeLook: 0, shake: 0 };

// ---------------------------------------------------------------- kualitas
// Tier: 0 = rendah (HP), 1 = sedang, 2 = tinggi. Otomatis turun kalau fps jelek.
const QUALITY = [
  { name: 'rendah', dpr: 1.0, shadow: false, fx: false, rain: true, windows: 0.45, props: 0.5, clouds: 8, peds: 5, radius: 550 },
  { name: 'sedang', dpr: 1.5, shadow: false, fx: true,  rain: true,  windows: 0.75, props: 0.8, clouds: 30, peds: 12, radius: 700 },
  { name: 'tinggi', dpr: 2.0, shadow: true,  fx: true,  rain: true,  windows: 1.0,  props: 1.0, clouds: 46, peds: 24, radius: 1000 },
];
let qualityTier = 2;
let fpsAvg = 60;
let qualityTimer = 0;
let adaptiveScale = 1;
let qualityMode = 'auto';
try { qualityMode = localStorage.getItem('veyra.quality') || 'auto'; } catch { /* private mode */ }
let touch = null;

function detectQuality() {
  const touchy = isTouchDevice();
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (touchy || mem <= 2 || cores <= 2) return 0;
  if (mem <= 4 || cores <= 4) return 1;
  return 2;
}

function applyQuality(tier) {
  tier = Math.max(0, Math.min(2, tier));
  qualityTier = tier; adaptiveScale = 1;
  const q = QUALITY[tier];
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    renderer.shadowMap.enabled = q.shadow;
    renderer.shadowMap.needsUpdate = true;
  }
  if (world?.setQuality) world.setQuality(q);
  if (fxParticles) fxParticles.setEnabled(q.fx);
  if (rain) { rain.setQuality(tier); rain.setActive(q.rain && state.weather === 2); }
  if (entities) entities.quality = q;
  const info = $('qualityinfo'); if (info) info.textContent = `${q.name.toUpperCase()} · DPR ≤ ${q.dpr} · bayangan ${q.shadow ? 'aktif' : 'off'} · auto menyesuaikan FPS`;
  console.log('[kualitas] ->', q.name);
}

function init3D() {
  qualityTier = /^[012]$/.test(qualityMode) ? Number(qualityMode) : detectQuality();
  const q0 = QUALITY[qualityTier];
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: qualityTier >= 1,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q0.dpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = q0.shadow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 1, 6000);
  camera.position.set(0, 60, -140);

  state.map = buildMap(20251018);
  world = buildWorld(state.map, scene, QUALITY[qualityTier]);
  worldNodes = [...scene.children];
  entities = new Entities(scene);
  // hook debug (bisa dibuka dari console browser)
  window.__world = world;
  window.__scene = scene;
  window.__camera = camera;
  window.__renderer = renderer;
  window.__entities = entities;
  window.__cam = cam;
  window.__net = net;
  window.__sfx = sfx;

  // efek visual
  fxParticles = new Particles(scene, 1400);
  skid = new SkidMarks(scene, 30, 40);
  flashes = new Flashes(scene);
  rain = new Rain(scene, 2200, 420);
  shake = new Shake();
  jobMarker = buildJobMarker(scene);
  window.__fx = { fxParticles, skid, flashes, rain, shake };

  entities.loadModels((d, t) => {
    $('menustatus').textContent = `Memuat model kendaraan 3D... ${d}/${t}`;
  });
  tracers = new Tracers(scene, 24);
  minimap = new Minimap(minimapCanvas, state.map);
  gps = new Gps(scene, minimap);
  gps.setMap(state.map);
  window.__gps = gps;

  applyQuality(qualityTier);

  // voice chat (push-to-talk, tekan V)
  voice = new Voice(obj => net.send(obj));
  voice.onStatus = m => {
    $('micstatus').textContent = m;
    $('micbtn').textContent = voice.enabled ? 'Matikan mic' : 'Aktifkan mic';
    updateVoiceHud();
  };
  window.__voice = voice;
  touch = new TouchControls((act, down) => {
    if (act === 'voice') { if (down) startVoiceTalk(); else stopVoiceTalk(); return; }
    if (!down || state.mode === 'menu') return;
    if (act === 'chat') openChat();
    else if (act === 'action') onKeyPress('f');
    else if (act === 'horn') onKeyPress('h');
    else if (act === 'gps') onKeyPress('g');
    else if (act === 'menu') openSettings();
    else if (act === 'board') toggleLeaderboard();
    else if (act === 'fire') fire();
  });
  if (isTouchDevice()) {
    document.body.classList.add('touch-mode', 'touchdevice');
    state.enableTouchOnJoin = true;
  }
  window.__touch = touch;
  window.__fps = () => Math.round(fpsAvg);
  window.__quality = () => QUALITY[qualityTier].name;
  window.__setTouch = (on) => touch?.setEnabled(on);
  window.__setQuality = (t) => applyQuality(t);

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); addToast('GPU kehilangan konteks. Membuka mode ringan…'); setTimeout(()=>{location.href='/2d/?nogfx=1';},1000); });
  addEventListener('resize', onResize);
  onResize();
}

function rebuildWorld(seed) {
  if (state.map?.seed === seed) return;
  const keep = new Set([jobMarker, ...[...entities.carObjs.values()].map(r => r.group), ...[...entities.chars.chars.values()].map(c => c.root)]);
  // World-owned nodes are tracked at construction, separate from entity/FX groups.
  for (const obj of worldNodes) {
    scene.remove(obj);
    obj.traverse?.(o => { o.geometry?.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => { if (m) m.dispose(); }); });
  }
  state.map = buildMap(seed);
  const before = new Set(scene.children);
  world = buildWorld(state.map, scene, QUALITY[qualityTier]);
  worldNodes = scene.children.filter(o => !before.has(o) && !keep.has(o));
  world.setQuality(QUALITY[qualityTier]); window.__world = world;
  minimap = new Minimap(minimapCanvas, state.map);
  gps.clear(); gps.minimap = minimap; gps.setMap(state.map);
}

function onResize() {
  if (renderer) {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  const dpr = Math.min(devicePixelRatio || 1, 2);
  overlay.width = innerWidth * dpr;
  overlay.height = innerHeight * dpr;
  overlay.style.width = innerWidth + 'px';
  overlay.style.height = innerHeight + 'px';
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------------------------------------------------------------- input 3D

const keys = new Set();
let mouseX = innerWidth / 2;
let mouseY = innerHeight / 2;
let locked = false;
let dmx = 0;
let dmy = 0;
let mouseHeld = false;
const isTyping = el => el?.matches?.('input,textarea,select,[contenteditable=true]');
const modalOpen = () => ['gpspanel','scoreboard','lbpanel','settingspanel'].some(id => !$(id).classList.contains('hidden'));

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (isTyping(e.target)) return;
  const k = e.key.toLowerCase();
  if (!keys.has(k)) onKeyPress(k);
  keys.add(k);
  if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  // huruf yg buat buka panel (chat/skor) jangan ikut ketik ke input
  if (k === 't' || k === 'tab') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); stopVoiceTalk(); mouseHeld = false; });

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  dmx += e.movementX || 0;
  dmy += e.movementY || 0;
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  canvas.style.cursor = locked ? 'none' : 'crosshair';
  if (!locked) document.exitPointerLock?.();
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (state.mode === 'menu') return;
  if (!locked && canvas.requestPointerLock) {
    try { canvas.requestPointerLock(); } catch { /* ignore */ }
  }
  mouseHeld = true; fire();
});
addEventListener('mouseup', () => { mouseHeld = false; });

function onKeyPress(k) {
  if (state.mode === 'menu') return;
  if (k === 't') { openChat(); return; }
  if (k === 'f') { send({ t: state.inCar ? MSG.EXIT : MSG.ENTER }); return; }
  if (k === 'h') { send({ t: MSG.HORN }); return; }
  if (k === 'r') { send({ t: MSG.RESPAWN }); return; }
  if (k === 'g') { document.exitPointerLock?.(); keys.clear(); gps?.toggle(); return; }
  if (k === 'p') { openSettings(); return; }
  if (k === 'v') { startVoiceTalk(); return; }
  if (k === 'escape') { document.exitPointerLock?.(); gps?.close(); for (const id of ['scoreboard','lbpanel','settingspanel']) $(id).classList.add('hidden'); document.body.classList.remove('settings-open'); }
}

/** Voice chat: tekan-tahan V buat bicara. */
function startVoiceTalk() {
  if (state.mode !== 'online') { addToast('Voice perlu server online + HTTPS.'); return; }
  voice?.hold(true);
}
function stopVoiceTalk() { voice?.hold(false); }
function updateVoiceHud() {
  const el = $('voicehud');
  if (!el) return;
  if (!voice?.enabled) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const names = voice.active().map(id => state.players.get(id)?.n).filter(Boolean);
  el.textContent = names.length ? 'VOX · ' + names.join(', ') : 'VOX siap · tahan V / VOX';
}

function openSettings() {
  document.exitPointerLock?.(); keys.clear(); touch?.reset();
  $('settingspanel').classList.toggle('hidden');
  document.body.classList.toggle('settings-open', !$('settingspanel').classList.contains('hidden'));
}
function toggleLeaderboard() {
  document.exitPointerLock?.(); keys.clear();
  $('lbpanel').classList.toggle('hidden');
  if (!$('lbpanel').classList.contains('hidden')) send({ t:MSG.LEADERBOARD });
}
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => {
  $(button.dataset.close).classList.add('hidden');
  if (button.dataset.close === 'settingspanel') document.body.classList.remove('settings-open');
  if (button.dataset.close === 'gpspanel') gps?.close();
});
$('menusettings').addEventListener('click', openSettings);
$('gpsclear').addEventListener('click', () => gps?.clear());
$('qualityselect').value = qualityMode;
$('qualityselect').addEventListener('change', e => {
  qualityMode = e.target.value;
  try { localStorage.setItem('veyra.quality', qualityMode); } catch { /* private mode */ }
  applyQuality(qualityMode === 'auto' ? detectQuality() : Number(qualityMode));
});
$('micbtn').addEventListener('click', async () => {
  if (voice?.enabled || voice?.enabling) voice.disable();
  else if (state.mode === 'online') await voice?.enable();
  else $('micstatus').textContent = 'Masuk server online dulu; voice tidak tersedia di demo offline.';
  $('micbtn').textContent = voice?.enabled ? 'Matikan mic' : 'Aktifkan mic';
});
$('fullscreenbtn').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { addToast('Fullscreen tidak tersedia di browser ini. Coba landscape.'); }
});
// ---------------------------------------------------------------- chat & HUD

const chatlog = $('chatlog');
const chatinput = $('chatinput');

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

$('chatform').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatinput.value.trim();
  chatinput.value = '';
  closeChat();
  if (text) send({ t: MSG.CHAT, m: text });
});
chatinput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); $('chatform').requestSubmit(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeChat(); }
});

function openChat() {
  document.exitPointerLock?.();
  keys.clear();
  chatinput.value = '';       // huruf 't' yg-pressed jangan ikut ke chat
  chatinput.focus();
}
function closeChat() {
  chatinput.value = '';
  chatinput.blur();
}

const killfeed = $('killfeed');
function addKill(killer, victim, bust) {
  const div = document.createElement('div');
  div.className = 'kf';
  div.innerHTML = bust
    ? `<b style="color:#4d9bff">POLISI</b> 🚔 menangkap <b>${escapeHtml(victim)}</b>`
    : `<b>${escapeHtml(killer)}</b> ⚔ ${escapeHtml(victim)}`;
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

// ---------------------------------------------------------------- network

net.onOpen = () => { net.send({ t: MSG.HELLO, n: state.name, r:profile.load() }); };
net.onClose = ev => { voice?.disable(false); if (state.mode === 'online') addToast(ev?.code === 4001 ? 'Progres ini dibuka di tab lain. Reload untuk bermain di sini.' : 'Koneksi putus, menyambung ulang…'); };
net.onMessage = (msg) => handlePayload(msg);

function handlePayload(msg) {
  switch (msg.t) {
    case MSG.WELCOME: {
      clearTimeout(connectTimer); profile.save(msg.r);
      voice?.setContext(msg.id, msg.voice);
      document.body.classList.remove('menu-mode', 'settings-open');
      state.myId = msg.id;
      state.name = msg.name;
      if (state.map.seed !== msg.seed) rebuildWorld(msg.seed);
      gps?.setMap(state.map);
      state.mode = 'online';
      offline = null;
      $('menu').classList.add('gone');
      if (state.enableTouchOnJoin) touch?.setEnabled(true);
      $('pname').textContent = msg.name;
      $('mode').textContent = 'ONLINE 3D';
      addChat('Selamat datang di <b class="who">Veyra: Neon District</b>. [G] GPS · [L] rekor · [P] pengaturan.', 'sys');
      break;
    }
    case MSG.SNAPSHOT: applySnapshot(msg); break;
    case MSG.CHAT: {
      const mine = msg.i === state.myId;
      addChat(`<span class="who${mine ? ' mine' : ''}" style="color:${mine ? '#ffd166' : '#7ec8ff'}">${escapeHtml(msg.n)}</span>: ${escapeHtml(msg.m)}`);
      break;
    }
    case MSG.KILL: addKill(msg.k, msg.v, msg.bust); break;
    case MSG.SYSTEM: addChat(escapeHtml(msg.m), 'sys'); break;
    case MSG.SFX: onSfx(msg); break;
    case MSG.PONG: state.ping = Math.max(0, Date.now() - msg.ts); break;
    case MSG.LEADERBOARD: state.lb = msg.rows || []; renderLeaderboard(); break;
    case 'vsig': void voice?.handle(msg.from, msg.d); break;
    case 'vpeers': voice?.peersChanged(msg.ids || []); break;
    case 'verr': voice?.disable(); addToast(msg.m); break;
    default: break;
  }
}

function applySnapshot(snap) {
  state.prev = state.cur;
  state.prevTime = state.curTime;
  const firstSnapshot = !state.cur;
  state.cur = snap;
  state.curTime = performance.now();
  state.players.clear();
  for (const p of snap.p) state.players.set(p.i, p);
  state.cars.clear();
  for (const c of snap.c) state.cars.set(c.i, c);
  state.peds = snap.n || [];
  state.job = snap.j || null;
  state.weather = snap.wx ?? 0;
  const me = state.players.get(state.myId);
  if (me) {
    if (firstSnapshot) { cam.yaw = 0; cam.freeLook = 0; camera.position.set(me.x-125,66,me.y); }
    state.inCar = me.v || 0;
    const car = state.cars.get(state.inCar);
    state.speed = car ? car.s : 0;
  }
}

const v3 = new THREE.Vector3();

function onSfx(msg) {
  switch (msg.k) {
    case 'shot': {
      sfx.shot();
      const from = new THREE.Vector3(msg.x, 16, msg.y);
      const to = new THREE.Vector3(msg.x + Math.cos(msg.a) * 600, 16, msg.y + Math.sin(msg.a) * 600);
      tracers.add(from, to);
      if (flashes && msg.i !== state.myId) {
        flashes.flash(msg.x, 16, msg.y, 0xffd27a, 26, 0.07);
      }
      break;
    }
    case 'hit': sfx.hit(); break;
    case 'horn': sfx.horn(); break;
    case 'door': sfx.door(); break;
    default: break;
  }
}

function send(obj) {
  if (state.mode === 'online') net.send(obj);
  else if (offline) offline.game.handleMessage(offline.player, JSON.stringify(obj));
}

function fire() {
  if (state.mode === 'menu' || state.aimAngle == null || isTyping(document.activeElement) || modalOpen()) return;
  send({ t: MSG.FIRE, a: state.aimAngle });
  // efek lokal: kilat peluru di ujung senjata
  const ch = entities.chars.chars.get(state.myId);
  if (ch && flashes) {
    const m = ch.muzzleWorld(new THREE.Vector3());
    flashes.flash(m.x, m.y, m.z, 0xffd27a, 30, 0.08);
    if (fxParticles) {
      for (let i = 0; i < 5; i++) {
        fxParticles.spawn({
          x: m.x, y: m.y, z: m.z,
          vx: Math.cos(state.aimAngle) * 120 + (Math.random() - 0.5) * 60,
          vy: (Math.random() - 0.5) * 60,
          vz: Math.sin(state.aimAngle) * 120 + (Math.random() - 0.5) * 60,
          life: 0.22, size: 5, r: 1, g: 0.85, b: 0.5, grav: -120, drag: 2.2,
        });
      }
    }
    if (shake) shake.add(0.16);
  }
}

// ---------------------------------------------------------------- menu

const playbtn = $('playbtn');
playbtn.addEventListener('click', () => {
  const name = nickname.value.trim() || 'Warga';
  state.name = name;
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
  if (new URLSearchParams(location.search).has('offline')) { startOffline(name); return; }
  if (net.connected) { net.send({ t: MSG.HELLO, n: name, r:profile.load() }); return; }
  net.onOpen = () => net.send({ t: MSG.HELLO, n: name, r:profile.load() });
  net.connect();
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => { if (state.mode === 'menu') startOffline(name); }, 5000);
}

function startOffline(name) {
  net.close(); clearTimeout(connectTimer); voice?.disable(false);
  document.body.classList.remove('menu-mode', 'settings-open');
  const game = new Game({ seed: 20251018 });
  const player = game.addPlayer(name);
  offline = { game, player };
  window.__offline = offline;
  game.io = {
    broadcastRaw: (raw) => handlePayload(JSON.parse(raw)),
    sendRaw: (_id, raw) => handlePayload(JSON.parse(raw)),
  };
  state.mode = 'offline';
  state.myId = player.id;
  state.map = game.map;
  gps?.setMap(game.map);
  $('menu').classList.add('gone');
  if (state.enableTouchOnJoin) touch?.setEnabled(true);
  $('pname').textContent = name;
  $('mode').textContent = 'DEMO OFFLINE 3D';
  addChat('Server nggak terjangkau — masuk <b class="who">mode demo offline</b>.', 'sys');
}

$('demobtn').addEventListener('click', () => { sfx.init(); sfx.resume(); startOffline(nickname.value.trim() || 'Warga'); });
const nickname = $('nickname');
nickname.value = 'Warga' + Math.floor(Math.random() * 900 + 100);

// ---------------------------------------------------------------- loop

let last = performance.now();
let inputAcc = 0;
let pingTimer = 0;
let fireAcc = 0;
state.aimAngle = 0;

const proj = new THREE.Vector3();

/**
 * Input gabungan: keyboard (desktop) + joystick virtual (HP).
 * Sumbu: fwd = maju/mundur, strafe = kiri/kanan.
 */
function readInput() {
  if (isTyping(document.activeElement) || modalOpen()) return { fwd:0, strafe:0, sprint:false, handbrake:false };
  let fwd = 0, strafe = 0;
  const t = touch?.enabled ? touch.read() : null;
  if (t) { fwd = -t.y; strafe = t.x; }
  else {
    if (keys.has('w') || keys.has('arrowup')) fwd++;
    if (keys.has('s') || keys.has('arrowdown')) fwd--;
    if (keys.has('d') || keys.has('arrowright')) strafe++;
    if (keys.has('a') || keys.has('arrowleft')) strafe--;
  }
  const len = Math.hypot(fwd, strafe);
  if (len > 1) { fwd /= len; strafe /= len; }
  return { fwd, strafe, sprint:t ? t.sprint : keys.has('shift'), handbrake:t ? t.brake : keys.has(' ') };
}

function frame(now) {
  const realDt = Math.max(.001, (now - last) / 1000);
  const dt = Math.min(.05, realDt);
  last = now;

  // ---- input (keyboard + sentuh digabung) ----
  const inp = readInput();
  const up = inp.fwd > 0, down = inp.fwd < 0;
  const left = inp.strafe < 0, right = inp.strafe > 0;
  const sprint = inp.sprint;

  const me = state.players.get(state.myId);
  const car = state.inCar ? state.cars.get(state.inCar) : null;

  // ---- kamera: look ----
  if (touch?.enabled) {
    const tl = touch.consumeLook();
    cam.yaw += tl.dx * 0.0042;
    cam.freeLook = clamp(cam.freeLook + tl.dx * .0042, -1.6, 1.6);
    cam.pitch = clamp(cam.pitch + tl.dy * 0.0032, 0.12, 0.95);
  } else if (locked) {
    cam.yaw -= dmx * 0.0022;
    cam.pitch = clamp(cam.pitch + dmy * 0.0016, 0.12, 0.95);
    cam.freeLook = clamp(cam.freeLook - dmx * 0.0022, -1.6, 1.6);
  } else if (!car) {
    // jalan kaki: arah kamera ngikutin posisi mouse (360°)
    cam.yaw = (mouseX / innerWidth - 0.5) * Math.PI * 2;
    cam.pitch = clamp(0.62 - (mouseY / innerHeight - 0.5) * 1.1, 0.15, 1.0);
    cam.freeLook = 0;
  }
  dmx = 0; dmy = 0;

  if (car) {
    // di dalam mobil: kamera ngikutin mobil (bisa look-around kalau mouse terkunci)
    const targetYaw = car.a + ((locked || touch?.enabled) ? cam.freeLook : 0);
    let diff = ((targetYaw - cam.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    cam.yaw += diff * Math.min(1, 7 * dt);
    state.aimAngle = car.a;
  } else {
    state.aimAngle = cam.yaw;
  }

  // ---- kirim input ke server ----
  inputAcc += dt;
  if (inputAcc >= 1 / 30 && state.mode !== 'menu') {
    inputAcc = 0;
    if (state.inCar) {
      send({ t: MSG.INPUT, i: { throttle: inp.fwd, steer: inp.strafe, handbrake: inp.handbrake } });
    } else {
      const f = inp.fwd;
      const r = inp.strafe;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      send({
        t: MSG.INPUT,
        i: {
          mx: f * cy + r * -sy,
          my: f * sy + r * cy,
          sprint,
        },
      });
    }
  }

  // ---- tembak ----
  fireAcc += Math.min(realDt, .4);
  if (state.mode !== 'menu' && fireAcc >= .28 && (mouseHeld || touch?.holding.fire)) {
    fireAcc = 0; fire();
  }

  // ---- simulasi offline ----
  if (offline) {
    const p = offline.player;
    if (p.car) {
      p.input.throttle = inp.fwd;
      p.input.steer = inp.strafe;
      p.input.handbrake = inp.handbrake;
    } else {
      const f = inp.fwd;
      const r = inp.strafe;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      p.input.mx = f * cy + r * -sy;
      p.input.my = f * sy + r * cy;
      p.input.sprint = sprint;
    }
    offline.game.tick(dt);
  }

  // ---- interpolasi snapshot ----
  const { players, cars: carList, peds } = interp();

  // ---- update dunia ----
  const localFacing = car ? car.a : cam.yaw;
  entities.update(players, carList, state.myId, localFacing, camera.position, dt, state.aimAngle, peds);
  tracers.update(dt);

  // ---- auto turun kualitas kalo fps jelek ----
  fpsAvg = fpsAvg * 0.92 + (1 / realDt) * 0.08;
  qualityTimer += Math.min(realDt, .2);
  if (qualityTimer > 3) {
    qualityTimer = 0;
    if (qualityMode === 'auto' && fpsAvg < 28 && qualityTier > 0) applyQuality(qualityTier - 1);
    else if (qualityMode === 'auto' && fpsAvg > 56 && qualityTier < detectQuality()) applyQuality(qualityTier + 1);
    else if (qualityMode === 'auto' && qualityTier === 0 && fpsAvg < 24 && !document.hidden && adaptiveScale > .65) {
      adaptiveScale=Math.max(.65,adaptiveScale-.15);
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1)*adaptiveScale);
    }
  }

  // ---- efek: asap ban, jekap ban, debu langkah ----
  if (QUALITY[qualityTier].fx) { updateCarFx(carList, me, dt, inp.handbrake); updateDamageFx(carList, dt); updateFootFx(players, dt); }
  if (fxParticles) fxParticles.update(dt);
  if (skid) skid.update(dt);
  if (flashes) flashes.update(dt);
  if (rain) {
    const wantRain = QUALITY[qualityTier].rain && state.weather === 2;
    if (rain.points.visible !== wantRain) rain.setActive(wantRain);
    rain.update(dt, camera.position);
  }

  const focus = me ? { x: me.x, z: me.y } : { x: state.map.size / 2, z: state.map.size / 2 };
  // fase lampu lalu lintas (sinkron semua pemain lewat timestamp server)
  if (world.setTrafficPhase && state.cur) {
    const ph = Math.floor((state.cur.ts || Date.now()) / 16000) % 2;
    if (ph !== tlPhase) { tlPhase = ph; world.setTrafficPhase(ph); }
  }
  const dayInfo = world.update(dt, focus, camera.position, camBlockedRect, state.weather || 0);
  entities.daylight = dayInfo.daylight;

  // ---- kamera chase (third person, gaya GTA) ----
  let tx = focus.x, tz = focus.z;
  if (car) { tx = car.x; tz = car.y; }
  else if (me) { tx = me.x; tz = me.y; }

  const dist = (state.inCar ? 205 : 132) * (window.__camZoom || 1);
  const dirX = Math.cos(cam.yaw);
  const dirZ = Math.sin(cam.yaw);
  let elev = (state.inCar ? .30 : .34);
  if (locked || touch?.enabled) elev += clamp(cam.pitch - 0.5, -0.25, 0.45) * 0.5;
  else elev += (0.5 - mouseY / innerHeight) * 0.25;
  const camPos = computeCamera(tx, tz, dirX, dirZ, dist, elev);

  const k = 1 - Math.pow(0.0006, dt);
  camera.position.x += (camPos.x - camera.position.x) * k;
  camera.position.y += (camPos.y - camera.position.y) * k;
  camera.position.z += (camPos.z - camera.position.z) * k;
  proj.set(tx + dirX * 12, state.inCar ? 12 : 16, tz + dirZ * 12);
  camera.lookAt(proj);

  // getaran kamera (tabrakan / tembakan)
  if (shake) {
    const sh = shake.update(dt);
    camera.position.x += sh.x;
    camera.position.y += sh.y;
  }

  renderer.render(scene, camera);

  // ---- overlay nama & HP ----
  drawOverlay(players);

  // ---- marker job 3D ----
  if (jobMarker) {
    const job = state.job;
    const show = !!(job && !job.t);
    jobMarker.visible = show;
    if (show) {
      jobMarker.position.set(job.x, 0, job.y);
      jobMarker.rotation.y += dt * 1.4;
      const p = 1 + Math.sin(performance.now() / 320) * 0.08;
      jobMarker.scale.set(p, 1, p);
    }
  }

  // ---- minimap + HUD ----
  if (minimap && state.cur) minimap.draw(players, carList, state.myId, state.job);
  if (gps) gps.update(dt, me);
  if (voice) { voice.update(state.players, me); updateVoiceHud(); }
  touch?.setDriving(!!state.inCar);
  updateHud();

  pingTimer += dt;
  if (pingTimer > 2) {
    pingTimer = 0;
    if (state.mode === 'online') net.send({ t: MSG.PING, ts: Date.now() });
  }

  requestAnimationFrame(frame);
}

/**
 * Asap ban + jejak ban untuk mobil yang slip (rem tangan / belok tajam).
 */
function updateCarFx(cars, me, dt, braking) {
  if (!fxParticles || !skid) return;
  for (const c of cars) {
    if (c.s === undefined) continue;
    const spd = Math.abs(c.s);
    if (spd < 90) { skidStrips.delete(c.i); continue; }
    // mobil lokal: tau rem tangan; semua mobil: hitung laju belok dari delta sudut
    const isLocal = c.i === state.inCar;
    const hand = isLocal ? (braking ? 1 : 0) : 0;
    const prev = carPrevAngle.get(c.i) ?? c.a;
    const turn = ((c.a - prev + Math.PI) % (Math.PI * 2)) - Math.PI;
    carPrevAngle.set(c.i, c.a);
    const turnRate = Math.abs(turn) / Math.max(dt, 0.001);
    const slip = hand * 1.0 + Math.min(1, turnRate * 0.30) * Math.min(1, spd / 380);
    if (slip < 0.4) { skidStrips.delete(c.i); continue; }

    const T = CAR_TYPES[c.y2] || CAR_TYPES.sedan;
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    const rx = -fy, ry = fx;
    let strips = skidStrips.get(c.i);
    if (!strips) { strips = { l: skid.addStrip(), r: skid.addStrip() }; skidStrips.set(c.i, strips); }
    for (const side of [1, -1]) {
      const wx = c.x - fx * T.len * 0.3 + rx * side * T.wid * 0.5;
      const wy = c.y - fy * T.len * 0.3 + ry * side * T.wid * 0.5;
      const strip = side > 0 ? strips.l : strips.r;
      skid.pushPoint(strip, wx, wy, rx, ry, 3.2);
      // asap
      if (Math.random() < 0.85) {
        fxParticles.spawn({
          x: wx, y: 2.5, z: wy,
          vx: (Math.random() - 0.5) * 26 - fx * c.s * 0.04,
          vy: 16 + Math.random() * 22,
          vz: (Math.random() - 0.5) * 26 - fy * c.s * 0.04,
          life: 0.7 + Math.random() * 0.6,
          size: 5 + Math.random() * 6,
          r: 0.66, g: 0.66, b: 0.68,
          grav: -6, drag: 1.1, grow: 1.8,
        });
      }
    }
  }
}

/** Asap mobil rusak (hp rendah) + percikan pas nabrak. */
function updateDamageFx(cars, dt) {
  if (!fxParticles) return;
  for (const c of cars) {
    const hp = c.h === undefined ? 100 : c.h;
    if (hp >= 60) continue;
    const bad = 1 - hp / 60;
    if (Math.random() < 0.35 * bad) {
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      fxParticles.spawn({
        x: c.x - fx * c.s * 0.02, y: 16, z: c.y - fy * c.s * 0.02,
        vx: (Math.random() - 0.5) * 12, vy: 24 + Math.random() * 20, vz: (Math.random() - 0.5) * 12,
        life: 1.1 + Math.random(), size: 7 + Math.random() * 8,
        r: 0.25, g: 0.24, b: 0.24, grav: -3, drag: 0.8, grow: 2.2,
      });
    }
  }
}

/** Debu langkah kaki + asap knalpot. */
function updateFootFx(players, dt) {
  if (!fxParticles) return;
  for (const p of players) {
    if (p.d || p.v) continue;
    // cukup efek buat pemain yang deket kamera
    const ch = entities.chars.chars.get(p.i);
    if (!ch || !ch.root.visible) continue;
    const near = Math.hypot(p.x - camera.position.x, p.y - camera.position.z);
    if (near > 160) continue;
    // langkah kaki menghasilkan debu kecil
    if (Math.random() < 0.10) {
      const s = ch.root.scale;
      fxParticles.spawn({
        x: p.x + (Math.random() - 0.5) * 3, y: 1.2, z: p.y + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 8, vy: 8 + Math.random() * 8, vz: (Math.random() - 0.5) * 8,
        life: 0.5, size: 6, r: 0.8, g: 0.78, b: 0.72, grav: -4, drag: 1.6, grow: 1.2,
      });
    }
  }
}

/** Penanda lokasi job: silinder kuning berputar + pancaran cahaya. */
function buildJobMarker(scene) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(26, 26, 3, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85 })
  );
  ring.position.y = 2;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(22, 26, 90, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 45;
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(10, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd166 })
  );
  arrow.position.y = 62;
  arrow.rotation.x = Math.PI;
  g.add(ring, beam, arrow);
  g.visible = false;
  scene.add(g);
  return g;
}

function interp() {
  const cur = state.cur;
  if (!cur) return { players: [], cars: [], peds: [] };
  const prev = state.prev;
  const t = performance.now() - 110;
  let alpha = 1;
  if (prev && state.curTime > state.prevTime) {
    alpha = clamp((t - state.prevTime) / (state.curTime - state.prevTime), 0, 1);
  }
  const pp = new Map(); const pc = new Map();
  if (prev) {
    for (const p of prev.p) pp.set(p.i, p);
    for (const c of prev.c) pc.set(c.i, c);
  }
  const players = cur.p.map((p) => {
    const q = pp.get(p.i);
    if (!q) return { ...p };
    return { ...p, x: lerp(q.x, p.x, alpha), y: lerp(q.y, p.y, alpha), a: lerpAngle(q.a, p.a, alpha) };
  });
  const cars = cur.c.map((c) => {
    const q = pc.get(c.i);
    if (!q) return { ...c };
    return { ...c, x: lerp(q.x, c.x, alpha), y: lerp(q.y, c.y, alpha), a: lerpAngle(q.a, c.a, alpha), s: lerp(q.s, c.s, alpha) };
  });
  // pejalan kaki
  const peds = (cur.n || []).map((n) => {
    const q = (state.prev?.n || []).find((z) => z.i === n.i);
    if (!q) return { ...n };
    return { ...n, x: lerp(q.x, n.x, alpha), y: lerp(q.y, n.y, alpha) };
  });
  return { players, cars, peds };
}

function drawOverlay(players) {
  octx.clearRect(0, 0, innerWidth, innerHeight);
  octx.textAlign = 'center';
  octx.font = '600 13px "Segoe UI", sans-serif';
  for (const p of players) {
    if (p.d) continue;
    proj.set(p.x, 30, p.y).project(camera);
    if (proj.z > 1) continue;
    const sx = (proj.x * 0.5 + 0.5) * innerWidth;
    const sy = (-proj.y * 0.5 + 0.5) * innerHeight;
    const isMe = p.i === state.myId;
    octx.fillStyle = 'rgba(0,0,0,0.65)';
    octx.fillText(p.n, sx + 1, sy + 1);
    octx.fillStyle = isMe ? '#ffd166' : '#ffffff';
    octx.fillText(p.n, sx, sy);
    if (p.i === state.myId && p.w > 0) {
      octx.font = '700 15px "Segoe UI", sans-serif';
      octx.fillStyle = '#ff4d4d';
      octx.fillText('★'.repeat(p.w), sx, sy - 16);
      octx.font = '600 13px "Segoe UI", sans-serif';
    }
    if (p.h < 100) {
      const w = 34;
      octx.fillStyle = 'rgba(0,0,0,0.6)';
      octx.fillRect(sx - w / 2, sy + 5, w, 5);
      octx.fillStyle = p.h > 50 ? '#59d98a' : p.h > 25 ? '#ffb347' : '#ff4d4d';
      octx.fillRect(sx - w / 2, sy + 5, (w * Math.max(0, p.h)) / 100, 5);
    }
  }
}

function updateHud() {
  const me = state.players.get(state.myId);
  if (me) {
    const hp = Math.max(0, Math.round(me.h));
    $('hpfill').style.width = hp + '%';
    $('hptext').textContent = hp;
    $('kills').textContent = me.k;
    $('pname').textContent = me.n;
    $('money').textContent = '$' + (me.$ || 0);
  }
  $('ping').textContent = (state.mode === 'online' ? state.ping : 0) + ' ms';

  // wanted level
  const wanted = me ? (me.w || 0) : 0;
  const wrow = $('wantedrow');
  if (wanted > 0) {
    wrow.style.display = '';
    $('wanted').textContent = '★'.repeat(wanted) + '☆'.repeat(Math.max(0, 5 - wanted));
  } else {
    wrow.style.display = 'none';
  }

  // job antar
  const job = state.job;
  const jrow = $('jobrow');
  const jpanel = $('jobpanel');
  if (job && !job.t && me) {
    const dist = Math.hypot(me.x - job.x, me.y - job.y) / 10;
    jrow.style.display = '';
    jpanel.classList.remove('hidden');
    $('jobinfo').textContent = Math.round(dist) + ' m';
    $('jobdist').textContent = Math.round(dist) + ' m';
    $('jobpay').textContent = '$' + job.r;
  } else {
    jrow.style.display = 'none';
    jpanel.classList.add('hidden');
  }

  const speedo = $('speedo');
  if (state.inCar) {
    const c = state.cars.get(state.inCar);
    const T = c ? (CAR_TYPES[c.y2] || CAR_TYPES.sedan) : CAR_TYPES.sedan;
    speedo.classList.remove('hidden');
    $('speedval').textContent = Math.round(Math.abs(state.speed) * 0.32);
    $('carname').textContent = T.label.toUpperCase();
  } else {
    speedo.classList.add('hidden');
  }

  const deadEl = $('dead');
  if (me && me.d) {
    deadEl.classList.remove('hidden');
    $('deadinfo').textContent = `Respawn dalam ${Math.max(0, (me.r || 0) / 1000).toFixed(1)} detik...`;
  } else {
    deadEl.classList.add('hidden');
  }

  renderLeaderboard();

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
        <td>${veh}</td><td>$${p.$ || 0}</td></tr>`;
    }).join('');
  }

  // suara mesin + sirene polisi
  const carNow = state.inCar ? state.cars.get(state.inCar) : null;
  const carKind = carNow ? carNow.y2 : 'sedan';
  sfx.setEngine(!!state.inCar, state.speed, carNow ? Math.sign(carNow.s || 0) : 0, carKind);

  if (wanted > 0) {
    // cari polisi terdekat (sirene bunyi kalo polisi deket, jalan kaki juga)
    let pd = 9999;
    for (const c of state.cars.values()) {
      if (c.y2 !== 'police') continue;
      const d = Math.hypot(c.x - (me ? me.x : 0), c.y - (me ? me.y : 0));
      if (d < pd) pd = d;
    }
    sfx.setSiren(pd < 420, pd);
  } else {
    sfx.setSiren(false);
  }
}

// ---------------------------------------------------------------- util

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** True kalau garis pandang dari pemain ke kamera nggak ketabrak gedung. */
function isClear(x0, z0, x1, z1) {
  const map = state.map;
  if (!map) return true;
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    for (const r of nearbyBlockers(map, x, z, 80)) {
      if (x > r.x && x < r.x + r.w && z > r.y && z < r.y + r.h) return false;
    }
  }
  return true;
}

/**
 * Posisi kamera third-person: di belakang pemain, sudut rendah (gaya GTA).
 * Kalau gedung menghalangi, kamera "mundur" mendekat; kalau masih nutup,
 * sudutnya dinaikkan sedikit (max ~57°, tetap keliatan 3D bukan top-down).
 */
/** Rect gedung yang ngehalangin kamera (dipakai buat wall-fade). */
let camBlockedRect = null;

function computeCamera(tx, tz, dirX, dirZ, dist, elev) {
  const map = state.map;
  camBlockedRect = null;
  const horiz = dist * Math.cos(elev);
  const ox = -dirX * horiz;
  const oz = -dirZ * horiz;
  const oy = dist * Math.sin(elev);

  let safe = 1;
  if (map) {
    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = tx + ox * t;
      const z = tz + oz * t;
      let hit = false;
      for (const r of nearbyBlockers(map, x, z, 90)) {
        if (x > r.x && x < r.x + r.w && z > r.y && z < r.y + r.h) { hit = true; camBlockedRect = r; break; }
      }
      if (hit) { safe = Math.max(.82, t - 1.2 / steps); break; }
    }
  }


  return {
    x: tx + ox * safe,
    y: oy * safe + 18,
    z: tz + oz * safe,
  };
}

/** Render papan rekor (leaderboard) ke panel. */
function renderLeaderboard() {
  const rows = state.lb || [];
  const el = $('lbtbody');
  if (!el) return;
  $('lbcount').textContent = `(${rows.length} rekor)`;
  el.innerHTML = rows.map((r, idx) => `<tr class="${idx === 0 ? 'me' : ''}">
      <td>${idx + 1}</td>
      <td>${escapeHtml(r.name)}${r.online ? ' <span class="dot" style="background:#3ddc84"></span>' : ''}</td>
      <td>${r.score || 0}</td>
      <td>${r.kills || 0}</td>
      <td>${r.jobs || 0}</td>
      <td>$${r.money || 0}</td>
      <td>${Math.round((r.dist || 0) / 10)} m</td></tr>`).join('');
}

// ---------------------------------------------------------------- start

addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return;
  if (e.code === 'Tab') {
    e.preventDefault();
    if (state.mode !== 'menu') $('scoreboard').classList.remove('hidden');
  }
  if (e.code === 'KeyL' && state.mode !== 'menu' && !state.chatOpen) {
    toggleLeaderboard();
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
  if (e.code === 'KeyV') stopVoiceTalk();
});

try {
  init3D();
  $('menustatus').textContent = 'Siap. Masuk distrik atau coba demo offline.';
  requestAnimationFrame(frame);
} catch (err) {
  console.error(err);
  // WebGL nggak tersedia -> otomatis lempar ke versi 2D biar tetap bisa main
  $('menustatus').textContent = 'WebGL tidak tersedia, buka versi 2D...';
  setTimeout(() => { location.href = '/2d/?nogfx=1'; }, 900);
}
