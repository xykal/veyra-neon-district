#!/usr/bin/env python3
"""Prepare the free Quaternius Standard bodies/UAL for Veyra Native.
Requires numpy + Pillow. No paid assets, Mixamo files, account cookies or project credentials.
The generated GLBs are committed, so users don't need this tool to build the native game.
"""
import argparse,copy,hashlib,io,json,math,struct
from pathlib import Path
import numpy as np
from PIL import Image

TYPES={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
DT={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
CLIPS={'Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Crouch_Fwd_Loop','Crouch_Idle_Loop','Jump_Start','Jump_Loop','Jump_Land','Driving_Loop','Pistol_Aim_Neutral','Pistol_Idle_Loop','Pistol_Shoot','Pistol_Reload','Interact','Hit_Chest','Hit_Head','Death01','Sitting_Idle_Loop','Dance_Loop'}
def load(path):
    if path.suffix=='.glb':
        b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);off=20+n;length=struct.unpack_from('<I',b,off)[0];data=b[off+8:off+8+length]
    else:g=json.loads(path.read_text());data=(path.parent/g['buffers'][0]['uri']).read_bytes()
    return g,data

def array(g,data,i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);n=TYPES[a['type']];off=v.get('byteOffset',0)+a.get('byteOffset',0)
    return np.ndarray((a['count'],n),dtype=dt,buffer=data,offset=off,strides=(v.get('byteStride',dt.itemsize*n),dt.itemsize)).copy()

def mul(a,b):
    a=np.asarray(a);b=np.asarray(b);x1,y1,z1,w1=np.moveaxis(a,-1,0);x2,y2,z2,w2=np.moveaxis(b,-1,0)
    return np.stack([w1*x2+x1*w2+y1*z2-z1*y2,w1*y2-x1*z2+y1*w2+z1*x2,w1*z2+x1*y2-y1*x2+z1*w2,w1*w2-x1*x2-y1*y2-z1*z2],axis=-1)
def inv(q):return np.asarray(q)*np.array([-1,-1,-1,1])
def rotate(q,v):
    v=np.asarray(v);z=np.concatenate([v,np.zeros((*v.shape[:-1],1))],axis=-1);return mul(mul(q,z),inv(q))[...,:3]
def rests(g):
    parents={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])};local={i:np.array(n.get('rotation',[0,0,0,1]),dtype=float) for i,n in enumerate(g['nodes'])};glob={}
    def get(i):
        if i not in glob:glob[i]=mul(get(parents[i]),local[i]) if i in parents else local[i]
        return glob[i]
    for i in local:get(i)
    return parents,local,glob

