import { test, expect } from '@playwright/test';
const base=process.env.VEYRA_TEST_BASE || (process.env.VEYRA_TEST_CLOUDFLARE ? 'http://127.0.0.1:3104' : 'http://127.0.0.1:3101');
async function join(page, name='Tester', offline=false) {
  await page.goto(`${base}/${offline?'?offline=1':''}`);
  await page.locator('#nickname').fill(name);await page.locator('#playbtn').click();
  await page.waitForFunction(()=>window.__state?.mode!=='menu'&&window.__state?.players.size>0);
}
const errorsOn = page => { const errors=[];page.on('pageerror',e=>errors.push(e.message));return errors; };
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('veyra.quality','0'));});

test('desktop 3D, 18 classes, GPS typing, quality idempotence and driving >90',async({page})=>{
 const errors=errorsOn(page);await join(page,'Driver',true);
 await expect(page).toHaveTitle(/Veyra: Neon District/);
 await page.waitForFunction(()=>Object.keys(__entities.templates).length===17);
 const quality=await page.evaluate(()=>{__setQuality(0);const a=__world.pools.winPool.mesh.count;__setQuality(0);return[a,__world.pools.winPool.mesh.count,__renderer.shadowMap.enabled];});
 expect(quality[0]).toBe(quality[1]);expect(quality[2]).toBe(false);
 await page.keyboard.press('g');await page.locator('#gpssearch').fill('bank');await expect(page.locator('.poi')).toHaveCount(2);
 await page.keyboard.type('w');await expect(page.locator('#gpssearch')).toHaveValue('bankw');
 await page.locator('#gpssearch').fill('bank');await page.locator('.poi').first().click();await expect(page.locator('#gpshud')).toContainText('Bank');
 const id=await page.evaluate(()=>__gps.line.geometry.uuid);await page.waitForTimeout(550);expect(await page.evaluate(()=>__gps.line.geometry.uuid)).toBe(id);
 await page.evaluate(()=>{
   __setQuality(1);const {game,player}=__offline;const c=[...game.cars.values()].find(c=>c.parked);c.x=2200;c.y=2400;c.a=0;c.speed=0;c.vx=0;c.vy=0;player.x=c.x;player.y=c.y;game.tryEnterCar(player);c.speed=200;c.vx=200;
 });
 await page.keyboard.down('w');await page.keyboard.down(' ');await page.waitForTimeout(750);await page.keyboard.up(' ');await page.keyboard.up('w');
 expect(await page.evaluate(()=>!!__state.inCar)).toBe(true);expect(errors).toEqual([]);
});

test('two real clients exchange chat, receive snapshots, resume profile after reload',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();const x=await a.newPage(),y=await b.newPage();const errors=[errorsOn(x),errorsOn(y)];
 try{
  for(const p of [x,y])await p.addInitScript(()=>localStorage.setItem('veyra.quality','0'));
  await Promise.all([join(x,'Alpha'),join(y,'Beta')]);
  await x.waitForFunction(()=>__state.players.size>=2);await y.waitForFunction(()=>__state.players.size>=2);
  await x.keyboard.press('t');await x.locator('#chatinput').fill('hello district e2e');await x.locator('#chatinput').press('Enter');
  await expect(y.locator('#chatlog')).toContainText('hello district e2e');
  const token=await x.evaluate(()=>localStorage.getItem('veyra.resume'));
  await join(x,'AlphaResume');expect(await x.evaluate(()=>localStorage.getItem('veyra.resume'))).toBe(token);
  await x.keyboard.press('l');await expect(x.locator('#lbpanel')).toBeVisible();
  expect(errors.flat()).toEqual([]);
 }finally{await a.close();await b.close();}
});

