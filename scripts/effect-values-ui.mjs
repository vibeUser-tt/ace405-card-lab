import assert from 'node:assert/strict';
import {initialGame} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 for(const [width,height] of [[844,390],[390,844],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height},hasTouch:true});let fixture;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('useState(initialGame)',`useState(() => (${JSON.stringify(fixture)}))`)});});
  for(const [card,target,metric,boostedAttack,expected] of [
   ['F05','W2','D',false,'采光增加 6 个百分点'],
   ['F06','W2','D',false,'采光减少 6 个百分点'],
   ['F06','W2','D',true,'采光减少 12 个百分点'],
   ['W2','W2','D',false,'采光减少 12 个百分点'],
   ['W2','W2','D',true,'采光减少 18 个百分点'],
   ['F05','S2','H',false,'过热减少 18.75 小时/年'],
   ['F06','S2','H',false,'过热增加 18.75 小时/年'],
  ]) {
   fixture={...initialGame(),phase:'battle',level:5,round:2,energy:3,hand:[card],playerBoard:[target],npcBoard:[target],boostedAttack};
   await page.goto('http://127.0.0.1:5173/');await page.locator('.hand-card').tap();
   if(card.startsWith('F'))await page.locator('.slot-eligible').tap();
   assert.equal(await page.locator(`.metric-select option[value="${metric}"]`).innerText(),expected);
   await page.locator('.metric-select').selectOption(metric);
   assert((await page.locator('.selection-hint').innerText()).includes(expected));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator(card.startsWith('F')?'.play-button':'.counter-button').tap();
   await page.locator('.card-fx-label').waitFor();
   assert((await page.locator('.card-fx-label').innerText()).includes(expected));
  }
  assert.deepEqual(errors,[]);console.log(`${width}x${height}: 7 buff/debuff previews, selected hints and hit labels passed`);await page.close();
 }
} finally {await browser.close();}
