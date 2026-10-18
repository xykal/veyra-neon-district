import net from 'node:net';
import { randomBytes } from 'node:crypto';
export const waitFor = async (fn, timeout = 4000) => {
  const start = Date.now();
  while (!fn()) { if (Date.now()-start>timeout) throw new Error('Condition timed out'); await new Promise(r=>setTimeout(r,20)); }
};
export function clientFrame(data, { opcode=1, fin=true, masked=true } = {}) {
  const p=Buffer.isBuffer(data)?data:Buffer.from(data), mask=randomBytes(4);
  let h;
  if(p.length<126)h=Buffer.from([(fin?128:0)|opcode,(masked?128:0)|p.length]);
  else if(p.length<65536){h=Buffer.alloc(4);h[0]=(fin?128:0)|opcode;h[1]=(masked?128:0)|126;h.writeUInt16BE(p.length,2);}
  else{h=Buffer.alloc(10);h[0]=(fin?128:0)|opcode;h[1]=(masked?128:0)|127;h.writeBigUInt64BE(BigInt(p.length),2);}
  if(!masked)return Buffer.concat([h,p]);
  const encoded=Buffer.from(p);for(let i=0;i<encoded.length;i++)encoded[i]^=mask[i&3];
  return Buffer.concat([h,mask,encoded]);
}
export class Client {
  constructor(port,origin) {
    this.messages=[];this.code=null;this.buf=Buffer.alloc(0);this.upgraded=false;
    this.socket=net.connect(port,'127.0.0.1');
    this.closed=new Promise(r=>this.socket.once('close',r));
    this.ready=new Promise((resolve,reject)=>{
      this.resolve=resolve;this.reject=reject;
      this.socket.once('connect',()=>this.socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n${origin?'Origin: '+origin+'\r\n':''}\r\n`));
      this.socket.on('error',reject);
    });
    this.socket.on('data',d=>this.feed(d));
  }
  feed(d) {
    this.buf=Buffer.concat([this.buf,d]);
    if(!this.upgraded){const end=this.buf.indexOf('\r\n\r\n');if(end<0)return;const h=this.buf.subarray(0,end).toString();this.buf=this.buf.subarray(end+4);if(!h.startsWith('HTTP/1.1 101')){this.reject(new Error(h.split('\r\n')[0]));this.socket.destroy();return;}this.upgraded=true;this.resolve(this);}
    while(this.buf.length>=2){let len=this.buf[1]&127,off=2;const op=this.buf[0]&15;if(len===126){if(this.buf.length<4)return;len=this.buf.readUInt16BE(2);off=4;}else if(len===127){if(this.buf.length<10)return;len=Number(this.buf.readBigUInt64BE(2));off=10;}if(this.buf.length<off+len)return;const p=this.buf.subarray(off,off+len);this.buf=this.buf.subarray(off+len);if(op===1){try{this.messages.push(JSON.parse(p.toString()));}catch{}if(this.messages.length>500)this.messages.shift();}if(op===9)this.socket.write(clientFrame(p,{opcode:10}));if(op===8){this.code=p.length>=2?p.readUInt16BE():1000;this.socket.end();}}
  }
  send(obj) {this.socket.write(clientFrame(JSON.stringify(obj)));}
  async message(pred) {await waitFor(()=>this.messages.some(pred));const i=this.messages.findIndex(pred);return this.messages.splice(i,1)[0];}
  async hello(name='Tester',token='') {await this.ready;this.send({t:'hello',n:name,r:token});return this.message(m=>m.t==='welcome');}
  async close() {if(this.socket.destroyed)return;this.socket.end(clientFrame(Buffer.from([3,232]),{opcode:8}));await this.closed;}
}