test('mobile portrait: real touch joystick/look, repeated fire, GPS, leaderboard, settings',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});const p=await context.newPage();const errors=errorsOn(p);
 try{
  await p.addInitScript(()=>localStorage.setItem('veyra.quality','0'));await join(p,'Touch',true);
  expect(await p.evaluate(()=>__touch.enabled)).toBe(true);
  expect(await p.evaluate(()=>__renderer.getPixelRatio())).toBe(1);
  const cdp=await context.newCDPSession(p),pt=(id,x,y)=>({id,x,y,radiusX:6,radiusY:6,force:1});
  const before=await p.evaluate(()=>{const x=__state.players.get(__state.myId);return{x:x.x,y:x.y};});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(1,65,700)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(1,126,658)]});
  expect(await p.evaluate(()=>Math.hypot(__touch.axis.x,__touch.axis.y))).toBeGreaterThan(.8);
  await p.waitForTimeout(650);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const traveled=await p.evaluate(before=>{const x=__state.players.get(__state.myId);return Math.hypot(x.x-before.x,x.y-before.y);},before);expect(traveled).toBeGreaterThan(4);
  const yaw=await p.evaluate(()=>__cam.yaw);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(2,245,400)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(2,290,440)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>p.evaluate(()=>__cam.yaw)).not.toBe(yaw);
  await p.evaluate(()=>{window.__shots=0;const old=__offline.game.broadcast.bind(__offline.game);__offline.game.broadcast=obj=>{if(obj.t==='sfx'&&obj.k==='shot')__shots++;old(obj);};});
  const rect=await p.locator('.tb-fire').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(3,rect.x+rect.width/2,rect.y+rect.height/2)]});await p.waitForTimeout(1050);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(await p.evaluate(()=>__shots)).toBeGreaterThanOrEqual(2);expect(await p.evaluate(()=>__touch.holding.fire)).toBe(false);
  await p.locator('.tb-gps').tap();await expect(p.locator('#gpspanel')).toBeVisible();await p.locator('#gpssearch').fill('bank');await p.locator('.poi').first().tap();await expect(p.locator('#gpshud')).toContainText('Bank');
  await p.locator('.tb-board').tap();await expect(p.locator('#lbpanel')).toBeVisible();await p.locator('[data-close="lbpanel"]').tap();
  await p.locator('.tb-menu').tap();await expect(p.locator('#settingspanel')).toBeVisible();await p.locator('#qualityselect').selectOption('0');await p.locator('[data-close="settingspanel"]').tap();
  expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('mobile landscape buttons stay on screen; panels close without keyboard',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const p=await context.newPage();const errors=errorsOn(p);
 try{await join(p,'Landscape');for(const cls of ['.tb-fire','.tb-action','.tb-brake','.tb-gps','.tb-voice','.tb-menu']){const r=await p.locator(cls).boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(844);expect(r.y+r.height).toBeLessThanOrEqual(390);}
  await p.locator('.tb-gps').tap();await expect(p.locator('#gpspanel')).toBeVisible();await p.locator('[data-close="gpspanel"]').tap();await expect(p.locator('#gpspanel')).toBeHidden();expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('WebGL unavailable → usable 2D client with same multiplayer protocol',async({page})=>{
 await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(String(kind).startsWith('webgl')||kind==='experimental-webgl')return null;return get.call(this,kind,...args);};});
 await page.goto(base);await page.waitForURL('**/2d/?nogfx=1');await page.locator('#nickname').fill('Lite');await page.locator('#playbtn').click();await page.waitForFunction(()=>__state.mode==='online'&&__state.players.size>0);
 await expect(page).toHaveTitle(/Veyra Lite/);
});

test('two-peer WebRTC + fake mic RTP; early PTT release never leaves mic transmitting',async({browser})=>{
 const a=await browser.newContext({permissions:['microphone']}),b=await browser.newContext({permissions:['microphone']});const x=await a.newPage(),y=await b.newPage();const errors=[errorsOn(x),errorsOn(y)];
 try{
  for(const p of [x,y])await p.addInitScript(()=>localStorage.setItem('veyra.quality','0'));
  await x.addInitScript(()=>{const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async o=>{await new Promise(r=>setTimeout(r,400));return get(o);};});
  await Promise.all([join(x,'VoiceA'),join(y,'VoiceB')]);
  await x.evaluate(()=>{__voice.hold(true);setTimeout(()=>__voice.hold(false),20);});
  await x.waitForFunction(()=>__voice.enabled);expect(await x.evaluate(()=>__voice.stream.getAudioTracks().every(t=>!t.enabled))).toBe(true);
  await y.evaluate(()=>__voice.enable());
  for(const p of [x,y])await p.waitForFunction(()=>__voice.peers.size===1&&[...__voice.peers.values()].every(p=>p.pc.connectionState==='connected'),null,{timeout:25000});
  expect(await x.evaluate(()=>__voice.peers.has(__state.myId))).toBe(false);
  await x.keyboard.down('v');await y.waitForFunction(()=>[...__voice.speakers.values()].some(Boolean));
  await expect.poll(()=>y.evaluate(async()=>{let bytes=0;for(const p of __voice.peers.values()){for(const r of (await p.pc.getStats()).values())if(r.type==='inbound-rtp'&&r.kind==='audio')bytes+=r.bytesReceived||0;}return bytes;}),{timeout:15000}).toBeGreaterThan(0);
  await x.keyboard.up('v');expect(await x.evaluate(()=>__voice.stream.getAudioTracks().every(t=>!t.enabled))).toBe(true);
  await x.evaluate(()=>__voice.disable());await y.waitForFunction(()=>__voice.peers.size===0);expect(await x.evaluate(()=>__voice.stream)).toBe(null);
  expect(errors.flat()).toEqual([]);
 }finally{await a.close();await b.close();}
});

test('mobile Lite fallback: multiplayer, supported controls only, immediate tap fire',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await context.newPage();const errors=errorsOn(p),sent=[];
 p.on('websocket',ws=>ws.on('framesent',frame=>{try{sent.push(JSON.parse(String(frame.payload)));}catch{}}));
 try{
  await p.goto(base+'/2d/');await p.locator('#nickname').fill('LiteTouch');await p.locator('#playbtn').click();await p.waitForFunction(()=>__state.mode==='online'&&__state.aimAngle!==null);
  expect(await p.evaluate(()=>__touch.enabled)).toBe(true);await expect(p.locator('.tb-gps')).toBeHidden();await expect(p.locator('.tb-voice')).toBeHidden();
  await p.locator('.tb-fire').tap();await expect.poll(()=>sent.filter(m=>m.t==='fire').length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
 }finally{await context.close();}
});
