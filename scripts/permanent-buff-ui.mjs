import assert from 'node:assert/strict';
import {initialGame} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const [width,height] of [[568,320],[844,390],[390,844],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const fixture={...initialGame(),phase:'battle',level:5,round:1,maxRounds:8,hand:['F05','F05'],drawPile:['W1','F05'],playerBoard:['W4'],npcBoard:['W1'],effects:[{side:'npc',target:'W1',metric:'D',fraction:.25}]};
  await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('useState(initialGame)',`useState(() => (${JSON.stringify(fixture)}))`)});});
  await page.goto('http://127.0.0.1:5173/');
  const metric=(side,index)=>page.locator(`.${side} .hud-metrics > button`).nth(index).locator('strong').innerText();
  const select=async()=>{await page.locator('.hand-card[data-card-id="F05"]').first().tap();await page.locator('.player .slot-eligible').tap();};
  const turn=async()=>{await page.locator('.turn-actions button').tap();await page.waitForTimeout(1550);};
  await select();await page.locator('.metric-select').selectOption('E');await page.locator('.play-button').tap();
  assert.equal(await metric('player',0),'90');
  assert((await page.locator('.player [data-optimized="true"]').getAttribute('title')).includes('永久优化'));
  await turn();assert.equal(await metric('player',0),'90','E buff survives first transition');assert.equal(await metric('npc',1),'60','opponent buff also survives');
  await select();assert.equal(await page.locator('.metric-select option[value="E"]').count(),0,'already optimized E cannot be selected next round');
  await page.locator('.metric-select').selectOption('H');await page.locator('.play-button').tap();assert.equal(await metric('player',2),'135');
  await turn();assert.equal(await metric('player',0),'90');assert.equal(await metric('player',2),'135','two different optimizations persist');
  await page.screenshot({path:`../output/ace405_plan/permanent_optimization_${width}.png`});
  await page.locator('.hand-card[data-card-id="W1"]').tap();await page.locator('.install-button').tap();
  assert.equal(await page.locator('.player [data-optimized="true"]').count(),0,'new device does not inherit old optimization');
  assert.equal(await metric('player',0),'106');assert.equal(await metric('npc',1),'60');assert.deepEqual(errors,[]);
  console.log(`${width}x${height}: actual HUD stable over two turns, duplicate excluded, second metric persists, replacement clears only old device`);await page.close();
 }
}finally{await browser.close();}
