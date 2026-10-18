// VEYRA: NEON DISTRICT - client 3D (Three.js). Server tetap 2D authoritative: (x, y) peta = (x, z) dunia.
import * as THREE from './vendor/three.module.js';
import { MSG, CAR_TYPES } from '../shared/constants.js';
import { findVehicle } from '../shared/interactions.js';
import { constrainCamera } from '../shared/camera.js';
import { sanitizeAppearance,packAppearance } from '../shared/avatar.js';
import { RELEASE } from '../shared/version.js';
import { Prediction } from './prediction.js';
import { Lobby,saveAppearance } from './lobby.js';
import { buildMap, nearbyBlockers } from '../shared/map.js';
import { Game } from '../shared/game.js';
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
window.__vehicleCandidate=null;window.__renderMe=null;

const net = new Net();
const sfx = new Sfx();
// efek visual (dibuat setelah scene siap)
let fxParticles = null, skid = null, flashes = null, rain = null, shake = null, jobMarker = null;
let gps = null;
let voice = null, lobby = null;
const prediction=new Prediction();
let inputSeq=0, cameraSnap=true, aimHeld=false, lookDragging=false, shotUntil=0;
let vehicleCandidate=null;
const skidStrips = new Map(); // carId -> {l, r}
const carPrevAngle = new Map(); // carId -> sudut sebelumnya ( buat deteksi slip )
let tlPhase = -1;
let offline = null;

// ---------------------------------------------------------------- 3D setup

let renderer, scene, camera, world, entities, tracers, minimap;
let leavingPage=false;
let worldNodes = [];
const cam = { yaw:0,pitch:.18,dist:70,freeLook:0,shake:0,lastLook:0 };

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
    $('menustatus').textContent = d===t?'Siap · v'+RELEASE+' · pilih look dan masuk distrik.':`Memuat kendaraan 3D… ${d}/${t}`;
  });
  tracers = new Tracers(scene, 24);
  minimap = new Minimap(minimapCanvas, state.map);
  gps = new Gps(scene, minimap);
  gps.setMap(state.map);
  window.__gps = gps;

  lobby=new Lobby(renderer);window.__lobby=lobby;window.__prediction=prediction;
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

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if(leavingPage)return; addToast('GPU kehilangan konteks. Membuka mode ringan…'); setTimeout(()=>{location.href='/2d/?nogfx=1';},1000); });
  addEventListener('pagehide',()=>{leavingPage=true;voice?.disable(false);net.close();renderer.dispose();renderer.forceContextLoss();});
  addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
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
const modalOpen = () => state.wardrobeOpen || ['gpspanel','scoreboard','lbpanel','settingspanel'].some(id => !$(id).classList.contains('hidden'));

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
addEventListener('blur', () => { aimHeld=false;lookDragging=false;keys.clear(); stopVoiceTalk(); mouseHeld = false; });

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

canvas.addEventListener('contextmenu', e=>e.preventDefault());
canvas.addEventListener('mousedown', e=>{
  if(state.mode==='menu'||state.wardrobeOpen||modalOpen())return;
  if(e.button===2){aimHeld=true;lookDragging=true;return;}
  if(e.button!==0)return;
  if(!locked){
    lookDragging=true;
    if(canvas.requestPointerLock)try{const result=canvas.requestPointerLock();result?.catch?.(()=>{});}catch{/* drag-to-look fallback */}
    return; // first click captures the camera, never fires backwards accidentally
  }
  mouseHeld=true;fire();
});
addEventListener('mouseup',e=>{if(e.button===2)aimHeld=false;if(e.button===0)mouseHeld=false;lookDragging=false;});
canvas.addEventListener('wheel',e=>{e.preventDefault();window.__camZoom=clamp((window.__camZoom||1)+Math.sign(e.deltaY)*.08,.7,1.5);},{passive:false});

