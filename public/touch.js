// Pointer Events: mouse/touch/pen, multi-touch joystick + independent look + held buttons.
export class TouchControls {
  constructor(onAction = () => {}) {
    this.onAction = onAction;
    this.enabled = false; this.driving = false;
    this.axis = { x:0, y:0 }; this.look = { dx:0, dy:0 };
    this.holding = { brake:false, fire:false };
    this.stickId = null; this.lookId = null; this.pad = 57;
    const el = (tag, cls, text = '') => { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; };
    this.root = el('div', 'touch-ui'); this.root.id = 'touchUI';
    this.root.hidden = true;
    this.left = el('div', 'touch-move'); this.right = el('div', 'touch-look');
    this.base = el('div', 'stick-base'); this.knob = el('div', 'stick-knob'); this.base.append(this.knob);
    this.hint = el('span', 'stick-hint', 'GESER · PENUH UNTUK LARI'); this.left.append(this.hint);
    this.root.append(this.left, this.right, this.base);
    document.body.append(this.root);
    const consume = e => { e.preventDefault(); e.stopPropagation(); };
    this.left.addEventListener('pointerdown', e => {
      if (this.stickId !== null) return;
      consume(e); this.stickId = e.pointerId; this.left.setPointerCapture(e.pointerId);
      this.origin = { x:e.clientX, y:e.clientY };
      this.base.style.left = e.clientX + 'px'; this.base.style.top = e.clientY + 'px'; this.base.classList.add('active');
      this.moveStick(e);
    });
    this.left.addEventListener('pointermove', e => { if (e.pointerId === this.stickId) { consume(e); this.moveStick(e); } });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) this.left.addEventListener(event, e => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null; this.axis.x = this.axis.y = 0; this.base.classList.remove('active'); this.knob.style.transform = 'translate(0px, 0px)';
    });
    this.right.addEventListener('pointerdown', e => {
      if (this.lookId !== null) return;
      consume(e); this.lookId = e.pointerId; this.right.setPointerCapture(e.pointerId); this.lastLook = { x:e.clientX, y:e.clientY };
    });
    this.right.addEventListener('pointermove', e => {
      if (e.pointerId !== this.lookId) return;
      consume(e); this.look.dx += e.clientX - this.lastLook.x; this.look.dy += e.clientY - this.lastLook.y;
      this.lastLook = { x:e.clientX, y:e.clientY };
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) this.right.addEventListener(event, e => { if (e.pointerId === this.lookId) this.lookId = null; });
    this.buttons = {};
    const button = (key, label, cls, held = false) => {
      const b = el('button', 'tbtn ' + cls, label); b.type = 'button'; b.setAttribute('aria-label', { fire:'Tembak', action:'Masuk atau keluar kendaraan', brake:'Rem tangan', horn:'Klakson', voice:'Tahan untuk bicara', board:'Papan skor', chat:'Buka chat', gps:'Buka GPS', menu:'Pengaturan' }[key] || label);
      let pointer = null;
      b.addEventListener('pointerdown', e => {
        consume(e); if (pointer !== null) return;
        pointer = e.pointerId; b.setPointerCapture(e.pointerId); b.classList.add('down');
        if (key in this.holding) this.holding[key] = true;
        this.onAction(key, true);
      });
      const release = e => {
        if (pointer !== e.pointerId) return;
        pointer = null; b.classList.remove('down');
        if (key in this.holding) this.holding[key] = false;
        if (held) this.onAction(key, false);
      };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(event, release);
      this.root.append(b); this.buttons[key] = b;
      return b;
    };
    button('fire', 'FIRE', 'tb-fire', true);
    button('action', 'NAIK', 'tb-action');
    button('brake', 'REM', 'tb-brake', true);
    button('horn', 'HORN', 'tb-horn');
    button('chat', 'CHAT', 'tb-chat'); button('gps', 'GPS', 'tb-gps');
    button('board', 'SKOR', 'tb-board'); button('voice', 'VOX', 'tb-voice', true); button('menu', '•••', 'tb-menu');
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }
  moveStick(e) {
    const dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
    const distance = Math.hypot(dx, dy), ratio = Math.min(1, distance / this.pad);
    const a = Math.atan2(dy, dx);
    this.axis.x = Math.cos(a) * ratio; this.axis.y = Math.sin(a) * ratio;
    if (ratio < .1) this.axis.x = this.axis.y = 0;
    this.knob.style.transform = `translate(${Math.cos(a) * ratio * this.pad}px,${Math.sin(a) * ratio * this.pad}px)`;
  }
  setDriving(on) {
    if (this.driving === !!on) return;
    this.driving = !!on; this.buttons.action.textContent = on ? 'TURUN' : 'NAIK';
    this.hint.textContent = on ? 'GESER · GAS / SETIR' : 'GESER · PENUH UNTUK LARI';
    this.root.classList.toggle('driving', !!on);
  }
  setEnabled(on) { this.enabled = !!on; this.root.hidden = !on; document.body.classList.toggle('touch-mode', !!on); if (!on) this.reset(); }
  reset() {
    this.axis.x = this.axis.y = 0; this.look.dx = this.look.dy = 0;
    this.stickId = this.lookId = null; this.base.classList.remove('active');
    this.holding.brake = this.holding.fire = false; this.onAction('voice', false);
    for (const b of Object.values(this.buttons)) b.classList.remove('down');
  }
  consumeLook() { const l = { ...this.look }; this.look.dx = this.look.dy = 0; return l; }
  read() { return { ...this.axis, ...this.holding, sprint:Math.hypot(this.axis.x, this.axis.y) > .86 }; }
}
export function isTouchDevice() { return navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches; }
