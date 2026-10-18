// Original low-poly city bus. Deterministic GLB generator, no dependencies.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/assets/cars/', import.meta.url));
const materials = [
  { name:'paint', pbrMetallicRoughness:{ baseColorFactor:[.12,.52,.56,1], metallicFactor:0, roughnessFactor:.7 } },
  { name:'roof', pbrMetallicRoughness:{ baseColorFactor:[.86,.9,.91,1], metallicFactor:0, roughnessFactor:.8 } },
  { name:'glass', pbrMetallicRoughness:{ baseColorFactor:[.045,.09,.14,1], metallicFactor:.2, roughnessFactor:.22 } },
  { name:'rubber', pbrMetallicRoughness:{ baseColorFactor:[.03,.035,.045,1], metallicFactor:0, roughnessFactor:1 } },
  { name:'head', emissiveFactor:[1,.86,.5], pbrMetallicRoughness:{ baseColorFactor:[1,.9,.7,1], metallicFactor:0, roughnessFactor:.5 } },
  { name:'tail', emissiveFactor:[.8,.015,.01], pbrMetallicRoughness:{ baseColorFactor:[.8,.02,.02,1], metallicFactor:0, roughnessFactor:.5 } },
];
const batches = new Map();
const batch = m => { if (!batches.has(m)) batches.set(m, { p:[], n:[], i:[] }); return batches.get(m); };
function box(m, x,y,z, w,h,d) {
  const b = batch(m), p = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const faces = [[0,3,2,1,0,0,-1],[4,5,6,7,0,0,1],[1,2,6,5,1,0,0],[0,4,7,3,-1,0,0],[3,7,6,2,0,1,0],[0,1,5,4,0,-1,0]];
  for (const f of faces) {
    const off = b.p.length/3;
    for (const v of f.slice(0,4)) { b.p.push(x+p[v][0]*w/2,y+p[v][1]*h/2,z+p[v][2]*d/2); b.n.push(...f.slice(4)); }
    b.i.push(off,off+1,off+2, off,off+2,off+3);
  }
}
box(0,0,.62,0,4.5,.77,1.42); box(1,0,1.3,0,4.48,.63,1.43); box(1,0,1.65,0,4.55,.12,1.48);
for (const side of [-1,1]) {
  for(let k=0;k<6;k++) box(2,-1.78+k*.65,1.31,side*.724,.52,.48,.025);
  box(1,0,.88,side*.722,4.5,.1,.025);
}
box(2,2.255,1.31,0,.025,.5,1.3); box(2,-2.255,1.31,0,.025,.46,1.2);
box(2,.92,.74,-.735,.6,.93,.02); box(1,.92,.76,-.752,.024,.95,.024);
for (const z of [-.5,.5]) { box(4,2.265,.61,z,.04,.14,.22); box(5,-2.265,.67,z,.04,.2,.17); }
box(3,0,.24,0,3.8,.1,1.1); box(3,2.28,.36,0,.07,.1,1.35); box(3,-2.28,.36,0,.07,.1,1.35);
const data=[], views=[], accessors=[], meshes=[], nodes=[]; let size=0;
function accessor(array, type, componentType, min, max) {
  const buffer=Buffer.from(array.buffer,array.byteOffset,array.byteLength), padded=Buffer.alloc(Math.ceil(buffer.length/4)*4); buffer.copy(padded);
  const view=views.length; views.push({buffer:0,byteOffset:size,byteLength:buffer.length});data.push(padded);size+=padded.length;
  const a={bufferView:view,componentType,count:array.length/({SCALAR:1,VEC3:3}[type]),type}; if(min)a.min=min;if(max)a.max=max;accessors.push(a);return accessors.length-1;
}
function mesh(b,m) {
 const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<b.p.length;i++) {mins[i%3]=Math.min(mins[i%3],b.p[i]);maxs[i%3]=Math.max(maxs[i%3],b.p[i]);}
 const pos=accessor(new Float32Array(b.p),'VEC3',5126,mins,maxs),norm=accessor(new Float32Array(b.n),'VEC3',5126),idx=accessor(new Uint16Array(b.i),'SCALAR',5123);
 meshes.push({primitives:[{attributes:{POSITION:pos,NORMAL:norm},indices:idx,material:m}]});return meshes.length-1;
}
for(const [m,b] of batches)nodes.push({name:'bus-'+materials[m].name,mesh:mesh(b,m)});
// Cylinders face Z, matching the original X-forward car convention.
const wheel={p:[],n:[],i:[]};
for(let k=0;k<12;k++) {
 const a=k*Math.PI/6,b=(k+1)*Math.PI/6,off=wheel.p.length/3;
 for(const [ang,z] of [[a,-.09],[b,-.09],[b,.09],[a,.09]]) {wheel.p.push(Math.cos(ang)*.27,Math.sin(ang)*.27,z);wheel.n.push(Math.cos(ang),Math.sin(ang),0);}
 wheel.i.push(off,off+1,off+2,off,off+2,off+3);
 for(const side of [-1,1]) {const o=wheel.p.length/3;for(const [x,y] of [[0,0],[Math.cos(a)*.27,Math.sin(a)*.27],[Math.cos(b)*.27,Math.sin(b)*.27]]){wheel.p.push(x,y,side*.09);wheel.n.push(0,0,side);}wheel.i.push(...(side>0?[o,o+1,o+2]:[o,o+2,o+1]));}
}
const wm=mesh(wheel,3);
for(const x of [-1.42,1.5])for(const z of [-.73,.73])nodes.push({name:`wheel-${x>0?'front':'rear'}-${z>0?'left':'right'}`,mesh:wm,translation:[x,.31,z]});
const doc={asset:{version:'2.0',generator:'Veyra original city bus'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,buffers:[{byteLength:size}],bufferViews:views,accessors};
let json=Buffer.from(JSON.stringify(doc));const jp=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jp);json=jp;
const bin=Buffer.concat(data), header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
mkdirSync(root,{recursive:true});writeFileSync(root+'bus.glb',Buffer.concat([header,jh,json,bh,bin]));console.log('Original bus.glb generated.');