function onKeyPress(k) {
  if (state.mode === 'menu') return;
  if (k === 't') { openChat(); return; }
  if(state.wardrobeOpen){if(k==='escape')closeWardrobe(false);return;}
  if (k === 'f') { interactVehicle(); return; }
  if (k === 'k') { openWardrobe(); return; }
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

function interactVehicle(){
  if(modalOpen()||state.mode==='menu')return;
  send(state.inCar?{t:MSG.EXIT}:{t:MSG.ENTER,c:vehicleCandidate?.allowed?vehicleCandidate.id:undefined});
}
function openWardrobe(){
  const me=state.players.get(state.myId);if(!me||state.inCar||me.d){addToast('Turun dari kendaraan dulu untuk membuka studio.');return;}
  document.exitPointerLock?.();keys.clear();touch?.reset();aimHeld=mouseHeld=false;
  send({t:MSG.INPUT,q:++inputSeq,i:{mx:0,my:0,throttle:0,steer:0}});
  for(const id of ['settingspanel','gpspanel','scoreboard','lbpanel'])$(id).classList.add('hidden');
  document.body.classList.remove('settings-open');document.body.classList.add('wardrobe-open','menu-mode');
  state.wardrobeOpen=true;lobby.begin(me.o);$('menu').classList.remove('gone');$('cancelwardrobe').hidden=false;
  playbtn.disabled=false;$('mobile-join').disabled=false;$('mobile-join').textContent='SIMPAN LOOK →';playbtn.textContent='SIMPAN PENAMPILAN →';
}
function closeWardrobe(save){
  if(!state.wardrobeOpen)return;
  if(save)send({t:MSG.APPEARANCE,o:packAppearance(lobby.current)});
  lobby.finish(save);state.wardrobeOpen=false;$('menu').classList.add('gone');$('cancelwardrobe').hidden=true;
  document.body.classList.remove('wardrobe-open','menu-mode');prediction.reset();cameraSnap=true;
  playbtn.textContent='MASUK DISTRIK →';$('mobile-join').textContent='MASUK DISTRIK →';
}
$('wardrobebtn').addEventListener('click',openWardrobe);
$('cancelwardrobe').addEventListener('click',()=>closeWardrobe(false));
$('vehicleprompt').addEventListener('click',interactVehicle);
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

const hello=name=>({t:MSG.HELLO,n:name,r:profile.load(),o:packAppearance(lobby.current),v:RELEASE});
net.onOpen = () => { net.send(hello(state.name)); };
net.onClose = ev => { if(state.mode==='online')$('mode').textContent='MENYAMBUNG ULANG';voice?.disable(false); if (state.mode === 'online') addToast(ev?.code === 4001 ? 'Progres ini dibuka di tab lain. Reload untuk bermain di sini.' : 'Koneksi putus, menyambung ulang…'); };
net.onMessage = (msg) => handlePayload(msg);

function handlePayload(msg) {
  switch (msg.t) {
    case MSG.WELCOME: {
      clearTimeout(connectTimer); profile.save(msg.r);saveAppearance(msg.o);
      inputSeq=0;prediction.reset();cameraSnap=true;state.cur=state.prev=null;
      playbtn.disabled=false;$('mobile-join').disabled=false;$('mobile-join').textContent='MASUK DISTRIK →';playbtn.textContent='MASUK DISTRIK →';
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
    if(state.mode==='online')prediction.reconcile(me,car,state.map,[...state.cars.values()]);
  }
}

const v3 = new THREE.Vector3();

function onSfx(msg) {
  switch (msg.k) {
    case 'shot': {
      sfx.shot();
      const from = new THREE.Vector3(msg.x, 11.8, msg.y);
      const to = new THREE.Vector3(msg.x + Math.cos(msg.a) * 600, 11.8, msg.y + Math.sin(msg.a) * 600);
      tracers.add(from, to);
      if (flashes && msg.i !== state.myId) {
        flashes.flash(msg.x, 16, msg.y, 0xffd27a, 26, 0.07);
      }
      break;
    }
    case 'hit': sfx.hit(); break;
    case 'horn': sfx.horn(); break;
    case 'door': sfx.door();if(msg.i===state.myId){cameraSnap=true;prediction.reset();} break;
    default: break;
  }
}

function send(obj) {
  if (state.mode === 'online') net.send(obj);
  else if (offline) offline.game.handleMessage(offline.player, JSON.stringify(obj));
}

function fire() {
  if (state.mode === 'menu' || state.inCar || state.wardrobeOpen || state.aimAngle == null || isTyping(document.activeElement) || modalOpen()) return;
  shotUntil=performance.now()+450;
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
  if(state.wardrobeOpen){closeWardrobe(true);return;}
  const name = nickname.value.trim() || 'Warga';
  try{localStorage.setItem('veyra.nickname',name);}catch{}
  state.name = name;
  sfx.init();
  sfx.resume();
  sfx.ui();
  playbtn.disabled = true;$('mobile-join').disabled=true;
  playbtn.textContent = 'MENGHUBUNGKAN...';
  startSession(name);
});

let connectTimer = null;
function startSession(name) {
  state.name = name;
  $('pname').textContent = name;
  if (new URLSearchParams(location.search).has('offline')) { startOffline(name); return; }
  if (net.connected) { net.send(hello(name)); return; }
  net.onOpen = () => net.send(hello(name));
  net.connect();
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if(state.mode!=='menu')return;
    net.close();playbtn.disabled=false;$('mobile-join').disabled=false;playbtn.textContent='COBA HUBUNGKAN LAGI →';
    $('menustatus').textContent='Server belum merespons. Coba lagi atau pilih Coba offline; mode online tidak diganti diam-diam.';
  }, 15000);
}

