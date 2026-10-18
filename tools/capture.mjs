// Documentation screenshots: local demo, staged positions; not a performance benchmark.
// Start `npm start` first, then `node tools/capture.mjs`.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const url=process.env.CAPTURE_URL || 'http://127.0.0.1:3000';
mkdirSync('docs',{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('veyra.quality','0');localStorage.setItem('veyra.appearance',JSON.stringify([1,2,2,1,1,4,1,1,0,0,0]));});
  await page.goto(url+'/?offline=1');await page.waitForFunction(()=>window.__renderer&&Object.keys(__entities.templates).length===17);
  await page.screenshot({path:`docs/veyra-menu${mobile?'-mobile':''}.png`});
  await page.locator('#nickname').fill('VeyraDemo');await page.locator('#playbtn').click();
  await page.waitForFunction(()=>window.__offline&&__state.cur);
  await page.evaluate(()=>{
   window.__timeOfDay=.17;__cam.yaw=0;__cam.freeLook=0;
   const {game,player}=__offline;player.x=2100;player.y=2357;player.a=0;player.vx=player.vy=0;
   game.weather.kind=0;const types=['sport','ambulance','bus','suv','taxi','police'];
   for(let k=0;k<types.length;k++){const c=[...game.cars.values()].find(c=>c.type===types[k]);if(!c)continue;c.x=2140+(k%3)*72;c.y=2380+Math.floor(k/3)*40;c.a=0;c.ai=false;c.speed=0;c.vx=c.vy=0;c.parked=true;}
   game.lastSnapshot=0;game.sendSnapshot();__camera.position.set(2034,23,2359);
  });
  if(!mobile)await page.mouse.move(720,430);
  await page.waitForTimeout(900);await page.screenshot({path:`docs/veyra-play${mobile?'-mobile':''}.png`});
  if(mobile){await page.locator('.tb-gps').tap();}else await page.keyboard.press('g');
  await page.locator('#gpssearch').fill('bank');await page.locator('.poi').first().click();await page.waitForTimeout(500);
  if(!mobile)await page.screenshot({path:'docs/veyra-gps.png'});
  if(mobile){await page.setViewportSize({width:844,height:390});await page.waitForTimeout(700);await page.screenshot({path:'docs/veyra-landscape.png'});}
  console.log(mobile?'Mobile captures':'Desktop captures',errors.length?'ERRORS: '+errors.join('; '):'OK');
  await context.close();
 }
} finally {await browser.close();}
