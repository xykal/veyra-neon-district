// Bounded local input prediction + authoritative replay. Never sends client coordinates.
import { PLAYER_RADIUS } from '../shared/constants.js';
import { stepPlayer,stepCar,resolvePlayerCars,resolveCarCollisions,resolveCarWorld } from '../shared/physics.js';
export class Prediction {
  constructor(){this.reset();}
  reset(){this.body=null;this.vehicle=0;this.history=[];this.offset={x:0,y:0};this.lastAck=-1;}
  seed(player,car){this.vehicle=player.v||0;this.body=car?{...car,type:car.y2,speed:car.s,steerAngle:car.st||0}:{...player,vx:player.vx||0,vy:player.vy||0};this.history=[];this.offset={x:0,y:0};this.lastAck=player.q||0;}
  avoidActors(body,map,cars){
    for(const a of this.actors||[]){const dx=body.x-a.x,dy=body.y-a.y,r=PLAYER_RADIUS+(a.bodyRadius||PLAYER_RADIUS),d=Math.hypot(dx,dy);if(d<r&&d>.001){body.x=a.x+dx/d*r;body.y=a.y+dy/d*r;}}
    resolvePlayerCars(body,cars,map);
  }
  simulate(body,input,dt,map,cars){
    const count=Math.max(1,Math.ceil(dt/(1/60))),h=dt/count;
    for(let step=0;step<count;step++)this.simulateStep(body,input,h,map,cars);
  }
  simulateStep(body,input,dt,map,cars){
    if(this.vehicle){stepCar(body,input,dt,map,this.wet);const nearby=cars.filter(c=>c.i!==this.vehicle&&Math.hypot(c.x-body.x,c.y-body.y)<120).map(c=>({...c,type:c.y2,speed:c.s,parked:true,driver:null}));resolveCarCollisions([body,...nearby]);resolveCarWorld(body,map,false);}
    else {stepPlayer(body,input,dt,map,cars);this.avoidActors(body,map,cars);}
  }
  reconcile(player,car,map,cars){
    if(!player||player.d){this.reset();return;}
    if(!this.body||this.vehicle!==(player.v||0)){this.seed(player,car);return;}
    const ack=player.q||0;if(ack<this.lastAck)return;this.lastAck=ack;
    const previous={x:this.body.x+this.offset.x,y:this.body.y+this.offset.y};
    const next=car?{...car,type:car.y2,speed:car.s,steerAngle:car.st||0}:{...player,vx:player.vx||0,vy:player.vy||0};
    this.history=this.history.filter(c=>c.q>ack).slice(-120);
    for(const cmd of this.history)this.simulate(next,cmd.input,cmd.dt,map,cars);
    this.body=next;const dx=previous.x-next.x,dy=previous.y-next.y,d=Math.hypot(dx,dy);
    this.offset=d>25?{x:0,y:0}:{x:dx,y:dy};
  }
  advance(player,car,input,dt,q,map,cars){
    if(!player||player.d){this.reset();return null;}
    if(!this.body||this.vehicle!==(player.v||0))this.seed(player,car);
    dt=Math.min(.05,dt);this.simulate(this.body,input,dt,map,cars);
    this.history.push({q,input:{...input},dt});if(this.history.length>120)this.history.shift();
    const k=Math.exp(-dt*17);this.offset.x*=k;this.offset.y*=k;
    const visual={...this.body,x:this.body.x+this.offset.x,y:this.body.y+this.offset.y};
    // Reconciliation smoothing must not render a capsule/body through a solid wall.
    if(this.vehicle)resolveCarWorld(visual,map,false);else this.avoidActors(visual,map,cars);
    return visual;
  }
}
