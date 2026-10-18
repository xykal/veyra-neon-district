import { CAR_TYPES, PLAYER_RADIUS } from './constants.js';
import { nearbySolids } from './map.js';
import { segmentHitsRect, circleFree, distanceToCar } from './physics.js';

export const ENTRY_REACH = 25;
export const ENTRY_MAX_SPEED = 18;
export function vehicleInfo(c) {
  const type=c.type || c.y2 || 'sedan';
  return {id:c.id??c.i,type,definition:CAR_TYPES[type]||CAR_TYPES.sedan,speed:c.speed??c.s??0,driver:c.driver??c.d??null};
}
export function vehicleDoors(c) {
  const {definition:T}=vehicleInfo(c), a=c.a||0, cx=Math.cos(a),sy=Math.sin(a);
  const along=T.len*.08, side=T.wid/2+PLAYER_RADIUS+2;
  return [-1,1].map(sign=>({x:c.x+cx*along-sy*side*sign,y:c.y+sy*along+cx*side*sign,side:sign}));
}
export function accessVehicle(player, c, map) {
  const info=vehicleInfo(c),distance=distanceToCar(player.x,player.y,c).distance;
  const result={...info,car:c,distance,allowed:false,reason:'Dekati pintu kendaraan',door:null};
  if(distance>ENTRY_REACH)return result;
  if(info.driver)return {...result,reason:'Kendaraan sedang dipakai'};
  if(Math.abs(info.speed)>ENTRY_MAX_SPEED)return {...result,reason:'Tunggu kendaraan berhenti'};
  const doors=vehicleDoors(c).sort((a,b)=>Math.hypot(player.x-a.x,player.y-a.y)-Math.hypot(player.x-b.x,player.y-b.y));
  for(const door of doors) {
    if(!circleFree(door.x,door.y,PLAYER_RADIUS,map))continue;
    const solids=nearbySolids(map,(player.x+door.x)/2,(player.y+door.y)/2,Math.hypot(player.x-door.x,player.y-door.y)/2+8);
    if(solids.some(r=>segmentHitsRect(player.x,player.y,door.x,door.y,r)))continue;
    return {...result,allowed:true,reason:'Masuk '+info.definition.label,door};
  }
  return {...result,reason:'Pintu terhalang; coba sisi lain'};
}
export function findVehicle(player,cars,map,requestedId=null) {
  let eligible=null,nearby=null;
  for(const c of cars) {
    const id=c.id??c.i;if(requestedId!==null&&id!==requestedId)continue;
    const dx=c.x-player.x,dy=c.y-player.y;
    if(dx*dx+dy*dy>160*160)continue;
    const r=accessVehicle(player,c,map);
    if(r.distance>ENTRY_REACH)continue;
    if(!nearby||r.distance<nearby.distance)nearby=r;
    if(r.allowed&&(!eligible||r.distance<eligible.distance))eligible=r;
  }
  return eligible||nearby;
}
