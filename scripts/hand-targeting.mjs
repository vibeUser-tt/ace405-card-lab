import assert from 'node:assert/strict';
import {initialGame} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
for(const [width,height] of [[568,320],[844,390],[360,640],[390,844],[1440,900]]) {
 const page=await browser.newPage({viewport:{width,height},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));let fixture;
 await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();const body=(await response.text()).replace('useState(initialGame)',`useState(() => (${JSON.stringify(fixture)}))`);await route.fulfill({response,body});});
 const cards=page.locator('.hand-card'),play=page.locator('.play-button');
 for(const id of ['F02','F04']) {
  fixture={...initialGame(),phase:'battle',level:5,round:1,maxRounds:8,hand:['W2',id,'T1',id,'S2'],playerBoard:['W1'],built:true,drawPile:['I4','P1']};
  await page.goto('http://127.0.0.1:5173/');assert(await cards.nth(0).evaluate(e=>e.classList.contains('muted')));
  const stage=await page.locator('.battle-stage').boundingBox();
  await cards.nth(1).tap();assert.equal(await page.locator('.action-panel, .retain-picker, .action-area select').count(),0);
  assert.deepEqual(await page.locator('.battle-stage').boundingBox(),stage,'choosing hand targets does not move buildings');
  assert.equal(await page.locator('.target-eligible').count(),4);assert(await play.isDisabled());
  await cards.nth(0).tap();assert(await play.isEnabled());assert.equal(await page.locator('.target-picked').count(),1);
  await cards.nth(0).tap();assert(await play.isDisabled());
  await cards.nth(0).tap();await cards.nth(3).tap();
  assert.equal(await page.locator('.hand-card.selected').getAttribute('data-card-id'),id);
  assert.equal(await page.locator('.target-picked').count(),id==='F02'?1:2,'duplicate card is a target, not the activating card');
  if(id==='F04'){await cards.nth(4).tap();assert.equal(await page.locator('.target-picked').count(),2);assert(await cards.nth(4).evaluate(e=>e.classList.contains('target-locked')));}
  await cards.nth(1).tap();assert.equal(await page.locator('.hand-targeting').count(),0);assert.equal(await cards.count(),5);assert.equal(await page.locator('.energy-display b').innerText(),'3');assert.equal(await page.locator('.card-fx-layer').count(),0);
  await cards.nth(1).tap();assert(await play.isDisabled());await cards.nth(0).tap();if(id==='F04')await cards.nth(3).tap();
  const rect=await play.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height);
  await page.screenshot({path:`../output/ace405_plan/hand_${id}_${width}.png`});
  await play.tap();await page.locator(`.card-fx-layer[data-effect-card="${id}"]`).waitFor();
  assert.equal(await page.locator('.hand-targeting').count(),0);assert.equal(await page.locator('.action-panel').count(),0);
  if(id==='F02') {assert.equal(await cards.count(),5);assert.equal(await page.locator('.hand-card[data-card-id="W2"]').count(),0);assert.equal(await page.locator('.hand-card[data-card-id="I4"]').count(),1);assert.equal(await page.locator('.hand-card[data-card-id="P1"]').count(),1);}
  else {assert.equal(await cards.count(),4);assert.equal(await page.locator('.hand-card.retained').count(),2);assert.equal(await page.locator('.energy-display b').innerText(),'2');}
 }
 fixture={...fixture,functions:2};await page.goto('http://127.0.0.1:5173/');await cards.nth(1).tap();assert(await play.isDisabled());assert.equal(await page.locator('.target-eligible').count(),0);await page.locator('.target-cancel').tap();
 assert.deepEqual(errors,[]);console.log(`${width}x${height}: inline discard/retain, toggle, cancel, duplicate targets, cap and blocked action passed`);await page.close();
}
} finally {await browser.close();}
