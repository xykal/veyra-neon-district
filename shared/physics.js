// Authoritative planar capsule/OBB physics, shared with local prediction and offline play.
// World scale: ten world units ≈ one metre. No client position is trusted by the server.
import { nearbySolids } from './map.js';
import { CAR_TYPES, PLAYER_RADIUS, WALK_SPEED, SPRINT_SPEED } from './constants.js';

export function clamp(v,a,b){return v<a?a:v>b?b:v;}
export function lerp(a,b,t){return a+(b-a)*t;}
export function angleDelta(a,b){let d=(b-a+Math.PI)%(Math.PI*2);if(d<0)d+=Math.PI*2;return d-Math.PI;}
export function lerpAngle(a,b,t){return a+angleDelta(a,b)*t;}
export function resolveCircleRect(px,py,r,rect){
  const nx=clamp(px,rect.x,rect.x+rect.w),ny=clamp(py,rect.y,rect.y+rect.h),dx=px-nx,dy=py-ny,d2=dx*dx+dy*dy;
  if(d2>=r*r-1e-8)return null;
  if(d2>1e-8){const d=Math.sqrt(d2),depth=r-d;return{x:px+dx/d*depth,y:py+dy/d*depth,nx:dx/d,ny:dy/d,depth};}
  const sides=[{d:px-rect.x,nx:-1,ny:0},{d:rect.x+rect.w-px,nx:1,ny:0},{d:py-rect.y,nx:0,ny:-1},{d:rect.y+rect.h-py,nx:0,ny:1}];
  sides.sort((a,b)=>a.d-b.d);const s=sides[0],depth=r+s.d;
  return{x:px+s.nx*depth,y:py+s.ny*depth,nx:s.nx,ny:s.ny,depth};
}
export function carBody(c){const T=CAR_TYPES[c.type||c.y2]||CAR_TYPES.sedan;return{x:c.x,y:c.y,a:c.a||0,hx:T.len/2,hy:T.wid/2};}
const rectBody=r=>({x:r.x+r.w/2,y:r.y+r.h/2,a:0,hx:r.w/2,hy:r.h/2});
export function overlapBoxes(a,b){
  const ca=Math.cos(a.a),sa=Math.sin(a.a),cb=Math.cos(b.a),sb=Math.sin(b.a),dx=a.x-b.x,dy=a.y-b.y;
  let depth=Infinity,nx=0,ny=0;
  for(const [x,y]of[[ca,sa],[-sa,ca],[cb,sb],[-sb,cb]]){
    const ra=a.hx*Math.abs(x*ca+y*sa)+a.hy*Math.abs(-x*sa+y*ca);
    const rb=b.hx*Math.abs(x*cb+y*sb)+b.hy*Math.abs(-x*sb+y*cb);
    const d=dx*x+dy*y,overlap=ra+rb-Math.abs(d);
    if(overlap<=1e-7)return null;
    if(overlap<depth){depth=overlap;const sign=d<0?-1:1;nx=x*sign;ny=y*sign;}
  }
  return{depth,nx,ny};
}
export function distanceToCar(x,y,c){
  const b=carBody(c),ca=Math.cos(b.a),sa=Math.sin(b.a),dx=x-b.x,dy=y-b.y;
  const lx=dx*ca+dy*sa,ly=-dx*sa+dy*ca,qx=clamp(lx,-b.hx,b.hx),qy=clamp(ly,-b.hy,b.hy);
  return{distance:Math.hypot(lx-qx,ly-qy),x:b.x+qx*ca-qy*sa,y:b.y+qx*sa+qy*ca};
}
export function circleCar(x,y,r,c){
  const b=carBody(c),ca=Math.cos(b.a),sa=Math.sin(b.a),dx=x-b.x,dy=y-b.y;
  const hit=resolveCircleRect(dx*ca+dy*sa,-dx*sa+dy*ca,r,{x:-b.hx,y:-b.hy,w:2*b.hx,h:2*b.hy});
  if(!hit)return null;
  return{x:b.x+hit.x*ca-hit.y*sa,y:b.y+hit.x*sa+hit.y*ca,nx:hit.nx*ca-hit.ny*sa,ny:hit.nx*sa+hit.ny*ca,depth:hit.depth};
}
export function circleFree(x,y,r,map,cars=[],ignoreId=null){
  if(x<r||y<r||x>map.size-r||y>map.size-r)return false;
  for(const rect of nearbySolids(map,x,y,r+2))if(resolveCircleRect(x,y,r,rect))return false;
  for(const c of cars)if((c.id??c.i)!==ignoreId&&circleCar(x,y,r,c))return false;
  return true;
}
export function resolvePlayerWorld(p,map,r=PLAYER_RADIUS){
  for(let pass=0;pass<4;pass++){
    let hit=false;
    for(const rect of nearbySolids(map,p.x,p.y,r+4)){
      const res=resolveCircleRect(p.x,p.y,r,rect);if(!res)continue;hit=true;p.x=res.x;p.y=res.y;
      const vn=(p.vx||0)*res.nx+(p.vy||0)*res.ny;
      if(vn<0){p.vx-=vn*res.nx;p.vy-=vn*res.ny;}
    }
    if(!hit)break;
  }
  p.x=clamp(p.x,r+.2,map.size-r-.2);p.y=clamp(p.y,r+.2,map.size-r-.2);
}
export function resolvePlayerCars(p,cars,map,r=PLAYER_RADIUS){
  for(let pass=0;pass<3;pass++){
    let moved=false;
    for(const c of cars){
      if(Math.abs(c.x-p.x)>65||Math.abs(c.y-p.y)>65)continue;
      const hit=circleCar(p.x,p.y,r,c);if(!hit)continue;
      p.x=hit.x;p.y=hit.y;moved=true;
      const vn=(p.vx||0)*hit.nx+(p.vy||0)*hit.ny;
      if(vn<0){p.vx-=vn*hit.nx;p.vy-=vn*hit.ny;}
    }
    resolvePlayerWorld(p,map,r);if(!moved)break;
  }
}
export function resolveActors(actors,map){
  for(let pass=0;pass<2;pass++)for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
    const a=actors[i],b=actors[j],r=(a.bodyRadius||PLAYER_RADIUS)+(b.bodyRadius||PLAYER_RADIUS),dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);
    if(d>=r)continue;const nx=d>.001?dx/d:1,ny=d>.001?dy/d:0,push=(r-d)/2+.001;
    a.x+=nx*push;a.y+=ny*push;b.x-=nx*push;b.y-=ny*push;resolvePlayerWorld(a,map,a.bodyRadius||PLAYER_RADIUS);resolvePlayerWorld(b,map,b.bodyRadius||PLAYER_RADIUS);
  }
}
export function stepPlayer(p,input,dt,map,cars=[]){
  dt=clamp(dt||0,0,.1);let mx=Number.isFinite(input.mx)?input.mx:0,my=Number.isFinite(input.my)?input.my:0;
  let len=Math.hypot(mx,my);if(len>1){mx/=len;my/=len;len=1;}
  const speed=input.sprint?SPRINT_SPEED:WALK_SPEED,k=1-Math.exp(-(len>.04?13:21)*dt);
  p.vx=(p.vx||0)+(mx*speed-(p.vx||0))*k;p.vy=(p.vy||0)+(my*speed-(p.vy||0))*k;
  if(len<.04&&Math.hypot(p.vx,p.vy)<.12)p.vx=p.vy=0;
  const count=Math.max(1,Math.ceil(Math.hypot(p.vx,p.vy)*dt/2.5)),h=dt/count;
  for(let n=0;n<count;n++){p.x+=p.vx*h;p.y+=p.vy*h;resolvePlayerWorld(p,map);if(cars.length)resolvePlayerCars(p,cars,map);}
  const moving=Math.hypot(p.vx,p.vy)>.4;
  let target=p.a||0;
  if(input.aim&&Number.isFinite(input.aimAngle))target=input.aimAngle;
  else if(moving)target=Math.atan2(p.vy,p.vx);
  p.a=(p.a||0)+clamp(angleDelta(p.a||0,target),-dt*11,dt*11);
  p.moving=moving;
}
export function resolveCarWorld(c,map,damage=true){
  const T=CAR_TYPES[c.type||c.y2]||CAR_TYPES.sedan;
  for(let pass=0;pass<4;pass++){
    let moved=false;
    for(const rect of nearbySolids(map,c.x,c.y,T.len/2+T.wid/2+4)){
      const hit=overlapBoxes(carBody(c),rectBody(rect));if(!hit)continue;
      moved=true;c.x+=hit.nx*(hit.depth+.005);c.y+=hit.ny*(hit.depth+.005);
      const vn=(c.vx||0)*hit.nx+(c.vy||0)*hit.ny;
      if(vn<0){
        if(damage){c.hp=Math.max(0,(c.hp??100)-Math.min(35,Math.max(0,-vn-45)*.065));c.impact=Math.min(1,-vn/300);}
        c.vx-=vn*hit.nx;c.vy-=vn*hit.ny;c.vx*=.84;c.vy*=.84;c.yawRate=(c.yawRate||0)*.35;c.hit=true;
      }
    }
    if(!moved)break;
  }
  const co=Math.abs(Math.cos(c.a)),si=Math.abs(Math.sin(c.a)),ex=co*T.len/2+si*T.wid/2+.5,ey=si*T.len/2+co*T.wid/2+.5;
  if(c.x<ex||c.x>map.size-ex){c.x=clamp(c.x,ex,map.size-ex);c.vx=0;}
  if(c.y<ey||c.y>map.size-ey){c.y=clamp(c.y,ey,map.size-ey);c.vy=0;}
  c.speed=(c.vx||0)*Math.cos(c.a)+(c.vy||0)*Math.sin(c.a);
}
export function stepCar(c,input,dt,map,wet=false){
  dt=clamp(dt||0,0,.1);const T=CAR_TYPES[c.type||c.y2]||CAR_TYPES.sedan;
  const throttle=clamp(input.throttle||0,-1,1),steer=clamp(input.steer||0,-1,1),hand=!!input.handbrake;
  const oldA=c.a||0,ca=Math.cos(oldA),sa=Math.sin(oldA),max=c.maxSpeed||T.maxSpeed;
  let vx=c.vx??ca*(c.speed||0),vy=c.vy??sa*(c.speed||0),f=vx*ca+vy*sa,lat=-vx*sa+vy*ca;
  const torque=Math.max(.18,1-Math.pow(clamp(Math.abs(f)/max,0,1),1.6));
  const engine=T.accel*.3/(Math.pow(T.mass,.2))*(wet?.88:1);
  const braking=T.brake*.16*(wet?.8:1);
  if(throttle>0){if(f< -3)f=Math.min(0,f+braking*throttle*dt);else f+=engine*throttle*torque*dt;}
  if(throttle<0){if(f>3)f=Math.max(0,f+braking*throttle*dt);else f+=engine*.48*throttle*dt;}
  const resistance=hand?1.2:(Math.abs(throttle)<.02?.24:.065);
  f-=(resistance*f+.00021*f*Math.abs(f))*dt;f=clamp(f,-max*.3,max);
  if(Math.abs(f)<.7&&Math.abs(throttle)<.02)f=0;
  c.steerAngle=(c.steerAngle||0)+(steer-(c.steerAngle||0))*(1-Math.exp(-dt*7));
  const steering=.56/(1+Math.abs(f)/240),wheelbase=T.len*.61;
  let desired=f/Math.max(15,wheelbase)*Math.tan(c.steerAngle*steering)*(hand?1.5:1);
  const lateralLimit=(hand?130:110)*(wet?.66:1)/Math.max(35,Math.abs(f));
  desired=clamp(desired,-lateralLimit,lateralLimit);
  c.yawRate=(c.yawRate||0)+(desired-(c.yawRate||0))*(1-Math.exp(-dt*(hand?4.8:6.2)));
  lat*=Math.exp(-(hand?1.7:13)*(wet?.66:1)*dt);
  f-=Math.abs(lat)*.18*dt*Math.sign(f||1);
  vx=f*ca-lat*sa;vy=f*sa+lat*ca;c.vx=vx;c.vy=vy;c.hit=false;
  const yaw=c.yawRate*dt,n=Math.max(1,Math.min(24,Math.ceil((Math.hypot(vx,vy)*dt+Math.abs(yaw)*T.len/2)/4)));
  for(let k=0;k<n;k++){c.a+=yaw/n;c.x+=c.vx*dt/n;c.y+=c.vy*dt/n;resolveCarWorld(c,map);}
  c.speed=c.vx*Math.cos(c.a)+c.vy*Math.sin(c.a);c.slip=Math.abs(-c.vx*Math.sin(c.a)+c.vy*Math.cos(c.a));
  return c;
}
export function resolveCarCollisions(cars){
  for(let pass=0;pass<3;pass++)for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    const a=cars[i],b=cars[j],ta=CAR_TYPES[a.type||a.y2]||CAR_TYPES.sedan,tb=CAR_TYPES[b.type||b.y2]||CAR_TYPES.sedan;
    const dx=b.x-a.x,dy=b.y-a.y,broad=(Math.hypot(ta.len,ta.wid)+Math.hypot(tb.len,tb.wid))/2;
    if(dx*dx+dy*dy>broad*broad)continue;
    const ia=a.parked&&!a.driver?0:1/ta.mass,ib=b.parked&&!b.driver?0:1/tb.mass;
    if(!ia&&!ib)continue;
    const hit=overlapBoxes(carBody(a),carBody(b));if(!hit)continue;
    const total=ia+ib;a.x+=hit.nx*hit.depth*ia/total;a.y+=hit.ny*hit.depth*ia/total;b.x-=hit.nx*hit.depth*ib/total;b.y-=hit.ny*hit.depth*ib/total;
    const avx=a.vx??Math.cos(a.a)*(a.speed||0),avy=a.vy??Math.sin(a.a)*(a.speed||0),bvx=b.vx??Math.cos(b.a)*(b.speed||0),bvy=b.vy??Math.sin(b.a)*(b.speed||0);
    let ix=hit.nx,iy=hit.ny;
    const rvx=avx-bvx,rvy=avy-bvy,rv=Math.hypot(rvx,rvy);
    // Deep overlap may choose a sideways MTV even for a frontal impact. Recover the incoming contact normal.
    if(rvx*ix+rvy*iy>=-.01&&rv>1&&rvx*dx+rvy*dy>0){ix=-rvx/rv;iy=-rvy/rv;}
    const relative=rvx*ix+rvy*iy;
    if(relative<0){const impulse=-relative*1.08/total;
      if(ia){a.vx=avx+ix*impulse*ia;a.vy=avy+iy*impulse*ia;}
      if(ib){b.vx=bvx-ix*impulse*ib;b.vy=bvy-iy*impulse*ib;}
      if(pass===0)for(const c of[a,b]){c.hp=Math.max(0,(c.hp??100)-Math.min(22,Math.max(0,-relative-60)*.04));c.impact=Math.min(1,-relative/300);}
    }
    for(const c of[a,b]){c.speed=(c.vx??0)*Math.cos(c.a)+(c.vy??0)*Math.sin(c.a);c.bumped=true;}
  }
}
export function segmentHitsRect(x0,y0,x1,y1,r){
  const dx=x1-x0,dy=y1-y0;let lo=0,hi=1;
  for(const[p,q]of[[-dx,x0-r.x],[dx,r.x+r.w-x0],[-dy,y0-r.y],[dy,r.y+r.h-y0]]){if(p===0){if(q<0)return false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}}
  return true;
}
