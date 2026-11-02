import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initialGame} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']});
const output='Art/renders/',errors=[];
try{
 for(const [width,height] of [[1440,900],[390,844],[844,390]]) {
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');await page.locator('.intro-hero').evaluate(img=>img.decode());await page.screenshot({path:output+`ui-v2-intro-${width}.png`});
  await page.getByRole('button',{name:/进入采光关/}).click();await page.waitForSelector('.scene-host[data-assets="ready"]');await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert(await page.locator('.card-art img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth===256)));
  await page.screenshot({path:output+`ui-v2-battle-${width}.png`});
  await page.locator('.hand-card').first().click();await page.screenshot({path:output+`ui-v2-selected-${width}.png`});
  const panel=await page.locator('.card-command').boundingBox(),stage=await page.locator('.battle-stage').boundingBox();assert(panel.y>=stage.y+stage.height-1);
  await page.getByRole('button',{name:'取消选牌'}).click();
  await page.getByRole('button',{name:'玩法说明',exact:true}).click();await page.screenshot({path:output+`ui-v2-rules-${width}.png`});await page.getByRole('button',{name:'关闭玩法说明'}).click();
  await page.locator('.battle-status button').click();await page.screenshot({path:output+`ui-v2-deck-${width}.png`});await page.getByRole('button',{name:'关闭牌组'}).click();
  await page.close();
 }
 const result=await browser.newPage({viewport:{width:1440,height:900}});result.on('pageerror',e=>errors.push(e.message));
 const game={...initialGame(),phase:'victory',level:0,round:4,playerBoard:['W2','S2','P1'],npcBoard:['W1','S1','P3'],result:'你的方案通过了全部委托门槛，以更好的综合表现赢得了这次竞标。'};
 await result.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();let body=await response.text();body=body.replace('useState(initialGame)',`useState(()=>(${JSON.stringify(game)}))`);await route.fulfill({response,body});});
 await result.goto('http://127.0.0.1:5173/');await result.locator('.result-modal').waitFor();await result.screenshot({path:output+'ui-v2-result-1440.png'});
 await result.setViewportSize({width:390,height:844});await result.screenshot({path:output+'ui-v2-result-390.png'});
 assert.deepEqual(errors,[]);console.log('Intro, battle, selected card, rules, deck, results: three viewports; real card illustrations and command placement passed.');
 await fs.writeFile('validation/ui-skin-v2.json',JSON.stringify({viewports:['1440x900','390x844','844x390'],screens:['intro','battle','selected','rules','deck','result'],errors},null,2));
}finally{await browser.close();}
