// Reconnect satu koneksi; input/voice tidak diantrekan saat offline.
export class Net {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.onMessage = null;
    this.onOpen = null;
    this.onClose = null;
    this.retries = 0;
    this.manualClose = false;
    this.timer = null;
  }
  url() { return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/`; }
  connect() {
    clearTimeout(this.timer);
    this.manualClose = false;
    if (this.ws && this.ws.readyState < 2) return;
    let ws;
    try { ws = new WebSocket(this.url()); } catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.connected = true; this.retries = 0;
      this.onOpen?.();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      this.onMessage?.(data);
    };
    ws.onclose = ev => {
      if (this.ws !== ws) return;
      this.connected = false; this.ws = null;
      if (ev.code === 4001) this.manualClose = true;
      this.onClose?.(ev);
      if (!this.manualClose) this.scheduleReconnect();
    };
    ws.onerror = () => { try { ws.close(); } catch { /* close event handles retry */ } };
  }
  scheduleReconnect() {
    if (this.manualClose) return;
    clearTimeout(this.timer);
    const delay = Math.min(8000, 700 * 1.6 ** Math.min(++this.retries, 6));
    this.timer = setTimeout(() => this.connect(), delay);
  }
  send(obj) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return false;
    // Jangan menambah antrean input di jaringan lambat. Snapshot berikutnya mengoreksi posisi.
    if (obj.t === 'in' && this.ws.bufferedAmount > 32768) return false;
    this.ws.send(JSON.stringify(obj)); return true;
  }
  close() {
    this.manualClose = true; clearTimeout(this.timer);
    const ws = this.ws;
    this.ws = null; this.connected = false;
    try { ws?.close(); } catch { /* already closed */ }
  }
}

// Token resume adalah rahasia lokal browser, tidak pernah dimasukkan ke snapshot/papan rekor.
export const profile = {
  load() { try { return localStorage.getItem('veyra.resume') || ''; } catch { return ''; } },
  save(token) { if (!token) return; try { localStorage.setItem('veyra.resume', token); } catch { /* private browsing */ } },
};
