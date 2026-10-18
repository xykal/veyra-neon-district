// Konstanta global, dipakai server & client (harus identik!)

export const TICK_HZ = 30;
export const TICK = 1 / TICK_HZ;
export const SNAPSHOT_HZ = 20;

// --- Pemain (on foot) ---
export const PLAYER_RADIUS = 4.2;
export const WALK_SPEED = 30;
export const SPRINT_SPEED = 62;
export const PLAYER_MAX_HEALTH = 100;
export const RESPAWN_TIME = 3.0;

// --- Mobil ---
export const CAR_TYPES = {
  bus: { label:'Bus Kota', maxSpeed:310, accel:220, brake:560, turn:1.65, len:86, wid:28, mass:2.5, color:'#258f97' },
  van: { label:'Van', maxSpeed:390, accel:300, brake:640, turn:2.2, len:55, wid:26, mass:1.4, color:'#9daabb' },
  sedan:  { label: 'Sedan',   maxSpeed: 430, accel: 360, brake: 720, turn: 2.5, len: 46, wid: 24, mass: 1.0, color: '#c0392b' },
  sport:  { label: 'Sport',   maxSpeed: 580, accel: 470, brake: 780, turn: 2.9, len: 48, wid: 23, mass: 0.9, color: '#f1c40f' },
  truck:  { label: 'Truck',   maxSpeed: 330, accel: 250, brake: 560, turn: 1.8, len: 60, wid: 28, mass: 1.6, color: '#2980b9' },
  police: { label: 'Polisi',  maxSpeed: 520, accel: 430, brake: 760, turn: 2.7, len: 48, wid: 25, mass: 1.1, color: '#2c3e50' },
  taxi:   { label: 'Taksi',   maxSpeed: 400, accel: 330, brake: 680, turn: 2.5, len: 48, wid: 24, mass: 1.0, color: '#e67e22' },
  motorbike: { label: 'Motor', maxSpeed: 620, accel: 540, brake: 700, turn: 3.5, len: 28, wid: 12, mass: 0.6, color: '#e74c3c' },
  tractor:   { label: 'Traktor', maxSpeed: 250, accel: 190, brake: 460, turn: 1.5, len: 54, wid: 27, mass: 1.9, color: '#8bc34a' },
  ambulance:{ label: 'Ambulans', maxSpeed: 480, accel: 400, brake: 740, turn: 2.6, len: 62, wid: 26, mass: 1.3, color: '#ecf0f1' },
  firetruck:{ label: 'Pemadam', maxSpeed: 300, accel: 220, brake: 520, turn: 1.6, len: 68, wid: 29, mass: 2.1, color: '#c0392b' },
  garbage:  { label: 'Truck Sampah', maxSpeed: 280, accel: 200, brake: 500, turn: 1.5, len: 70, wid: 30, mass: 2.2, color: '#7f8c8d' },
  delivery: { label: 'Kurir',   maxSpeed: 400, accel: 300, brake: 640, turn: 2.2, len: 60, wid: 27, mass: 1.5, color: '#f4d03f' },
  suv:      { label: 'SUV',     maxSpeed: 420, accel: 330, brake: 660, turn: 2.3, len: 50, wid: 25, mass: 1.3, color: '#34495e' },
  luxury:   { label: 'SUV Mewah', maxSpeed: 540, accel: 470, brake: 780, turn: 2.6, len: 53, wid: 25, mass: 1.2, color: '#1b2631' },
  supercar: { label: 'Supercar', maxSpeed: 700, accel: 600, brake: 900, turn: 3.1, len: 47, wid: 22, mass: 0.85, color: '#ff2e63' },
  kart:     { label: 'Kart',    maxSpeed: 460, accel: 420, brake: 700, turn: 4.0, len: 30, wid: 18, mass: 0.5, color: '#16a085' },
  shovel:   { label: 'Traktor Gali', maxSpeed: 240, accel: 180, brake: 440, turn: 1.4, len: 58, wid: 30, mass: 2.4, color: '#e67e22' },
};

export const CAR_LIST = Object.keys(CAR_TYPES);

// --- wanted level ---
export const WANTED_MAX = 5;
export const WANTED_DECAY_MS = 22000; // durasi tanpa crime sebelum wanted turun
export const WANTED_STEP_MS = 8000;    // tiap-step penurunan
export const POLICE_RADIUS = 950;     // Radius deteksi polisi
export const BUST_DISTANCE = 34;      // Jarak Policies buat nangkap
export const BUST_RESPAWN = 4.0;      // detik respawn kalau ketangkap

// --- Senjata ---
export const WEAPON = {
  pistol: { name: 'Pistol', damage: 34, range: 620, rate: 0.28, speed: 1500, spread: 0.02 },
};

// --- Protokol (label pesan) ---
export const MSG = {
  // client -> server
  HELLO: 'hello',
  INPUT: 'in',
  FIRE: 'fire',
  ENTER: 'enter',
  EXIT: 'exit',
  CHAT: 'chat',
  HORN: 'horn',
  RESPAWN: 'respawn',
  PING: 'ping',
  APPEARANCE: 'look',
  // server -> client
  WELCOME: 'welcome',
  SNAPSHOT: 's',
  CHAT_MSG: 'chat',
  SFX: 'sfx',
  KILL: 'kill',
  SYSTEM: 'sys',
  PONG: 'pong',
  LEADERBOARD: 'lb',
};

export const KEYMAP = {
  enter: 'f',
  exit: 'f',
  chat: 't',
  scoreboard: 'tab',
  horn: 'h',
  respawn: 'r',
};
