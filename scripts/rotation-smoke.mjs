import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
for(const [width,height] of [[844,390],[390,844],[1440,900]]) {
 const page=await browser.newPage({viewport:{width,height},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Read renderer objects only in an intercepted test response, never in the shipped bundle.
 await page.route(/\/src\/BattleScene\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();let body=await response.text();assert(body.includes('renderer.render(scene, camera);'));body=body.replace('renderer.render(scene, camera);','window.__battleScene = {roots, bursts, camera}; renderer.render(scene, camera);');await route.fulfill({response,body});});
 await page.route('**/rotation-fixture',route=>route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script type="module">
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import {BattleScene} from '/src/BattleScene.tsx';import {initialGame} from '/src/game.ts';import '/src/battle.css';import '/src/adaptive.css';
 const root=ReactDOM.createRoot(document.getElementById('root'));window.clicks=[];let g={...initialGame(),phase:'battle',level:5,round:1,playerBoard:['W2','I3','S2','P4','M1','T1'],npcBoard:['W2','I3','S2','P4','M1','T1']};
 window.updateScene=(kind,target='W2',side='player')=>{g={...g,effects:kind==='attack'?[{side,target,metric:'D',fraction:-.5}]:[],shields:kind==='shield'?[target]:[]};root.render(React.createElement(BattleScene,{game:g,cue:kind?{serial:performance.now(),kind,target,side}:null,onTarget:(side,id)=>window.clicks.push({side,id})}));};window.updateScene();
 </script></body></html>`}));
 await page.goto('http://127.0.0.1:5173/rotation-fixture');await page.waitForFunction(()=>window.__battleScene?.roots.player);await page.waitForTimeout(100);
 const r=await page.locator('.scene-host').boundingBox(),x=r.x+r.width*.75,y=r.y+r.height*.6;
 const angles=()=>page.evaluate(()=>Object.fromEntries(Object.entries(window.__battleScene.roots).map(([side,root])=>[side,[root.rotation.x,root.rotation.y,root.rotation.z]])));
 const before=await angles();
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+r.width*.08,y-15,{steps:8});await page.mouse.up();
 let after=await angles();assert(Math.abs(after.player[1]-before.player[1])>.5);assert.deepEqual(after.npc,before.npc);assert.equal(after.player[0],0);assert.equal(after.player[2],0);assert.equal(await page.evaluate(()=>window.clicks.length),0,'drag must not select a device');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+35,{steps:6});await page.mouse.up();assert.deepEqual(await angles(),after,'vertical drag must not tilt or turn');
 // Real touch input through CDP, confined to the opponent half even when crossing the divider.
 const cdp=await page.context().newCDPSession(page),tx=r.width*.25,ty=y;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+r.width*.3,y:ty}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const touch=await angles();assert(Math.abs(touch.npc[1]-after.npc[1])>1);assert.deepEqual(touch.player,after.player);assert.equal(touch.npc[0],0);assert.equal(touch.npc[2],0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await page.locator('.scene-host').getAttribute('data-dragging'),null);
 // All six attachment locations remain correct after rotation and after rebuilding meshes.
 const anchors={W2:[0,1.5,1.36],I3:[-1.6,1.3,.3],S2:[0,2,1.65],P4:[0,2.7,0],M1:[1.5,1.3,.4],T1:[.65,3.1,0]};
 for(const [id,local] of Object.entries(anchors)) {
  await page.evaluate(id=>window.updateScene('build',id),id);await page.waitForTimeout(80);assert.deepEqual(await angles(),touch,'mesh rebuilding preserves yaw');
  const error=await page.evaluate(({id,local})=>{const {roots,bursts}=window.__battleScene,b=bursts.findLast(b=>b.cue.target===id),a=roots.player.rotation.y,p=roots.player.position;const expected=[p.x+roots.player.scale.x*(local[0]*Math.cos(a)+local[2]*Math.sin(a)),p.y+roots.player.scale.x*local[1],p.z+roots.player.scale.x*(-local[0]*Math.sin(a)+local[2]*Math.cos(a))];return Math.max(...b.to.toArray().map((n,i)=>Math.abs(n-expected[i])));},{id,local});assert(error<1e-6,`${id} rotated anchor`);
 }
 await page.evaluate(()=>window.updateScene('attack','W2','npc'));await page.waitForTimeout(50);
 await page.mouse.move(tx,y);await page.mouse.down();await page.mouse.move(tx+45,y,{steps:4});
 await page.waitForTimeout(100);
 assert(await page.evaluate(()=>{const {roots,bursts}=window.__battleScene,b=bursts.findLast(b=>b.cue.kind==='attack'),root=roots.npc,a=root.rotation.y;return Math.abs(b.to.x-(root.position.x+root.scale.x*1.36*Math.sin(a)))<1e-6&&Math.abs(b.to.z-(root.position.z+root.scale.x*1.36*Math.cos(a)))<1e-6;}),'moving target followed during attack');
 await page.mouse.up();await page.waitForTimeout(250);await page.screenshot({path:`../output/ace405_plan/rotated_attack_${width}.png`});
 // Return the player to a visible front angle, then tap an installed window mesh.
 const current=(await angles()).player[1],dx=(-.35-current)/(Math.PI*2)*(r.width/2);
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y,{steps:8});await page.mouse.up();
 await page.evaluate(()=>window.updateScene('shield'));await page.waitForTimeout(150);
 const point=await page.evaluate(()=>{const {roots,camera}=window.__battleScene,part=roots.player.children.find(o=>o.userData.id==='W2'),mesh=part.children[0],v=mesh.position.clone();part.localToWorld(v);v.project(camera);const r=document.querySelector('.scene-host').getBoundingClientRect();return {x:r.x+(v.x+1)/2*r.width,y:r.y+(1-v.y)/2*r.height};});
 await page.mouse.click(point.x,point.y);assert.deepEqual(await page.evaluate(()=>window.clicks.at(-1)),{side:'player',id:'W2'},'tap raycasting works after rotation with shield');
 const saved=await angles();await page.setViewportSize({width:height,height:width});await page.waitForTimeout(100);assert.deepEqual(await angles(),saved,'resize preserves yaw');
 assert.deepEqual(errors,[]);console.log(`${width}x${height}: independent Y-only mouse/touch drag, cancellation, six effect anchors, live attack tracking and ray selection passed`);await page.close();
}
} finally {await browser.close();}
