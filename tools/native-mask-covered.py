#!/usr/bin/env python3
"""Remove only skin faces that are behind opaque clothes in every shipped native preset.
Done offline so imported LODs remain valid and Android never needs a GPU mesh readback.
The CC0 face, hands, visible limbs, weights, skeleton and animations stay unchanged.
"""
import argparse,copy,hashlib,json,struct
from pathlib import Path
import numpy as np
DT={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
N={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read_array(g,b,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);n=N[a['type']];offset=v.get('byteOffset',0)+a.get('byteOffset',0)
 return np.ndarray((a['count'],n),dtype=dt,buffer=b,offset=offset,strides=(v.get('byteStride',dt.itemsize*n),dt.itemsize)).copy()
def process(path):
 blob=path.read_bytes();size=struct.unpack_from('<I',blob,12)[0];g=json.loads(blob[20:20+size]);offset=20+size;bs=struct.unpack_from('<I',blob,offset)[0];binary=bytearray(blob[offset+8:offset+8+bs])
 if g.get('extras',{}).get('veyraCoveredBodyMask')==1:return 0
 node=max((n for n in g['nodes'] if 'mesh'in n and 'skin'in n and not n['name'].startswith(('Top','Pants','Boots'))),key=lambda n:sum(g['accessors'][p['attributes']['POSITION']]['count'] for p in g['meshes'][n['mesh']]['primitives']))
 removed=0
 for p in g['meshes'][node['mesh']]['primitives']:
  attrs=p['attributes'];pos=read_array(g,binary,attrs['POSITION']);bones=read_array(g,binary,attrs['JOINTS_0']);weights=read_array(g,binary,attrs['WEIGHTS_0']);palette=g['skins'][node['skin']]['joints']
  names=[g['nodes'][palette[j]]['name'].lower() for j in bones[np.arange(len(bones)),weights.argmax(axis=1)]]
  hidden=np.array([(.64<y<1.55 and (name=='pelvis' or name.startswith(('spine_','clavicle_','upperarm_','thigh_')))) for y,name in zip(pos[:,1],names)])
  a=g['accessors'][p['indices']];indices=read_array(g,binary,p['indices']).reshape((-1,3));kept=indices[~np.all(hidden[indices],axis=1)].reshape((-1,1));removed+=len(indices)-len(kept)//3
  v=g['bufferViews'][a['bufferView']];start=v.get('byteOffset',0)+a.get('byteOffset',0);data=np.asarray(kept,dtype=DT[a['componentType']]).tobytes();binary[start:start+len(data)]=data;a['count']=len(kept);a['min']=[int(kept.min())];a['max']=[int(kept.max())]
 g.setdefault('extras',{})['veyraCoveredBodyMask']=1
 js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary.extend(b'\0'*((-len(binary))%4));out=struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;path.write_bytes(out);return removed
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--assets',type=Path,default=Path('native/assets/people'));args=ap.parse_args()
 for path in sorted(args.assets.glob('citizen_*.glb')):print(path.name,'covered skin triangles removed',process(path))
 manifest=args.assets/'manifest.json'
 if manifest.exists():
  m=json.loads(manifest.read_text());m['coveredBodyMaskVersion']=1
  for a in m.get('assets',[]):
   p=args.assets/a['file'];a['sha256']=hashlib.sha256(p.read_bytes()).hexdigest();a['bytes']=p.stat().st_size
  manifest.write_text(json.dumps(m,indent=2)+'\n')
