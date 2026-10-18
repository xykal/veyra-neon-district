// Swept camera sphere against actual 3D building bounds; no "82% distance" wall penetration.
import { nearbyBlockers } from './map.js';
function intersect(from,to,r,pad){
  let lo=0,hi=1;
  const bounds=[[r.x-pad,r.x+r.w+pad],[0,r.top+pad],[r.y-pad,r.y+r.h+pad]];
  const start=[from.x,from.y,from.z],end=[to.x,to.y,to.z];
  for(let i=0;i<3;i++){
    const d=end[i]-start[i];
    if(Math.abs(d)<1e-8){if(start[i]<bounds[i][0]||start[i]>bounds[i][1])return null;continue;}
    let a=(bounds[i][0]-start[i])/d,b=(bounds[i][1]-start[i])/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;
  }
  return lo;
}
export function constrainCamera(map,target,desired,radius=2){
  const distance=Math.hypot(desired.x-target.x,desired.z-target.z);let fraction=1,blocked=null;
  for(const r of nearbyBlockers(map,(target.x+desired.x)/2,(target.z+desired.z)/2,distance/2+radius+4)){
    if(!Number.isFinite(r.top))continue;
    const t=intersect(target,desired,r,radius);
    if(t!==null&&t<fraction){fraction=Math.max(.015,t-.01);blocked=r;}
  }
  return{x:target.x+(desired.x-target.x)*fraction,y:Math.max(2,target.y+(desired.y-target.y)*fraction),z:target.z+(desired.z-target.z)*fraction,fraction,blocked};
}
