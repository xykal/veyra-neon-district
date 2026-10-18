// Input keyboard + mouse.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
    this.wheel = 0;
    this.zoom = 0.9;
    this.chatOpen = false;
    this.onKey = null;      // callback untuk tombol non-held (f, h, r, ...)
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target?.matches?.('input,textarea,select,[contenteditable=true]')) return;
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space' && document.activeElement !== this.chatInput) e.preventDefault();

      if (this.chatOpen) {
        if (e.code === 'Escape') {
          e.preventDefault();
          this.closeChat();
        }
        return;
      }

      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) {
        if (this.onKey) this.onKey(k, e);
      }
      this.keys.add(k);
      if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });

    addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom - Math.sign(e.deltaY) * 0.08, 0.45, 1.7);
    }, { passive: false });
  }

  setChatInput(el) { this.chatInput = el; }

  isDown(...keys) {
    if (!this.enabled || this.chatOpen || document.activeElement?.matches?.('input,textarea,select,[contenteditable=true]')) return false;
    for (const k of keys) if (this.keys.has(k)) return true;
    return false;
  }

  openChat() {
    this.chatOpen = true;
    this.keys.clear();
  }

  closeChat() {
    this.chatOpen = false;
    this.chatInput.value = '';
    this.chatInput.blur();
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
