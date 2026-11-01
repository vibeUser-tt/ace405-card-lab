import assert from 'node:assert/strict';
import {initialGame} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
for(const [width,height] of [[568,320],[844,390],[390,844],[1440,900]]) {
 const page=await browser.newPage({viewport:{width,height},hasTouch:true});let fixture;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('useState(initialGame)',`useState(() => (${JSON.stringify(fixture)}))`)});});
 const load=async(id,extra={})=>{fixture={...initialGame(),phase:'battle',level:5,round:1,hand:[id],playerBoard:['W1','S2'],npcBoard:['W2','T1'],...extra};await page.goto('http://127.0.0.1:5173/');await page.locator('.hand-card').tap();};
 for(const id of ['F05','F06','F08']) {
  await load(id);const side=id==='F06'?'npc':'player',other=side==='npc'?'player':'npc';
  assert.equal(await page.locator('.target-select').count(),0);assert.equal(await page.locator('.slot-eligible').count(),2);
  assert.equal(await page.locator(`.${other} .building-slots button:enabled`).count(),0);
  assert.equal(await page.locator('.slot-eligible').first().evaluate(e=>getComputedStyle(e).animationName),'slot-breathe');assert(await page.locator('.play-button').isDisabled());
  await page.locator('.slot-eligible').first().tap();assert.equal(await page.locator('.slot-selected').count(),1);assert.equal(await page.locator('.slot-selected').getAttribute('aria-pressed'),'true');
  if(id!=='F08') {
   await page.locator('.metric-select').selectOption({index:1});const metric=await page.locator('.metric-select').inputValue();await page.locator('.slot-selected').tap();assert.equal(await page.locator('.metric-select').inputValue(),metric);
   await page.locator('.slot-eligible').tap();assert.equal(await page.locator('.metric-select').inputValue(),'');assert(await page.locator('.play-button').isDisabled());await page.locator('.metric-select').selectOption({index:1});
  }
  assert(await page.locator('.play-button').isEnabled());const target=await page.locator('.slot-selected').getAttribute('data-card-id');
  await page.screenshot({path:`../output/ace405_plan/slots_${id}_${width}.png`});
  await page.locator('.play-button').tap();await page.waitForFunction(({side,target,kind})=>document.querySelector('.scene-host').dataset.effect===`${kind}:${side}:${target}`,{side,target,kind:id==='F05'?'buff':id==='F06'?'attack':'shield'});
  assert.equal(await page.locator('.slot-eligible,.slot-selected').count(),0);
 }
 await load('F05');await page.locator('.target-cancel').tap();assert.equal(await page.locator('.slot-eligible,.slot-selected').count(),0);
 await load('F05',{energy:0});assert.equal(await page.locator('.slot-eligible').count(),0);assert(await page.locator('.play-button').isDisabled());
 await load('F05',{playerBoard:['W1'],effects:[{side:'player',target:'W1',metric:'D',fraction:.25}]});assert.equal(await page.locator('.slot-eligible').count(),0,'fully optimized target cannot be selected');
 await load('F05');await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.slot-eligible').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.deepEqual(errors,[]);console.log(`${width}x${height}: slot-only optimization/interference/shield, target switching, eligibility, cancellation and reduced motion passed`);await page.close();
}
} finally {await browser.close();}
