// Seeded, public world geometry/vehicle definitions for the native client. Never profile data.
import fs from 'node:fs';
import path from 'node:path';
import { Game } from '../shared/game.js';
import { CAR_TYPES } from '../shared/constants.js';
const root=path.resolve(new URL('../',import.meta.url).pathname);
const game=new Game({seed:20251018}),p=game.addPlayer('Native spawn');
const {grid,solidGrid,...map}=game.map;
const data={version:1,unitsPerMetre:10,seed:game.seed,map,cars:[...game.cars.values()].map(({id,type,x,y,a,parked,ai})=>({id,type,x,y,a,parked,ai})),types:CAR_TYPES,spawn:{x:p.x,y:p.y,a:p.a}};
fs.mkdirSync(path.join(root,'native/assets'),{recursive:true});fs.writeFileSync(path.join(root,'native/assets/district.json'),JSON.stringify(data));
fs.cpSync(path.join(root,'public/assets/cars'),path.join(root,'native/assets/cars'),{recursive:true});
fs.copyFileSync(path.join(root,'public/icon.svg'),path.join(root,'native/assets/icon.svg'));
console.log(`Native public world: ${map.buildings.length} buildings, ${data.cars.length} vehicle starts, ${map.pois.length} destinations.`);
