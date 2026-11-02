import {initialGame} from '../src/game.ts';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const game={...initialGame(),phase:'battle',level:5,round:6,maxRounds:8,energy:3,playerBoard:['W1','I4','S2','P2','M4','T1'],npcBoard:['W4','I2','S4','P4','M2','T2'],hand:['S1','I1','P3','F05','F06','F08'],intent:{...initialGame().intent,label:'对手正在调整建筑方案'},action:'每一次设计选择，都让建筑更接近委托目标。'};
 await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{const response=await route.fetch();const body=(await response.text()).replace('useState(initialGame)',`useState(()=>(${JSON.stringify(game)}))`);await route.fulfill({response,body});});
 for(const [width,height] of [[1440,900],[390,844]]) {
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5173/');await page.waitForSelector('.scene-host[data-assets="ready"]');await page.waitForTimeout(900);
  await page.screenshot({path:`Art/renders/ui-v2-showcase-${width}.png`});
 }
}finally{await browser.close();}
