import assert from 'node:assert/strict';
import {initialGame,designs,functions} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let fixture;
 // Inject only through intercepted development responses; production has no state backdoor.
 await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();let body=await response.text();assert(body.includes('useState(initialGame)'));body=body.replace('useState(initialGame)',`useState(() => (${JSON.stringify(fixture)}))`);await route.fulfill({response,body});});
 for(const card of [...designs,...functions]) {
  const id=card.id,isFunction=id.startsWith('F');
  fixture={...initialGame(),phase:'battle',level:5,round:1,maxRounds:8,energy:4,hand:[id,'W2','F06'],drawPile:['I4','T1','S2'],playerBoard:isFunction?['W1']:[],npcBoard:['W2']};
  await page.goto('http://127.0.0.1:5173/');await page.locator('.hand-card').first().click();
  for(let i=0;i<await page.locator('.action-panel select').count();i++)await page.locator('.action-panel select').nth(i).selectOption({index:1});
  if(['F02','F04'].includes(id))await page.locator('.hand-card.target-eligible').first().tap();
  assert(await page.locator('.play-button').isEnabled(),`${id} legal fixture`);
  await page.locator('.play-button').click();await page.locator(`.card-fx-layer[data-effect-card="${id}"]`).waitFor();
  assert(await page.locator('.card-fx-mote').count()>=7);
  if(!isFunction)await page.waitForFunction(id=>document.querySelector('.scene-host').dataset.models.split(',').includes(id),id);
  if(['F05','F06','F08'].includes(id))await page.waitForFunction(kind=>document.querySelector('.scene-host').dataset.effect?.startsWith(kind),id==='F06'?'attack:npc:':id==='F08'?'shield:player:':'buff:player:');
  if(id==='F03')assert.equal((await page.locator('.energy-display b').innerText()),'5');
  if(id==='F04')assert.equal(await page.locator('.hand-card.retained').count(),1);
  if(id==='F07')assert.equal(await page.locator('.boost-mark').count(),1);
  if(['W3','T1','F03','F06','F08'].includes(id)){await page.waitForTimeout(450);await page.screenshot({path:`../output/ace405_plan/effect_${id}.png`});}
  console.log(`${id}: successful play, effect${isFunction?'':' and model'} verified`);
 }
 // Rotate while inspecting a targeted action; selection and board must survive.
 fixture={...initialGame(),phase:'battle',level:5,round:2,hand:['F06'],playerBoard:['T1'],npcBoard:['W2']};
 await page.goto('http://127.0.0.1:5173/');await page.locator('.hand-card').click();
 await page.locator('.action-panel select').nth(0).selectOption('W2');await page.locator('.action-panel select').nth(1).selectOption('D');
 for(const [width,height] of [[390,844],[360,640],[844,390],[740,320],[1440,900]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(200);
  assert.equal(await page.locator('.app-shell').getAttribute('data-layout'),width>height?'wide':'tall');
  assert.equal(await page.locator('.action-panel select').nth(1).inputValue(),'D');
  const panel=await page.locator('.action-panel').boundingBox(),stage=await page.locator('.battle-stage').boundingBox();
  assert(width>height?panel.x>=stage.x+stage.width-1:panel.y>=stage.y+stage.height-1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.setViewportSize({width:844,height:390});
 await page.addStyleTag({content:'.app-shell{--safe-left:44px;--safe-right:44px;--safe-bottom:21px}'});
 await page.waitForTimeout(200);
 const safeStage=await page.locator('.battle-stage').boundingBox(),safePanel=await page.locator('.action-panel').boundingBox(),safeEnd=await page.locator('.turn-actions button').boundingBox();
 assert(safeStage.x>=44&&safePanel.x+safePanel.width<=800&&safeEnd.y+safeEnd.height<=369);
 assert(safePanel.x>=safeStage.x+safeStage.width);
 await page.screenshot({path:'../output/ace405_plan/notch_safe_area.png'});
 await page.locator('.play-button').click();await page.locator('.card-fx-layer[data-effect-card="F06"]').waitFor();
 await page.waitForTimeout(1400);assert.equal(await page.locator('.card-fx-layer').count(),0,'effect cleaned up');
 // Illegal card remains inspectable but cannot fire or consume energy.
 await page.goto('http://127.0.0.1:5173/');
 await page.locator('.hand-card').click();assert(await page.locator('.play-button').isDisabled());assert.equal(await page.locator('.card-fx-layer').count(),0);
 await page.setViewportSize({width:360,height:640});
 fixture={...initialGame(),phase:'battle',level:5,round:1,hand:['F04','W2','P1','S2','F01','F02','F03','T1']};
 await page.goto('http://127.0.0.1:5173/');await page.locator('.hand-card').first().tap();
 await page.locator('.hand-card.target-eligible').first().tap();await page.locator('.hand-card.target-eligible').last().tap();
 await page.screenshot({path:'../output/ace405_plan/portrait_retain.png'});
 await page.locator('.play-button').tap();assert.equal(await page.locator('.hand-card.retained').count(),2);
 await page.locator('.hand-card[data-card-id="W2"]').tap();await page.screenshot({path:'../output/ace405_plan/portrait_install.png'});
 await page.locator('.play-button').tap();await page.waitForFunction(()=>document.querySelector('.scene-host').dataset.models.includes('W2'));
 assert.deepEqual(errors,[]);console.log('All 32 cards, orientation changes, effect cleanup and incomplete selection passed.');
} finally {await browser.close();}
