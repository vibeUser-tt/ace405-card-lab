import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:844,height:390}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message)});
await page.route('**/model-fixture',route=>route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#101e2b"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';const {createRoot}=ReactDOM;import {BattleScene} from '/src/BattleScene.tsx';import {initialGame} from '/src/game.ts';import '/src/battle.css';import '/src/card-controls.css';import '/src/game-skin.css';
const root=createRoot(document.getElementById('root'));window.showVariant=(v,kind='build')=>{const g=initialGame();g.phase='battle';g.level=5;g.round=1;g.playerBoard=['W','I','S','P','M','T'].map(p=>p+v);g.npcBoard=[...g.playerBoard];if(kind==='attack')g.effects=[{side:'npc',target:'W'+v,metric:'D',fraction:-.5}];if(kind==='shield')g.shields=['W'+v];root.render(React.createElement(BattleScene,{game:g,cue:{serial:performance.now(),side:kind==='attack'?'npc':'player',target:'W'+v,kind},onTarget:()=>{}}));};window.showVariant(1);
</script></body></html>`}));
await page.goto('http://127.0.0.1:5173/model-fixture');await page.waitForFunction(()=>window.showVariant);await page.waitForSelector('.scene-host[data-assets="ready"]');
for(let v=1;v<=4;v++){await page.evaluate(v=>window.showVariant(v),v);await page.waitForTimeout(400);assert((await page.locator('.scene-host').getAttribute('data-models')).includes('T'+v));await page.screenshot({path:`../output/ace405_plan/models_${v}.png`});}
await page.evaluate(()=>window.showVariant(4,'attack'));await page.waitForTimeout(600);await page.screenshot({path:'../output/ace405_plan/window_shatter.png'});
await page.evaluate(()=>window.showVariant(1,'shield'));await page.waitForTimeout(400);await page.screenshot({path:'../output/ace405_plan/building_shield.png'});
assert.deepEqual(errors,[]);assert.equal(await page.locator('.scene-fallback').count(),0);await browser.close();console.log('All 24 Blender card variants, window impact and shield rendered successfully.');


