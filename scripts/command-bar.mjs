import assert from 'node:assert/strict';
import {initialGame} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
for(const [width,height] of [[568,320],[844,390],[360,640],[390,844],[1440,900]]) {
 const page=await browser.newPage({viewport:{width,height},hasTouch:true});let fixture;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch(),body=(await response.text()).replace('useState(initialGame)',`useState(() => (${JSON.stringify(fixture)}))`);await route.fulfill({response,body});});
 const base={...initialGame(),phase:'battle',level:5,round:1,energy:5,hand:['W2','T1','F01'],drawPile:['F02','F04']};
 const load=async(extra={})=>{fixture={...base,...extra};await page.goto('http://127.0.0.1:5173/');await page.locator('.hand-card').first().tap();};
 for(const [extra,selector,label] of [[{},'.counter-button','对方没有同名装置'],[{built:true},'.install-button','本轮已经安装'],[{energy:0},'.install-button','体力不足'],[{playerBoard:['W1']},'.install-button','同类装置已安装'],[{playerBoard:['I2','S2','P2','M4','T1']},'.install-button','预算不足'],[{npcBoard:['W2'],attacked:true},'.counter-button','本轮已经反制']]) {
  await load(extra);assert(await page.locator(selector).isDisabled(),label);assert((await page.locator(selector).innerText()).includes(label),label);
  assert.equal(await page.locator('.action-panel').count(),0);assert.equal(await page.locator('.card-status').count(),0);
 }
 await load({npcBoard:['W2']});assert(await page.locator('.counter-button').isDisabled());await page.locator('.metric-select').selectOption('D');
 assert(await page.locator('.counter-button').isEnabled());assert(await page.locator('.install-button').isEnabled());
 const stage=await page.locator('.battle-stage').boundingBox(),commands=await page.locator('.card-command').boundingBox(),hand=await page.locator('.hand-cards').boundingBox(),card=await page.locator('.hand-card').first().boundingBox();
 assert(commands.y>=stage.y+stage.height && commands.y+commands.height<=hand.y);assert(card.height>card.width);
 await page.screenshot({path:`../output/ace405_plan/command_bar_${width}.png`});
 await page.locator('.counter-button').tap();await page.waitForFunction(()=>document.querySelector('.scene-host').dataset.effect?.startsWith('attack:npc:W2'));
 assert.equal(await page.locator('.hand-card[data-card-id="W2"]').count(),0);assert.equal(await page.locator('.battle-hud.player .building-slots button[title="大面积窗面"]').count(),0);
 await load({npcBoard:['W2']});await page.locator('.metric-select').selectOption('D');await page.locator('.install-button').tap();
 await page.waitForFunction(()=>document.querySelector('.scene-host').dataset.effect?.startsWith('build:player:W2'));
 assert.equal(await page.locator('.play-button').count(),0,'installation requires no second confirmation');
 await page.locator('.hand-card[data-card-id="T1"]').tap();assert((await page.locator('.install-button').innerText()).includes('本轮已经安装'));
 await page.locator('.hand-card[data-card-id="F01"]').tap();assert.equal(await page.locator('.install-button, .counter-button').count(),0);assert.equal(await page.locator('.play-button').innerText(),'打出这张牌');
 const hint=await page.locator('.selection-hint').boundingBox(),heading=await page.locator('.hand-heading').boundingBox();assert(hint.y>=heading.y&&hint.y<heading.y+heading.height);
 await page.locator('.play-button').tap();await page.locator('.card-fx-layer[data-effect-card="F01"]').waitFor();assert.deepEqual(errors,[]);
 console.log(`${width}x${height}: compact commands, disabled reasons, direct install/counter and inline hints passed`);await page.close();
}
} finally {await browser.close();}
