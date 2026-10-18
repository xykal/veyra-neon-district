// Small bounded RFC6455 transport. Text + control frames; no negotiated extensions.
// Web browser client frames must be masked. Fragmented text is supported up to 64 KiB.
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_MESSAGE = 64 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });

export function acceptWebSocket(req, socket, head = Buffer.alloc(0)) {
  const key = req.headers['sec-websocket-key'];
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' ||
      typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true); socket.setKeepAlive(true, 30000);
  const conn = new WSConn(socket);
  // Listener must be installed by caller before a coalesced first client frame is emitted.
  if (head.length) queueMicrotask(() => conn.feed(head));
  return conn;
}

export class WSConn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0);
    this.dead = false; this.finished = false;
    this.onMessage = null; this.onClose = null;
    this.fragments = []; this.fragmentBytes = 0; this.fragmented = false;
    this.lastPong = Date.now();
    socket.on('data', d => this.feed(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }
  finish() {
    if (this.finished) return;
    this.finished = true; this.dead = true;
    this.buf = Buffer.alloc(0); this.fragments = [];
    this.onClose?.();
  }
  feed(chunk) {
    if (this.dead) return;
    if (this.buf.length + chunk.length > MAX_MESSAGE + 65536) { this.close(1009); return; }
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    this.parse();
  }
  parse() {
    while (!this.dead && this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], op = b0 & 15;
      const fin = !!(b0 & 128), control = op >= 8;
      let len = b1 & 127, offset = 2;
      if ((b0 & 112) || !(b1 & 128) || ![0, 1, 8, 9, 10].includes(op)) return this.close(1002);
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2); offset = 4;
        if (len < 126) return this.close(1002);
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
        len = Number(big); offset = 10;
        if (len < 65536) return this.close(1002);
      }
      if (len > MAX_MESSAGE || (control && (!fin || len > 125))) return this.close(control ? 1002 : 1009);
      if (this.buf.length < offset + 4 + len) return;
      const mask = this.buf.subarray(offset, offset + 4); offset += 4;
      const payload = Buffer.from(this.buf.subarray(offset, offset + len));
      this.buf = this.buf.subarray(offset + len);
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      if (op === 8) {
        if (len === 1) return this.close(1002);
        if (len >= 2) {
          const code = payload.readUInt16BE(0);
          if (code < 1000 || code >= 5000 || [1004, 1005, 1006, 1015].includes(code)) return this.close(1002);
          try { utf8.decode(payload.subarray(2)); } catch { return this.close(1007); }
        }
        return this.close(1000);
      }
      if (op === 9) { this.sendFrame(10, payload); continue; }
      if (op === 10) { this.lastPong = Date.now(); continue; }
      if ((op === 0 && !this.fragmented) || (op === 1 && this.fragmented)) return this.close(1002);
      if (op === 1 && !fin) this.fragmented = true;
      if (!fin || op === 0) {
        this.fragmentBytes += payload.length;
        if (this.fragmentBytes > MAX_MESSAGE) return this.close(1009);
        this.fragments.push(payload);
        if (!fin) continue;
      }
      const message = this.fragmented ? Buffer.concat(this.fragments) : payload;
      this.fragmented = false; this.fragments = []; this.fragmentBytes = 0;
      let text;
      try { text = utf8.decode(message); } catch { return this.close(1007); }
      this.onMessage?.(text);
    }
  }
  send(text, transient = false) {
    if (this.dead || !this.socket.writable) return false;
    if (this.socket.writableLength > 2 * 1024 * 1024) { this.close(1013); return false; }
    if (transient && this.socket.writableLength > 128 * 1024) return false;
    return this.sendFrame(1, Buffer.from(text));
  }
  sendFrame(op, payload) {
    if (this.dead || !this.socket.writable) return false;
    let h;
    if (payload.length < 126) { h = Buffer.from([128 | op, payload.length]); }
    else if (payload.length < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(payload.length, 2); }
    else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(payload.length), 2); }
    return this.socket.write(Buffer.concat([h, payload]));
  }
  ping() { this.sendFrame(9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (this.dead) return;
    const payload = Buffer.alloc(2); payload.writeUInt16BE(code);
    this.sendFrame(8, payload); this.dead = true;
    this.socket.end();
    this.finish();
    const timeout = setTimeout(() => this.socket.destroy(), 500); timeout.unref();
  }
}
