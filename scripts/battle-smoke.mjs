import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [width,height] of [[568,320],[667,375],[844,390],[932,430],[740,320],[1024,768],[1440,900],[390,844],[360,640],[430,932]]){
 const page=await browser.newPage({viewport:{width,height}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:/进入采光关/}).click();await page.waitForTimeout(800);
 assert.equal(await page.locator('.scene-host canvas').count(),1);assert.equal(await page.locator('.scene-fallback').count(),0);
 const box=await page.locator('.hand-card').first().boundingBox();const end=await page.locator('.turn-actions button').boundingBox();assert(box.y+box.height<=height);assert(end.y+end.height<=height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:`../output/ace405_plan/battle_${width}.png`});
 await page.locator('.hand-card').first().click();const panel=await page.locator('.action-panel').boundingBox();assert(panel.y>=0&&panel.y+panel.height<=height); const stage=await page.locator('.battle-stage').boundingBox(); assert(width>height ? panel.x>=stage.x+stage.width-1 : panel.y>=stage.y+stage.height-1,'inspector must not cover building stage');
 await page.screenshot({path:`../output/ace405_plan/battle_${width}_selected.png`});assert.deepEqual(errors,[]);console.log(`${width}x${height}: canvas, hand, turn action and panel fit`);await page.close();
}
await browser.close();
