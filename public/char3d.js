// Original GPU-skinned modular citizens. Front = +X, Y up, 10 units ≈ 1 metre.
// One vertex-coloured body draw call per citizen, rather than dozens of separate limb meshes.
import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { AVATAR_MODELS, SKIN, FABRIC, DENIM, HAIR, FOOTWEAR, sanitizeAppearance, avatarPalette, appearanceKey } from '../shared/avatar.js';
export const SKIN_TONES=SKIN,SHIRT_COLORS=FABRIC,PANTS_COLORS=DENIM,HAIR_COLORS=HAIR,SHOE_COLORS=FOOTWEAR;
const cache=new Map(),TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,k)=>a+(b-a)*k;
const diff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const mixColor=(hex,k)=>new THREE.Color(hex).multiplyScalar(k);
const capsule=(radius,length)=>{const g=new THREE.CapsuleGeometry(radius,Math.max(.02,length-2*radius),4,8);g.translate(0,-length/2,0);return g;};
const sharedGun=new THREE.BoxGeometry(2.25,.65,.62);
const sharedGrip=new THREE.BoxGeometry(.65,1.25,.6);

export class Character {
  constructor(scene,palette={}) {
    this.scene=scene;this.root=new THREE.Group();this.root.name='Citizen';
    this.phase=0;this.t=0;this.speed=0;this.aimBlend=0;this.motion='idle';
    this.appearance=sanitizeAppearance(palette);
    const p=avatarPalette(this.appearance),legacy=palette.skinColor===undefined&&palette.skin>100;
    this.pal={skin:legacy?palette.skin:p.skinColor,shirt:palette.shirt??p.shirt,pants:palette.pants>100?palette.pants:p.pants,hair:legacy?palette.hair:p.hairHex,shoes:legacy?palette.shoes:p.shoeHex};
    this.key=appearanceKey(this.appearance)+':'+Object.values(this.pal).join('.');
    this.build();scene.add(this.root);
  }
  build() {
    const a=this.appearance,P=this.pal,feminine=a.model>=3;
    this.bones=[];
    const bone=(name,parent,x,y,z)=>{const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);parent?.add(b);this.bones.push(b);return b;};
    this.hips=bone('hips',null,0,8.4,0);
    this.torso=bone('spine',this.hips,0,1,0);
    this.neck=bone('neck',this.torso,0,5,0);
    const arm=side=>{const shoulder=bone('shoulder'+side,this.torso,0,4.1,side*(feminine?1.8:2.08));const elbow=bone('elbow'+side,shoulder,0,-3.1,0);const hand=bone('hand'+side,elbow,0,-2.65,0);return{shoulder,elbow,hand};};
    const leg=side=>{const hip=bone('thigh'+side,this.hips,0,0,side*(feminine?1.05:1));const knee=bone('knee'+side,hip,0,-4,0);const ankle=bone('ankle'+side,knee,0,-3.8,0);return{hip,knee,ankle};};
    this.armL=arm(1);this.armR=arm(-1);this.legL=leg(1);this.legR=leg(-1);
    this.hips.updateMatrixWorld(true);
    let item=cache.get(this.key);
    if(!item) {
      const parts=[];
      const add=(g,b,color,x=0,y=0,z=0,scale=null,rot=null)=>{
        if(scale)g.scale(...scale);if(rot){g.rotateX(rot[0]);g.rotateY(rot[1]);g.rotateZ(rot[2]);}g.translate(x,y,z);g.applyMatrix4(b.matrixWorld);
        const n=g.attributes.position.count,index=new Uint16Array(n*4),weight=new Float32Array(n*4),colors=new Float32Array(n*3),c=color?.isColor?color:new THREE.Color(color);
        for(let i=0;i<n;i++){index[i*4]=this.bones.indexOf(b);weight[i*4]=1;colors.set([c.r,c.g,c.b],i*3);}
        g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));parts.push(g);
      };
      const box=(b,c,x,y,z,w,h,d)=>add(new THREE.BoxGeometry(w,h,d),b,c,x,y,z);
      const sphere=(b,c,x,y,z,r,scale=null)=>add(new THREE.SphereGeometry(r,12,9),b,c,x,y,z,scale);
      // Pelvis / belt; softly tapered torso instead of a cylinder with disconnected shoulders.
      sphere(this.hips,P.pants,0,.4,0,1,[1.02,1.2,feminine?1.72:1.6]);
      box(this.hips,0x292a2b,.02,1.25,0,2.1,.36,3.15);
      box(this.hips,0xa0a6a6,1.1,1.25,0,.15,.35,.55);
      const chestColor=a.top===4?mixColor(P.shirt,.66):P.shirt;
      add(new THREE.CylinderGeometry(feminine?1.9:2.15,1.55,4.8,10),this.torso,chestColor,0,2.4,0,[.63,1,1]);
      sphere(this.torso,P.shirt,0,4.25,0,1,[1.25,.65,feminine?2:2.2]);
      if(a.top===1||a.top===3) {
        box(this.torso,0xd6d3ca,1.19,2.5,0,.2,4.25,1.3);
        for(const side of[-1,1]){box(this.torso,P.shirt,1.28,2.7,side*1.05,.25,4.6,.95);box(this.torso,mixColor(P.shirt,.75),1.45,2.4,side*1.12,.15,1,.65);}
        box(this.torso,0x89929a,1.46,3,0,.08,4,.08);
      }
      if(a.top===0){box(this.torso,mixColor(P.shirt,.68),1.12,3.1,-.7,.1,.5,.6);}
      if(a.top===2) {
        add(new THREE.SphereGeometry(2.12,12,10,-Math.PI/2,Math.PI),this.neck,mixColor(P.shirt,.8),-.12,1.6,0,[1,1.1,.85]);
        for(const side of[-1,1])box(this.torso,0xd9d4c5,1.3,3.6,side*.45,.07,1.6,.07);
        box(this.torso,mixColor(P.shirt,.8),1.17,1.25,0,.3,1.15,2.1);
      }
      if(a.top===3)for(const side of[-1,1])box(this.torso,mixColor(P.shirt,.7),1.45,3.25,side*1.05,.1,.75,.65);
      if(a.top===4)for(const side of[-1,1])box(this.torso,P.shirt,1.35,2.2,side*1,.22,2.5,.85);
      // Face: forward-facing eyes, nose and ears. No facial features on the back of the head.
      add(new THREE.CylinderGeometry(.65,.78,.85,8),this.neck,P.skin,0,.25,0);
      sphere(this.neck,P.skin,0,1.65,0,1.3,[.98,1.13,feminine?.84:.89]);
      for(const side of[-1,1]) {
        sphere(this.neck,P.skin,0,1.65,side*1.1,.27,[.7,1.15,.8]);
        sphere(this.neck,0xeee8dc,1.18,1.85,side*.45,.16,[.8,.82,1.2]);
        sphere(this.neck,0x26343a,1.3,1.85,side*.45,.075);
        box(this.neck,P.hair,1.22,2.12,side*.45,.09,.1,.43);
      }
      add(new THREE.ConeGeometry(.26,.6,7),this.neck,P.skin,1.28,1.42,0,null,[0,0,-Math.PI/2]);
      box(this.neck,0x935f52,1.26,1.02,0,.08,.09,.44);
      sphere(this.neck,mixColor(P.skin,.96),.27,.67,0,.86,[1.04,.45,.9]);
      // Hair styles are geometry, not just a tint.
      if(a.hair!==6) {
        add(new THREE.SphereGeometry(1.37,12,9,0,TAU,0,Math.PI*(a.hair===5?.45:.42)),this.neck,P.hair,0,1.7,0,[1.02,1.17,.9]);
        if([0,1,2].includes(a.hair))box(this.neck,P.hair,1.02,2.56,a.hair===1?.2:0,.65,.42,1.95);
        if(a.hair===2)for(let k=0;k<4;k++)sphere(this.neck,P.hair,.2-k*.55,3.02,.1,.43,[1,1.2,1.45]);
        if(a.hair===3||a.hair===4)add(new THREE.SphereGeometry(1.4,12,10,-Math.PI/2,Math.PI),this.neck,P.hair,-.05,1.25,0,[1,1.2,1]);
        if(a.hair===4){sphere(this.neck,P.hair,-1.4,2.1,0,.6);add(capsule(.55,2.7),this.neck,P.hair,-1.65,1.9,0);}
        if(a.hair===7)for(let i=0;i<12;i++){const phi=i/12*TAU;sphere(this.neck,P.hair,Math.cos(phi)*1.02,2.75+Math.sin(i*7)*.2,Math.sin(phi)*.95,.46);}
      }
      if(a.accessory===1) {
        for(const side of[-1,1])box(this.neck,0x121b25,1.36,1.85,side*.5,.13,.42,.78);
        box(this.neck,0x192531,1.4,1.9,0,.1,.1,.3);
      }
      if(a.accessory===2){add(new THREE.SphereGeometry(1.45,12,8,0,TAU,0,Math.PI*.49),this.neck,P.shirt,0,1.78,0,[1,1.16,.91]);box(this.neck,P.shirt,1.4,2.43,0,1.75,.15,1.9);}
      if(a.accessory===3)add(new THREE.SphereGeometry(1.48,12,9,0,TAU,0,Math.PI*.55),this.neck,P.shirt,0,1.9,0,[1,1.2,.94]);
      for(const arm of[this.armL,this.armR]) {
        const long=a.top===1||a.top===2||a.top===3;
        add(capsule(.77,3.1),arm.shoulder,long?P.shirt:P.skin);
        if(!long)add(capsule(.89,1.6),arm.shoulder,a.top===4?P.skin:P.shirt,0,.05,0);
        sphere(arm.shoulder,long?P.shirt:P.skin,0,-.3,0,.75);
        sphere(arm.elbow,long?P.shirt:P.skin,0,0,0,.62);
        add(capsule(.62,2.65),arm.elbow,long?P.shirt:P.skin);
        sphere(arm.hand,P.skin,0,-.18,0,.64,[.85,1.15,.7]);
        if(long)box(arm.hand,mixColor(P.shirt,.6),0,.25,0,1.15,.42,1.05);
      }
      for(const leg of[this.legL,this.legR]) {
        add(capsule(.97,4),leg.hip,P.pants);
        sphere(leg.knee,a.bottom===2?P.skin:P.pants,0,0,0,.78);
        add(capsule(a.bottom===3?.72:.83,3.8),leg.knee,a.bottom===2?P.skin:P.pants);
        if(a.bottom===1)box(leg.hip,mixColor(P.pants,.82),.05,-2.3,Math.sign(leg.hip.position.z)*.87,1.1,1.2,.4);
        if(a.bottom===2)box(leg.hip,P.pants,0,-2.5,0,1.7,.6,1.65);
        const boot=a.shoes===1;
        if(boot)add(capsule(.83,1.65),leg.ankle,P.shoes,0,1.65,0);
        box(leg.ankle,P.shoes,.66,-.02,0,2.6,boot?1.25:.95,1.65);
        box(leg.ankle,a.shoes===3?0x15171a:0xc8c8c4,.66,-.57,0,2.7,.25,1.7);
      }
      const geometry=mergeGeometries(parts,false);for(const part of parts)part.dispose();
      geometry.computeBoundingSphere();item={geometry,refs:0};cache.set(this.key,item);
    }
    item.refs++;this.cacheItem=item;
    this.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.025});
    this.mesh=new THREE.SkinnedMesh(item.geometry,this.material);this.mesh.name='Skinned citizen body';this.mesh.frustumCulled=false;
    this.mesh.castShadow=true;this.mesh.receiveShadow=true;this.mesh.add(this.hips);this.root.add(this.mesh);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    const m=AVATAR_MODELS[a.model];this.root.scale.set(m.depth,m.height,m.width);
    this.gun=new THREE.Group();
    this.gunMaterial=new THREE.MeshStandardMaterial({color:0x252c34,roughness:.45,metalness:.45});
    const slide=new THREE.Mesh(sharedGun,this.gunMaterial);slide.position.x=.8;this.gun.add(slide);
    const grip=new THREE.Mesh(sharedGrip,this.gunMaterial);grip.position.set(0,-.5,0);this.gun.add(grip);
    this.muzzle=new THREE.Object3D();this.muzzle.position.set(2,0,0);this.gun.add(this.muzzle);
    this.armR.hand.add(this.gun);this.gun.visible=false;
  }
  setOpacity(value){this.material.transparent=value<.99;this.material.opacity=value;this.material.depthWrite=value>=.99;}
  update(dt,s) {
    this.t+=dt;const k=1-Math.exp(-dt*11),targetSpeed=clamp(Math.abs(s.speed||0),0,80);
    this.speed=smooth(this.speed,targetSpeed,k);const moving=clamp(this.speed/8,0,1),run=clamp((this.speed-28)/32,0,1);
    const stride=15+13*run;this.phase+=this.speed*dt/stride*TAU;
    const face=Number.isFinite(s.facing)?s.facing:0;
    this.root.position.set(s.x,s.height||0,s.y);this.root.rotation.set(0,-face,0);
    this.aimBlend=smooth(this.aimBlend,s.aim?1:0,1-Math.exp(-dt*14));const aim=this.aimBlend;
    this.gun.visible=aim>.08&&!s.seated;
    const delta=s.moveAngle===undefined?0:clamp(diff(s.moveAngle,face),-.75,.75);
    this.hips.rotation.y=-delta*aim*.45;
    const bounce=Math.sin(this.phase*2)*(.1+run*.17)*moving;
    this.hips.position.y=8.4-moving*(.78+run*.72)+bounce;
    this.hips.rotation.x=Math.sin(this.phase)*.035*moving;
    this.torso.rotation.z=-run*.12*moving+Math.sin(this.t*1.9)*.008*(1-moving);
    this.torso.rotation.y=-this.hips.rotation.y*.9+Math.sin(this.phase)*.035*moving*(1-aim);
    this.neck.rotation.y=-this.torso.rotation.y*.5;this.neck.rotation.z=-this.torso.rotation.z*.45;
    const poseLeg=(leg,offset)=>{
      let u=((this.phase/TAU+offset)%1+1)%1,stance=.52-run*.12;
      let x=0,lift=0;
      if(u<stance)x=(.5-u/stance)*stride*stance;
      else {const f=(u-stance)/(1-stance),ease=f*f*(3-2*f);x=(-.5+ease)*stride*stance;lift=Math.sin(f*Math.PI)*(1.15+run*1.5);}
      x*=moving;lift*=moving;
      const dy=this.hips.position.y-(.72+lift),maxX=Math.sqrt(Math.max(.01,7.77*7.77-dy*dy));x=clamp(x,-maxX,maxX);
      const dist=clamp(Math.hypot(x,dy),.5,7.79);
      const hip=Math.atan2(x,dy)+Math.acos(clamp((16+dist*dist-14.44)/(8*dist),-1,1));
      const knee=-(Math.PI-Math.acos(clamp((16+14.44-dist*dist)/(30.4),-1,1)));
      leg.hip.rotation.set(0,0,hip);leg.knee.rotation.set(0,0,knee);leg.ankle.rotation.set(0,0,-hip-knee);
    };
    poseLeg(this.legL,0);poseLeg(this.legR,.5);
    const swing=Math.sin(this.phase)*(.3+run*.5)*moving;
    for(const [arm,sign]of[[this.armL,-1],[this.armR,1]]) {
      const shoulder=swing*sign*(1-aim)+(arm===this.armR?1.4:1.05)*aim;
      const elbow=(-.12-run*.5)*(1-aim)+(arm===this.armR?-.25:-.85)*aim;
      arm.shoulder.rotation.set(Math.sin(this.t*1.3)*.02,0,shoulder);
      arm.elbow.rotation.set(0,0,elbow);arm.hand.rotation.set(0,0,-(shoulder+elbow)*aim);
    }
    this.motion=aim>.5?'aim':this.speed<.8?'idle':this.speed<20?'walk':run>.45?'sprint':'jog';
    if(s.seated) {
      this.motion=s.seated==='bike'?'riding':'seated';this.hips.position.y=s.seated==='bike'?8.1:5.8;this.hips.rotation.set(0,0,0);this.torso.rotation.set(0,0,s.seated==='bike'?-.18:0);
      for(const leg of[this.legL,this.legR]){leg.hip.rotation.z=1.2;leg.knee.rotation.z=-1.75;leg.ankle.rotation.z=.55;}
      for(const arm of[this.armL,this.armR]){arm.shoulder.rotation.z=1.05;arm.elbow.rotation.z=-.5;arm.hand.rotation.z=-.55;}
    }
    this.root.updateMatrixWorld(true);
  }
  muzzleWorld(out=new THREE.Vector3()){this.root.updateMatrixWorld(true);return this.muzzle.getWorldPosition(out);}
  dispose() {
    this.scene.remove(this.root);this.material.dispose();this.gunMaterial.dispose();this.mesh.skeleton.dispose();this.cacheItem.refs--;
    if(cache.size>48)for(const[key,value]of cache)if(!value.refs){value.geometry.dispose();cache.delete(key);if(cache.size<=40)break;}
  }
}
export class CharacterManager {
  constructor(scene){this.scene=scene;this.chars=new Map();}
  ensure(id,palette){
    let c=this.chars.get(id);const key=JSON.stringify(palette);
    if(c&&c.paletteKey!==key){c.dispose();this.chars.delete(id);c=null;}
    if(!c){c=new Character(this.scene,palette);c.paletteKey=key;this.chars.set(id,c);}return c;
  }
  remove(id){const c=this.chars.get(id);if(c){c.dispose();this.chars.delete(id);}}
  prune(ids){for(const id of this.chars.keys())if(!ids.has(id))this.remove(id);}
}
