// Efek suara sintetis (WebAudio) - tanpa file audio eksternal.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.siren = null;
    this.enabled = true;
    this.lastShot = 0;
    this.sirenOn = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    this.buildEngine();
    this.buildSiren();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  buildEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const noise = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();

    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.value = 45;
    osc2.frequency.value = 68;

    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 3;

    // lapisan derau untuk getaran mesin
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    noise.buffer = buf;
    noise.loop = true;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 120;
    noiseFilter.Q.value = 0.7;
    noiseGain.gain.value = 0;

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);

    osc.start();
    osc2.start();
    noise.start();
    this.engine = { osc, osc2, gain, filter, noiseGain, noiseFilter };
  }

  buildSiren() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 700;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.siren = { osc, gain };
  }

  /**
   * Suara mesin: rpm naik sesuai kecepatan, ada "gear" (RPM turun-t naik tiap gigi).
   * @param {boolean} active
   * @param {number} speed px/s
   * @param {number} throttle -1..1
   * @param {string} kind tipe kendaraan
   */
  setEngine(active, speed = 0, throttle = 0, kind = 'sedan') {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const spd = Math.abs(speed);
    const bike = kind === 'motorbike';
    const truck = kind === 'truck' || kind === 'tractor';

    // simulasi gigi: rpm naik di dalam gigi, turun pas ganti gigi
    const gearSize = bike ? 85 : truck ? 160 : 130;
    const gear = Math.min(5, Math.floor(spd / gearSize) + 1);
    const within = (spd % gearSize) / gearSize;
    const base = bike ? 85 : truck ? 32 : 48;
    const span = bike ? 150 : truck ? 70 : 100;
    const rpm = base + (0.22 + within * 0.78) * span + gear * 7;

    this.engine.osc.frequency.setTargetAtTime(rpm, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(rpm * (bike ? 1.99 : 1.51), t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(260 + rpm * 3.4 + Math.abs(throttle) * 700, t, 0.08);
    this.engine.filter.Q.setTargetAtTime(bike ? 6 : 3, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(active ? 0.055 + Math.abs(throttle) * 0.05 : 0, t, 0.1);
    this.engine.noiseGain.gain.setTargetAtTime(active ? 0.01 + Math.abs(throttle) * 0.012 : 0, t, 0.1);
    this.engine.noiseFilter.frequency.setTargetAtTime(60 + rpm * 1.4, t, 0.1);
  }

  /** Sirene polisi (dipanggil tiap frame). */
  setSiren(active, dist = 999) {
    if (!this.siren || !this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = active ? Math.max(0, 1 - dist / 420) * 0.045 : 0;
    this.siren.gain.gain.setTargetAtTime(vol, t, 0.25);
    if (active) {
      const phase = (performance.now() / 340) % 2;
      this.siren.osc.frequency.setTargetAtTime(phase < 1 ? 780 : 560, t, 0.03);
    }
  }

  noiseBuffer(dur = 0.25) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
    return buf;
  }

  shot() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.05) return;
    this.lastShot = now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.18);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(now);
    src.stop(now + 0.2);
  }

  hit() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + 0.2);
  }

  horn() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    for (const [freq, det] of [[330, 0], [392, 6]]) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.detune.value = det;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      g.gain.setValueAtTime(0.16, now + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.connect(g); g.connect(this.master);
      osc.start(now); osc.stop(now + 0.55);
    }
  }

  door() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.12);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(now); src.stop(now + 0.15);
  }

  ui() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + 0.16);
  }
}
