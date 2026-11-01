import assert from 'node:assert/strict';
import {initialGame,physical} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 for(const [width,height] of [[568,320],[667,375],[844,390],[360,640],[390,844],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const fixture={...initialGame(),phase:'battle',level:0,round:5,maxRounds:5,energy:5,npcEnergy:3,
   hand:['W2','W4','F05'],playerBoard:['W1','P1','S2'],npcBoard:['W1','P1','S2'],npcHand:['W2','F08'],
   npcPlans:[{ids:['W2','P1','S2'],score:80,budget:56}],shields:['W1'],
   effects:[{side:'player',target:'W1',metric:'D',fraction:-.5},{side:'npc',target:'W1',metric:'D',fraction:-.5}]};
  await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('useState(initialGame)',`useState(() => (${JSON.stringify(fixture)}))`)});});
  await page.route(/\/src\/BattleScene\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(scene, camera);','window.__battleScene = {roots, bursts, camera}; renderer.render(scene, camera);')});});
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__battleScene);
  for(const side of ['player','npc'])assert.deepEqual(await page.locator(`.${side} .slot-category`).allTextContents(),['窗','围护','遮阳','平面','材料','系统']);
  await page.locator('.hand-card[data-card-id="W2"]').tap();
  assert.equal(await page.locator('.install-button strong').innerText(),'替换现有装置');
  assert((await page.locator('.selection-hint').innerText()).includes('适度扩大窗面 → 大面积窗面'));
  await page.screenshot({path:`../output/ace405_plan/replacement_before_${width}.png`});
  await page.locator('.install-button').tap();
  await page.waitForFunction(()=>document.querySelector('.scene-host').dataset.effect==='build:player:W2');
  assert.equal(await page.locator('.player .building-slots [data-card-id="W1"]').count(),0);
  assert.equal(await page.locator('.player [data-card-id="W2"] .slot-category').innerText(),'窗');
  assert.equal(await page.locator('.player [data-card-id="W2"] .slot-device').innerText(),'大面积窗面');
  assert((await page.locator('.player .hud-heading').innerText()).includes(`预算 ${physical(['W2','P1','S2']).budget}/100`));
  assert(await page.evaluate(()=>window.__battleScene.bursts.some(b=>b.cue.kind==='dismantle'&&b.cue.target==='W1'&&b.cue.side==='player')));
  const layout=await page.evaluate(()=>{
   const bounds=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
   return {stage:bounds(document.querySelector('.battle-stage')),command:bounds(document.querySelector('.card-command')),
    labels:[...document.querySelectorAll('.slot-category')].map(e=>({label:bounds(e),button:bounds(e.parentElement)}))};
  });
  assert(layout.command.top>=layout.stage.bottom);
  for(const {label,button} of layout.labels){assert(label.top>=button.top&&label.bottom<=button.bottom+.5);assert(label.bottom<=layout.stage.bottom);}
  await page.screenshot({path:`../output/ace405_plan/replacement_after_${width}.png`});
  await page.locator('.hand-card[data-card-id="W4"]').tap();assert((await page.locator('.install-button').innerText()).includes('本轮已经安装'));
  await page.locator('.turn-actions button').tap();
  await page.locator('.npc .building-slots [data-card-id="W2"]').waitFor();
  assert.equal(await page.locator('.npc [data-card-id="W2"] .slot-category').innerText(),'窗');
  await page.locator('.result-modal').waitFor();assert.deepEqual(errors,[]);
  console.log(`${width}x${height}: player/NPC replacement, dismantle particles, persistent categories, budget and round limits passed`);
  await page.close();
 }
}finally{await browser.close();}
