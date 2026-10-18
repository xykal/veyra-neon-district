#!/usr/bin/env python3
"""Bake the free CC0 Standard hairstyles into head-local rigid meshes for BoneAttachment3D."""
import importlib.util,json,struct,io,copy,argparse
from pathlib import Path
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('native-prepare-assets.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
args=argparse.ArgumentParser();args.add_argument('--characters',type=Path,required=True);args.add_argument('--output',type=Path,default=Path('native/assets/people'));opts=args.parse_args();root=opts.characters;out=opts.output;out.mkdir(parents=True,exist_ok=True)
for key,stem in [('parted','Hair_SimpleParted'),('buzz','Hair_Buzzed'),('long','Hair_Long'),('buns','Hair_Buns')]:
 source=next(p for p in root.rglob(stem+'.gltf') if 'Rigged to Head Bone' in str(p));g,old=mod.load(source);g=copy.deepcopy(g);data=bytearray(old);mesh_nodes=[n for n in g['nodes'] if 'mesh' in n];nodes=[]
 def append(values,kind,component):
  while len(data)%4:data.append(0)
  arr=np.asarray(values,dtype=mod.DT[component]).reshape((-1,mod.TYPES[kind]));v=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(data),'byteLength':arr.nbytes});data.extend(arr.tobytes());a=len(g['accessors']);g['accessors'].append({'bufferView':v,'componentType':component,'count':len(arr),'type':kind,'min':arr.min(axis=0).tolist(),'max':arr.max(axis=0).tolist()});return a
 for n in mesh_nodes:
  skin=g['skins'][n['skin']];head=next(i for i,j in enumerate(skin['joints']) if g['nodes'][j].get('name','').lower()=='head');matrix=mod.array(g,old,skin['inverseBindMatrices'])[head].reshape((4,4),order='F')
  for p in g['meshes'][n['mesh']]['primitives']:
   pos=mod.array(g,old,p['attributes']['POSITION']);normal=mod.array(g,old,p['attributes']['NORMAL']);xyz=(matrix@np.column_stack([pos,np.ones(len(pos))]).T).T[:,:3];nr=(matrix[:3,:3]@normal.T).T;nr/=np.maximum(.00001,np.linalg.norm(nr,axis=1))[:,None];p['attributes']['POSITION']=append(xyz,'VEC3',5126);p['attributes']['NORMAL']=append(nr,'VEC3',5126);p['attributes'].pop('JOINTS_0',None);p['attributes'].pop('WEIGHTS_0',None)
  nodes.append({'name':stem,'mesh':n['mesh']})
 for image in g.get('images',[]):
  uri=image.pop('uri',None)
  if not uri:continue
  p=source.parent/uri
  if not p.exists():p=source.parent/uri.replace('_png.png','.png')
  im=Image.open(p);im.thumbnail((512,512),Image.Resampling.LANCZOS);buf=io.BytesIO();im.save(buf,format='PNG',optimize=True)
  while len(data)%4:data.append(0)
  view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(data),'byteLength':len(buf.getvalue())});data.extend(buf.getvalue());image['bufferView']=view;image['mimeType']='image/png'
 g['nodes']=nodes;g['scenes']=[{'nodes':list(range(len(nodes)))}];g['scene']=0;g.pop('skins',None);g.pop('animations',None);g['buffers']=[{'byteLength':len(data)}];j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);data.extend(b'\0'*((-len(data))%4));blob=struct.pack('<III',0x46546c67,2,28+len(j)+len(data))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(data),0x004e4942)+data;(out/('hair_'+key+'.glb')).write_bytes(blob);print('Baked CC0 hair',key,len(blob))
