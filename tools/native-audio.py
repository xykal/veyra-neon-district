#!/usr/bin/env python3
"""Original Veyra Foley/SFX, synthesized from seeded noise and oscillators. No sampled recordings."""
import json,math,wave,hashlib
from pathlib import Path
import numpy as np
RATE=24000
rng=np.random.default_rng(71834)
out=Path('native/assets/audio');out.mkdir(parents=True,exist_ok=True)
manifest=[]
def write(name,x,loop=False):
 x=np.asarray(x);x=np.nan_to_num(x);peak=max(.01,float(np.max(np.abs(x))));x=x/max(1,peak/.9);pcm=(x*32767).astype('<i2');p=out/(name+'.wav')
 with wave.open(str(p),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(pcm.tobytes())
 manifest.append({'name':name,'seconds':round(len(x)/RATE,3),'loop':loop,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
def time(s):return np.arange(int(RATE*s))/RATE
def noise(t):return rng.normal(0,1,len(t))
for i in range(4):
 t=time(.19);n=noise(t);low=np.convolve(n,np.ones(13)/13,'same');x=.55*low*np.exp(-t*32)+.15*np.sin(2*np.pi*(95+i*14)*t)*np.exp(-t*42);write('step_'+str(i),x)
for name,hz in [('engine_idle',80),('engine_mid',140),('engine_high',220)]:
 t=time(1);x=sum(np.sin(2*np.pi*hz*k*t)/(k**1.5) for k in range(1,8))*.17;env=.83+.17*np.sin(2*np.pi*10*t);write(name,x*env,True)
t=time(.9);n=noise(t);x=(n-np.convolve(n,np.ones(11)/11,'same'))*.12*(.7+.3*np.sin(2*np.pi*23*t));write('skid',x,True)
t=time(.28);write('shot',noise(t)*.25*np.exp(-t*36)+np.sin(2*np.pi*(110-40*t)*t)*.6*np.exp(-t*45))
t=time(.46);write('impact',np.convolve(noise(t),np.ones(17)/17,'same')*.65*np.exp(-t*13)+np.sin(2*np.pi*68*t)*.38*np.exp(-t*22))
t=time(.22);write('door',np.sin(2*np.pi*170*t)*.36*np.exp(-t*30)+noise(t)*.17*np.exp(-t*48))
t=time(.65);write('horn',(.22*np.sin(2*np.pi*370*t)+.2*np.sin(2*np.pi*465*t))*np.minimum(1,t*60)*np.minimum(1,(.65-t)*35))
t=time(2);f=650+350*np.sin(2*np.pi*.5*t);write('siren',np.sin(np.cumsum(f/RATE*2*np.pi))*.18,True)
t=time(2);n=np.convolve(noise(t),np.ones(260)/260,'same');write('wind',n*.6,True)
t=time(2);write('rain',np.convolve(noise(t),np.ones(3)/3,'same')*.1,True)
t=time(.16);write('ui',np.sin(2*np.pi*(720+220*t)*t)*np.sin(np.pi*t/.16)**2*.14)
t=time(.4);write('land',np.convolve(noise(t),np.ones(20)/20,'same')*.55*np.exp(-t*18)+np.sin(2*np.pi*90*t)*.23*np.exp(-t*25))
(out/'manifest.json').write_text(json.dumps({'author':'Veyra contributors','license':'MIT','sampleRate':RATE,'files':manifest},indent=2)+'\n')
print('Original spatial SFX generated:',len(manifest),'mono WAVs,',sum((out/(x['name']+'.wav')).stat().st_size for x in manifest),'bytes')
