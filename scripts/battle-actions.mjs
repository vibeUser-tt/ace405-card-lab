import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:844,height:390}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
let attacked=false,built=false;
for(let attempt=0;attempt<12&&!attacked;attempt++){
 await page.goto('http://127.0.0.1:5173/');await page.locator('.level-list button').nth(3).click();await page.locator('.primary').click();
 for(let round=0;round<6&&!attacked;round++){
  if(await page.locator('.result-modal').count())break;
  const counter=page.locator('.hand-card.function-card').filter({hasText:'针对性干扰'});
  if(await counter.count()){
   await counter.first().click();const selects=page.locator('.action-panel select');const options=await selects.first().locator('option').count();
   if(options>1){await selects.first().selectOption({index:1});await selects.nth(1).selectOption({index:1});if(await page.locator('.play-button').isEnabled()){await page.locator('.play-button').click();await page.waitForTimeout(100);const effect=await page.locator('.scene-host').getAttribute('data-effect');assert(effect.startsWith('attack:npc:'));attacked=true;await page.waitForTimeout(450);await page.screenshot({path:'../output/ace405_plan/battle_attack.png'});}}
   if(await page.locator('.action-panel .close').count())await page.locator('.action-panel .close').click();
  }
  if(!built){const cards=page.locator('.hand-card.design-card:not(.muted)');if(await cards.count()){await cards.first().click();if(await page.locator('.play-button').isEnabled()){await page.locator('.play-button').click();await page.waitForTimeout(350);assert((await page.locator('.scene-host').getAttribute('data-models')).length>0);built=true;}}}
  if(!attacked){await page.locator('.turn-actions button').click();await page.waitForTimeout(1600);}
 }
}
assert(built,'installation updates procedural model');assert(attacked,'a legal attack launches targeted particles');assert.deepEqual(errors,[]);await browser.close();console.log('Install model changes and targeted attack particles passed.');

