import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const [width,height] of [[568,320],[667,375],[844,390],[360,640],[390,844],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let n=17;Math.random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296);});
  await page.goto('http://127.0.0.1:5173/');
  assert((await page.locator('.tutorial-intro').innerText()).includes('第 2 轮开工'));
  await page.locator('.primary').tap();
  const ids=await page.locator('.hand-card').evaluateAll(es=>es.map(e=>e.dataset.cardId));
  const pair=ids.filter(id=>['W2','P1','S2'].includes(id));assert(pair.length>=2&&ids.includes('F04'));
  assert((await page.locator('.selection-hint').innerText()).includes('先安装'));
  const install=pair.includes('W2')?'W2':pair.includes('P1')?'P1':'S2',retain=pair.find(id=>id!==install);
  await page.locator(`.hand-card[data-card-id="${install}"]`).tap();
  assert((await page.locator('.selection-hint').innerText()).includes('安装后仍差'));
  const stage=await page.locator('.battle-stage').boundingBox(),command=await page.locator('.card-command').boundingBox();assert(command.y>=stage.y+stage.height);
  await page.screenshot({path:`../output/ace405_plan/tutorial_${width}.png`});
  await page.locator('.install-button').tap();
  await page.locator('.hand-card[data-card-id="F04"]').tap();await page.locator(`.hand-card[data-card-id="${retain}"]`).tap();await page.locator('.play-button').tap();
  assert.equal(await page.locator('.player .building-slots button[data-card-id]').count(),1);
  await page.locator('.turn-actions button').tap();await page.waitForTimeout(1550);
  assert.equal(await page.locator('.npc .building-slots button[data-card-id]').count(),0,'first round is disclosed setup, no hidden construction');
  assert((await page.locator('.floor-tag').innerText()).includes('2/5'));
  assert.equal(await page.locator(`.hand-card[data-card-id="${retain}"]`).count(),1,'retained device stays available');
  assert(!(await page.locator('.scene-caption').innerText()).includes('首轮勘察'));
  await page.locator(`.hand-card[data-card-id="${retain}"]`).tap();assert(await page.locator('.install-button').isEnabled());await page.locator('.install-button').tap();
  const end=await page.locator('.turn-actions button').boundingBox();assert(end.y+end.height<=height+1);
  assert.equal(await page.locator('.action-panel').count(),0);assert.deepEqual(errors,[]);
  console.log(`${width}x${height}: tutorial disclosure, guaranteed opening, threshold preview, install/retain and opponent setup passed`);
  await page.close();
 }
}finally{await browser.close();}