def prepare(source,animpath,out):
    g,old=load(source);source_anim,adata=load(animpath);g=copy.deepcopy(g);data=bytearray(old)
    for buffer in g['buffers']:buffer.pop('uri',None)
    def addarr(values,kind='VEC3',component=5126):
        nonlocal data
        while len(data)%4:data.append(0)
        a=np.asarray(values,dtype=DT[component]);a=a.reshape((-1,TYPES[kind]));off=len(data);data.extend(a.tobytes())
        view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':a.nbytes})
        accessor={'bufferView':view,'componentType':component,'count':len(a),'type':kind}
        if component==5126 and kind in ['SCALAR','VEC3']:accessor.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
        i=len(g['accessors']);g['accessors'].append(accessor);return i
    # Keep original skin/eye textures, downsample large maps to a practical mobile baseline.
    for image in g.get('images',[]):
        if 'uri' not in image:continue
        uri=image.pop('uri');image_file=source.parent/uri
        if not image_file.exists():image_file=source.parent/uri.replace('_png.png','.png')
        raw=image_file.read_bytes();im=Image.open(io.BytesIO(raw));im.thumbnail((512,512),Image.Resampling.LANCZOS);buf=io.BytesIO();im.save(buf,format='PNG',optimize=True)
        while len(data)%4:data.append(0)
        view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(data),'byteLength':len(buf.getvalue())});data.extend(buf.getvalue());image['bufferView']=view;image['mimeType']='image/png'
    # Real weighted garment geometry; body/hands/face topology remains the authored CC0 mesh.
    body_node=max((n for n in g['nodes'] if 'mesh' in n),key=lambda n:sum(g['accessors'][p['attributes']['POSITION']]['count'] for p in g['meshes'][n['mesh']]['primitives']))
    prim=g['meshes'][body_node['mesh']]['primitives'][0];pos=array(g,old,prim['attributes']['POSITION']);norm=array(g,old,prim['attributes']['NORMAL']);joints=array(g,old,prim['attributes']['JOINTS_0']);weights=array(g,old,prim['attributes']['WEIGHTS_0']);indices=array(g,old,prim['indices']).reshape((-1,3));skin=body_node['skin'];palette=g['skins'][skin]['joints'];names=[g['nodes'][palette[i]]['name'].lower() for i in joints[np.arange(len(joints)),weights.argmax(axis=1)]]
    node_parent=next(i for i,n in enumerate(g['nodes']) if any(g['nodes'][c] is body_node for c in n.get('children',[])))
    for label,category in [('TopShort','shortshirt'),('TopLong','longshirt'),('PantsLong','pants'),('PantsShort','shorts'),('Boots','boots')]:
        mask=[]
        for p,name in zip(pos,names):
            hand=any(s in name for s in ['hand','index','middle','pinky','ring','thumb']);head='head' in name
            if category in ['shortshirt','longshirt']:
                ok=not hand and not head and p[1]>.91
                if category=='shortshirt' and 'lowerarm' in name:ok=False
            elif category=='boots':ok=p[1]<.25
            else:ok=p[1]<1.02 and p[1]>(.48 if category=='shorts' else .14)
            mask.append(ok)
        mask=np.asarray(mask);tri=indices[np.all(mask[indices],axis=1)];expanded=pos+norm*(.018 if 'shirt'in category else .022)
        # A little room at the waist/torso, not body paint; existing skin weights animate the garment.
        expanded[:,0]*=1.012;expanded[:,2]*=1.045
        material=len(g['materials']);g['materials'].append({'name':'Veyra_'+label,'pbrMetallicRoughness':{'baseColorFactor':([.045,.05,.055,1] if category=='boots' else [.15,.24,.3,1]),'metallicFactor':0,'roughnessFactor':.89},'doubleSided':True})
        p=copy.deepcopy(prim);p['attributes']['POSITION']=addarr(expanded);p['indices']=addarr(tri.flatten(),'SCALAR',5125);p['material']=material
        mesh=len(g['meshes']);g['meshes'].append({'name':label,'primitives':[p]});node=len(g['nodes']);g['nodes'].append({'name':label,'mesh':mesh,'skin':skin});g['nodes'][node_parent]['children'].append(node)
    # Retarget free UAL clips in global rest space. Native locomotion provides root motion.
    sp,sl,sg=rests(source_anim);tp,tl,tg=rests(g);target={n.get('name'):i for i,n in enumerate(g['nodes'])};g['animations']=[]
    for animation in source_anim.get('animations',[]):
        if animation['name'] not in CLIPS:continue
        outanim={'name':animation['name'],'samplers':[],'channels':[]}
        for channel in animation['channels']:
            sn=channel['target'].get('node');name=source_anim['nodes'][sn].get('name');tn=target.get(name);kind=channel['target']['path']
            if tn is None or kind not in ['rotation','translation']:continue
            sampler=animation['samplers'][channel['sampler']];values=array(source_anim,adata,sampler['output']).astype(float)
            if kind=='rotation':
                ps=sg[sp[sn]] if sn in sp else np.array([0,0,0,1]);pt=tg[tp[tn]] if tn in tp else np.array([0,0,0,1]);a=mul(inv(pt),ps);b=mul(inv(sg[sn]),tg[tn]);values=mul(mul(a,values),b);values/=np.linalg.norm(values,axis=1)[:,None]
            else:
                if name not in ['pelvis','root']:continue
                ds=values-np.array(source_anim['nodes'][sn].get('translation',[0,0,0]));world=rotate(sg[sp[sn]] if sn in sp else [0,0,0,1],ds);world[:,[0,2]]=0;values=np.array(g['nodes'][tn].get('translation',[0,0,0]))+rotate(inv(tg[tp[tn]]) if tn in tp else [0,0,0,1],world)
            inp=addarr(array(source_anim,adata,sampler['input']),'SCALAR');output=addarr(values,'VEC4' if kind=='rotation' else 'VEC3');sam=len(outanim['samplers']);outanim['samplers'].append({'input':inp,'output':output,'interpolation':sampler.get('interpolation','LINEAR')});outanim['channels'].append({'sampler':sam,'target':{'node':tn,'path':kind}})
        if outanim['channels']:g['animations'].append(outanim)
    g['asset']['generator']='Veyra Native: Quaternius CC0 Standard + retargeted CC0 UAL + original weighted garments'
    g['buffers']=[{'byteLength':len(data)}];text=json.dumps(g,separators=(',',':')).encode();text+=b' '*((-len(text))%4);data.extend(b'\0'*((-len(data))%4));blob=struct.pack('<III',0x46546C67,2,12+8+len(text)+8+len(data))+struct.pack('<II',len(text),0x4E4F534A)+text+struct.pack('<II',len(data),0x004E4942)+data
    out.write_bytes(blob);return {'file':out.name,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'animations':[a['name'] for a in g['animations']],'skeletonBones':len(palette),'source':source.name}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--characters',required=True,type=Path);ap.add_argument('--animations',required=True,type=Path);ap.add_argument('--output',default=Path('native/assets/people'),type=Path);args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    manifest=[]
    for sex in ['Male','Female']:
        source=next(args.characters.rglob('Superhero_'+sex+'_FullBody.gltf'));result=prepare(source,args.animations,args.output/('citizen_'+sex.lower()+'.glb'));manifest.append(result);print(result['file'],result['bytes'],'bytes,',result['skeletonBones'],'bones,',len(result['animations']),'retargeted clips')
    (args.output/'manifest.json').write_text(json.dumps({'license':'CC0-1.0 + MIT original modifications','assets':manifest},indent=2)+'\n')
