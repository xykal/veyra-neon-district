// Identity studio: same GPU-skinned character used in play, sharing the one WebGL renderer.
import * as THREE from './vendor/three.module.js';
import { Character } from './char3d.js';
import { AVATAR_MODELS,SKIN,HAIR,FABRIC,DENIM,FOOTWEAR,HAIR_STYLES,TOP_STYLES,BOTTOM_STYLES,SHOE_STYLES,ACCESSORIES,sanitizeAppearance,packAppearance } from '../shared/avatar.js';
import { softDotTexture } from './fx3d.js';
const $=id=>document.getElementById(id);
export function loadAppearance(){try{return sanitizeAppearance(JSON.parse(localStorage.getItem('veyra.appearance')));}catch{return sanitizeAppearance(null);}}
export function saveAppearance(a){try{localStorage.setItem('veyra.appearance',JSON.stringify(packAppearance(a)));}catch{/* private mode */}}
export class Lobby {
  constructor(renderer) {
    this.renderer=renderer;this.current=loadAppearance();this.wardrobe=false;this.yaw=.1;this.slot=0;this.stage=$('avatar-stage');
    try{this.slots=JSON.parse(localStorage.getItem('veyra.looks'))||[];}catch{this.slots=[];}
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x07111e);this.scene.fog=new THREE.Fog(0x07111e,48,90);
    this.camera=new THREE.PerspectiveCamera(39,1,.1,120);this.camera.position.set(29,14,25);this.camera.lookAt(0,9.6,0);
    this.scene.add(new THREE.HemisphereLight(0xd8e9ff,0x333747,2.2));
    const light=(color,intensity,x,y,z)=>{const l=new THREE.DirectionalLight(color,intensity);l.position.set(x,y,z);this.scene.add(l);};
    light(0xffe5d1,3,25,30,25);light(0x66dfff,2.2,-20,13,-20);light(0xc271e6,.9,15,17,-30);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(29,64),new THREE.MeshStandardMaterial({color:0x0d1c2c,roughness:.7}));floor.rotation.x=-Math.PI/2;floor.position.y=-.08;this.scene.add(floor);
    for(const r of[5.2,9.7]){const ring=new THREE.Mesh(new THREE.RingGeometry(r,r+.055,96),new THREE.MeshBasicMaterial({color:r<6?0x58cbbf:0x234754,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.04;this.scene.add(ring);}
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(9,9),new THREE.MeshBasicMaterial({map:softDotTexture(),color:0x000000,transparent:true,opacity:.65,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.02;this.scene.add(shadow);
    $('avatar-presets').innerHTML=AVATAR_MODELS.map(m=>`<button type="button" class="avatar-preset" data-model="${m.id}" aria-pressed="false"><span class="preset-icon" style="--skin:#${SKIN[(m.id+2)%SKIN.length].toString(16)};--coat:#${FABRIC[m.id].toString(16)}">${String(m.id+1).padStart(2,'0')}</span><span>${m.name}<small>${m.role}</small></span></button>`).join('');
    $('avatar-presets').addEventListener('click',e=>{const b=e.target.closest('[data-model]');if(b)this.set({...this.current,model:Number(b.dataset.model)});});
    const select=(id,field,labels)=>{const el=$(id);el.innerHTML=labels.map((label,i)=>`<option value="${i}">${label}</option>`).join('');el.addEventListener('change',()=>this.set({...this.current,[field]:Number(el.value)}));};
    select('avhair','hair',HAIR_STYLES);select('avtop','top',TOP_STYLES);select('avbottom','bottom',BOTTOM_STYLES);select('avshoes','shoes',SHOE_STYLES);select('avaccessory','accessory',ACCESSORIES);
    const swatches=(id,field,colors)=>{$(id).innerHTML=colors.map((c,i)=>`<button type="button" class="color-swatch" data-field="${field}" data-value="${i}" style="--swatch:#${c.toString(16).padStart(6,'0')}" aria-label="${field} warna ${i+1}" aria-pressed="false"></button>`).join('');};
    swatches('avskin','skin',SKIN);swatches('avhaircolor','hairColor',HAIR);swatches('avtopcolor','topColor',FABRIC);swatches('avbottomcolor','bottomColor',DENIM);swatches('avshoecolor','shoeColor',FOOTWEAR);
    $('customizer').addEventListener('click',e=>{const b=e.target.closest('[data-field]');if(b)this.set({...this.current,[b.dataset.field]:Number(b.dataset.value)});});
    for(const b of document.querySelectorAll('[data-avatar-tab]'))b.addEventListener('click',()=>{for(const p of document.querySelectorAll('[data-avatar-page]'))p.hidden=p.dataset.avatarPage!==b.dataset.avatarTab;for(const t of document.querySelectorAll('[data-avatar-tab]'))t.setAttribute('aria-selected',String(t===b));});
    $('lookslots').addEventListener('click',e=>{const b=e.target.closest('[data-slot]');if(!b)return;this.slot=Number(b.dataset.slot);if(this.slots[this.slot])this.set(this.slots[this.slot]);else this.saveSlot();this.syncSlots();});
    $('save-look').addEventListener('click',()=>this.saveSlot());
    let drag=null;this.stage.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={id:e.pointerId,x:e.clientX};this.stage.setPointerCapture(e.pointerId);});
    this.stage.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId){this.yaw+=(e.clientX-drag.x)*.012;drag.x=e.clientX;}});
    for(const key of['pointerup','pointercancel','lostpointercapture'])this.stage.addEventListener(key,()=>drag=null);
    $('avatar-turn').addEventListener('click',()=>this.yaw+=Math.PI/2);
    this.set(this.current);this.syncSlots();
  }
  set(raw) {
    this.current=sanitizeAppearance(raw,this.current);
    this.character?.dispose();this.character=new Character(this.scene,this.current);
    for(const b of document.querySelectorAll('[data-model]'))b.setAttribute('aria-pressed',String(Number(b.dataset.model)===this.current.model));
    for(const b of document.querySelectorAll('.color-swatch'))b.setAttribute('aria-pressed',String(this.current[b.dataset.field]===Number(b.dataset.value)));
    for(const[id,field]of[['avhair','hair'],['avtop','top'],['avbottom','bottom'],['avshoes','shoes'],['avaccessory','accessory']])$(id).value=String(this.current[field]);
    $('avatar-name').textContent=AVATAR_MODELS[this.current.model].name;
    $('avatar-summary').textContent=TOP_STYLES[this.current.top]+' / '+BOTTOM_STYLES[this.current.bottom]+' / '+SHOE_STYLES[this.current.shoes];
    if(!this.wardrobe)saveAppearance(this.current);
  }
  saveSlot(){this.slots[this.slot]=packAppearance(this.current);try{localStorage.setItem('veyra.looks',JSON.stringify(this.slots));}catch{/* private */}this.syncSlots();$('lookstatus').textContent='Look '+(this.slot+1)+' tersimpan di perangkat ini.';}
  syncSlots(){$('lookslots').innerHTML=[0,1,2].map(i=>`<button type="button" data-slot="${i}" aria-pressed="${i===this.slot}">LOOK 0${i+1}<span>${this.slots[i]?AVATAR_MODELS[sanitizeAppearance(this.slots[i]).model].name:'＋ simpan'}</span></button>`).join('');}
  begin(raw){this.original=sanitizeAppearance(raw);this.wardrobe=true;this.set(this.original);}
  finish(save){if(save)saveAppearance(this.current);else this.set(this.original);this.wardrobe=false;}
  render(dt) {
    this.character.update(dt,{x:0,y:0,facing:this.yaw,speed:0,aim:false});
    const b=this.stage.getBoundingClientRect(),r=this.renderer;
    r.setScissorTest(false);r.setViewport(0,0,innerWidth,innerHeight);r.setClearColor(0x07111e,1);r.clear();
    if(b.width>0&&b.height>0&&b.bottom>0&&b.top<innerHeight){
      this.camera.aspect=b.width/b.height;this.camera.updateProjectionMatrix();
      r.setViewport(b.left,innerHeight-b.bottom,b.width,b.height);r.setScissor(Math.max(0,b.left),Math.max(0,innerHeight-b.bottom),Math.min(innerWidth,b.right)-Math.max(0,b.left),Math.min(innerHeight,b.bottom)-Math.max(0,b.top));r.setScissorTest(true);r.render(this.scene,this.camera);
    }
    r.setScissorTest(false);r.setViewport(0,0,innerWidth,innerHeight);
  }
}
