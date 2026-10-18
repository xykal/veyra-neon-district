// Tes manual protokol WebSocket client (raw TCP) buat verifikasi server.
import net from 'node:net';
import crypto from 'node:crypto';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const name = process.argv[2] || 'Tester';

const key = crypto.randomBytes(16).toString('base64');
const socket = net.connect(port, host, () => {
  socket.write(
    `GET / HTTP/1.1\r\n` +
    `Host: ${host}:${port}\r\n` +
    `Upgrade: websocket\r\n` +
    `Connection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${key}\r\n` +
    `Sec-WebSocket-Version: 13\r\n\r\n`
  );
});

let handshakeDone = false;
let buf = Buffer.alloc(0);
let snapshots = 0;
let welcome = null;

function sendText(str) {
  const payload = Buffer.from(str, 'utf8');
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, 0x80 | len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  socket.write(Buffer.concat([header, mask, masked]));
}

socket.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  if (!handshakeDone) {
    const idx = buf.indexOf('\r\n\r\n');
    if (idx === -1) return;
    const head = buf.subarray(0, idx).toString();
    console.log('--- handshake ---');
    console.log(head.split('\r\n')[0]);
    if (!/101/.test(head)) { console.error('GAGAL handshake'); process.exit(1); }
    handshakeDone = true;
    buf = buf.subarray(idx + 4);
    sendText(JSON.stringify({ t: 'hello', n: name }));
    setTimeout(() => {
      sendText(JSON.stringify({ t: 'in', i: { mx: 1, my: 0, sprint: true } }));
      sendText(JSON.stringify({ t: 'chat', m: 'halo dunia' }));
      sendText(JSON.stringify({ t: 'enter' }));
      sendText(JSON.stringify({ t: 'fire', a: 0 }));
      sendText(JSON.stringify({ t: 'horn' }));
    }, 300);
  }

  while (buf.length >= 2) {
    const b0 = buf[0], b1 = buf[1];
    const opcode = b0 & 0x0f;
    let len = b1 & 0x7f;
    let off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    if (buf.length < off + len) break;
    const payload = buf.subarray(off, off + len).toString('utf8');
    buf = buf.subarray(off + len);
    if (opcode === 0x1) {
      const msg = JSON.parse(payload);
      if (msg.t === 's') { snapshots++; if (snapshots === 1) console.log('snapshot pertama: pemain=', msg.p.length, 'mobil=', msg.c.length); }
      else if (msg.t === 'welcome') { welcome = msg; console.log('welcome:', JSON.stringify(msg)); }
      else console.log('event:', payload.slice(0, 160));
    }
  }
});

setTimeout(() => {
  console.log(`\nHASIL: snapshot diterima = ${snapshots}, welcome = ${!!welcome}`);
  process.exit(snapshots > 5 && welcome ? 0 : 1);
}, 2500);