function startOffline(name) {
  net.close(); clearTimeout(connectTimer); voice?.disable(false);
  document.body.classList.remove('menu-mode', 'settings-open');
  const game = new Game({ seed: 20251018 });
  const player = game.addPlayer(name);
  player.appearance=sanitizeAppearance(lobby.current);
  inputSeq=0;prediction.reset();cameraSnap=true;state.cur=state.prev=null;playbtn.disabled=false;$('mobile-join').disabled=false;
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
  addChat('Demo lokal aktif — bukan sesi multiplayer online.', 'sys');
}

$('demobtn').addEventListener('click', () => { sfx.init(); sfx.resume(); startOffline(nickname.value.trim() || 'Warga'); });
const nickname = $('nickname');
try{nickname.value=localStorage.getItem('veyra.nickname')||'Warga'+Math.floor(Math.random()*900+100);}catch{nickname.value='Warga';}
$('mobile-nickname').value=nickname.value;
nickname.addEventListener('input',()=>{$('mobile-nickname').value=nickname.value;});
$('mobile-nickname').addEventListener('input',e=>{nickname.value=e.target.value;});
$('mobile-join').addEventListener('click',()=>playbtn.click());
const mainJoinObserver=new IntersectionObserver(entries=>$('mobile-lobby-bar').classList.toggle('inactive',entries[0].isIntersecting),{threshold:.8});mainJoinObserver.observe(playbtn);


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
  if ((state.mode==='online'&&!net.connected) || isTyping(document.activeElement) || modalOpen()) return { fwd:0, strafe:0, sprint:false, handbrake:false };
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
  const realDt=Math.max(.001,(now-last)/1000),dt=Math.min(.05,realDt);last=now;
  if(state.mode==='menu'||state.wardrobeOpen){
    dmx=dmy=0;
    if(state.wardrobeOpen){pingTimer+=dt;if(pingTimer>1){pingTimer=0;send({t:MSG.INPUT,q:++inputSeq,i:{mx:0,my:0,throttle:0}});}}
    lobby.render(dt);octx.clearRect(0,0,innerWidth,innerHeight);requestAnimationFrame(frame);return;
  }
  const inp=readInput(),rawMe=state.players.get(state.myId),rawCar=state.cars.get(state.inCar);
  let lookX=0,lookY=0;
  if(touch?.enabled){const l=touch.consumeLook();lookX=l.dx;lookY=l.dy;}
  else if(locked||lookDragging||aimHeld){lookX=dmx;lookY=dmy;}
  if(lookX||lookY){cam.yaw+=lookX*.0038;cam.pitch=clamp(cam.pitch+lookY*.0025,-.04,.75);cam.lastLook=now;}
  dmx=dmy=0;
  if(rawCar&&now-cam.lastLook>1200&&Math.abs(rawCar.s)>3)cam.yaw=lerpAngle(cam.yaw,rawCar.a,1-Math.exp(-dt*3.1));
  state.aimAngle=cam.yaw;
  const aiming=!state.inCar&&(aimHeld||mouseHeld||touch?.holding.fire||now<shotUntil)&&!modalOpen();
  document.body.classList.toggle('is-aiming',!!aiming);
  const cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw);
  const input=state.inCar?{throttle:inp.fwd,steer:inp.strafe,handbrake:inp.handbrake}:{mx:inp.fwd*cy-inp.strafe*sy,my:inp.fwd*sy+inp.strafe*cy,sprint:inp.sprint,aim:!!aiming,aimAngle:cam.yaw};
  inputAcc+=dt;
  if(inputAcc>=1/30){inputAcc%=1/30;send({t:MSG.INPUT,q:++inputSeq,i:input});}
  fireAcc+=Math.min(realDt,.4);
  if(fireAcc>=.28&&(mouseHeld||touch?.holding.fire)){fireAcc=0;fire();}
  if(offline){offline.player.input=input;offline.player.inputSeq=inputSeq;offline.game.tick(dt);}
  const {players,cars:carList,peds}=interp();
  let me=players.find(p=>p.i===state.myId),car=carList.find(c=>c.i===state.inCar);
  if(state.mode==='online'&&rawMe){
    prediction.wet=state.weather===2;
    prediction.actors=[...players.filter(p=>p.i!==state.myId&&!p.v&&!p.d),...peds.filter(p=>!p.d).map(p=>({...p,bodyRadius:3}))];
    const predicted=prediction.advance(rawMe,rawCar,input,dt,inputSeq,state.map,carList);
    if(predicted&&me){
      if(state.inCar&&car){Object.assign(car,{x:predicted.x,y:predicted.y,a:predicted.a,s:predicted.speed,st:predicted.steerAngle});Object.assign(me,{x:car.x,y:car.y,a:car.a,vx:predicted.vx,vy:predicted.vy});state.speed=car.s;}
      else Object.assign(me,{x:predicted.x,y:predicted.y,a:predicted.a,vx:predicted.vx,vy:predicted.vy});
    }
  }
  const target={x:car?.x??me?.x??state.map.size/2,y:car?Math.min(14,(entities.templates[car.y2]?.height||20)*.6):10.5,z:car?.y??me?.y??state.map.size/2};
  const speed=Math.abs(car?.s||0),dist=(car?102+Math.min(20,speed*.045):67)*(window.__camZoom||1)*(aiming?.78:1);
  const shoulder=aiming?4.5:2.2,horiz=Math.cos(cam.pitch)*dist;
  const desired={x:target.x-cy*horiz-sy*shoulder,y:target.y+Math.sin(cam.pitch)*dist,z:target.z-sy*horiz+cy*shoulder};
  const safe=constrainCamera(state.map,target,desired,2);
  const k=1-Math.exp(-dt*(car?6:11));
  const proposed=cameraSnap?safe:{x:lerp(camera.position.x,safe.x,k),y:lerp(camera.position.y,safe.y,k),z:lerp(camera.position.z,safe.z,k)};
  const finalCam=constrainCamera(state.map,target,proposed,2);camera.position.set(finalCam.x,finalCam.y,finalCam.z);cameraSnap=false;
  camera.lookAt(target.x+cy*(car?Math.min(22,speed*.09+5):4),target.y,target.z+sy*(car?Math.min(22,speed*.09+5):4));
  entities.localOpacity=Math.hypot(camera.position.x-target.x,camera.position.z-target.z)<14?.25:1;
  entities.update(players,carList,state.myId,me?.a??cam.yaw,camera.position,dt,cam.yaw,peds,aiming);
  tracers.update(dt);
  fpsAvg=fpsAvg*.92+(1/realDt)*.08;qualityTimer+=Math.min(realDt,.2);
  if(qualityTimer>3){qualityTimer=0;if(qualityMode==='auto'&&fpsAvg<28&&qualityTier>0)applyQuality(qualityTier-1);else if(qualityMode==='auto'&&qualityTier===0&&fpsAvg<24&&adaptiveScale>.65){adaptiveScale=Math.max(.65,adaptiveScale-.15);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1)*adaptiveScale);}}
  if(QUALITY[qualityTier].fx){updateCarFx(carList,me,dt,inp.handbrake);updateDamageFx(carList,dt);updateFootFx(players,dt);}
  fxParticles?.update(dt);skid?.update(dt);flashes?.update(dt);
  if(rain){const active=QUALITY[qualityTier].rain&&state.weather===2;if(rain.points.visible!==active)rain.setActive(active);rain.update(dt,camera.position);}
  if(world.setTrafficPhase&&state.cur){const phase=Math.floor((state.cur.ts||Date.now())/16000)%2;if(phase!==tlPhase){tlPhase=phase;world.setTrafficPhase(phase);}}
  const day=world.update(dt,{x:target.x,z:target.z},camera.position,null,state.weather||0);entities.daylight=day.daylight;
  const sh=shake?.update(dt);if(sh){camera.position.x+=sh.x*.3;camera.position.y+=sh.y*.3;}
  renderer.setViewport(0,0,innerWidth,innerHeight);renderer.render(scene,camera);drawOverlay(players);
  if(jobMarker){const job=state.job;jobMarker.visible=!!(job&&!job.t);if(jobMarker.visible){jobMarker.position.set(job.x,0,job.y);jobMarker.rotation.y+=dt*1.1;}}
  if(minimap&&state.cur)minimap.draw(players,carList,state.myId,state.job);
  gps?.update(dt,me);if(voice){voice.update(state.players,me);updateVoiceHud();}
  touch?.setDriving(!!state.inCar);
  vehicleCandidate=me&&!me.d&&!state.inCar?findVehicle(me,carList,state.map):null;
  const prompt=$('vehicleprompt');prompt.classList.toggle('hidden',!me?.v&&!vehicleCandidate);prompt.classList.toggle('available',!!me?.v||!!vehicleCandidate?.allowed);
  if(me?.v){$('vehicleprompttext').textContent=speed>45?'Rem dulu untuk turun':'Turun dari kendaraan';$('vehicledistance').textContent='';}
  else if(vehicleCandidate){$('vehicleprompttext').textContent=vehicleCandidate.reason;$('vehicledistance').textContent=(vehicleCandidate.distance/10).toFixed(1)+' m';}
  touch?.buttons.action.classList.toggle('available',!!me?.v||!!vehicleCandidate?.allowed);
  window.__renderMe=me;window.__vehicleCandidate=vehicleCandidate;
  updateHud();pingTimer+=dt;if(pingTimer>2){pingTimer=0;if(state.mode==='online')net.send({t:MSG.PING,ts:Date.now()});}
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
    if (!ch || !ch.root.visible || ch.speed<5) continue;
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
  const t = performance.now() - 65;
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
    if (p.d || p.i===state.myId) continue;
    proj.set(p.x, p.v?28:22, p.y).project(camera);
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
    $('speedval').textContent = Math.round(Math.abs(state.speed) * 0.36);
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
