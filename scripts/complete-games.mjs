import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
for(const [width,height] of [[667,375],[844,390],[390,844]]) for(const level of [0,3]) {
 const page=await browser.newPage({viewport:{width,height},hasTouch:true}); const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(4000);
 await page.addInitScript(seed=>{let n=seed;Math.random=()=>((n=Math.imul(1664525,n)+1013904223>>>0)/4294967296);},width+level*131);
 await page.goto('http://127.0.0.1:5173/'); await page.locator('.level-list button').nth(level).tap(); await page.locator('.primary').tap();
 const record={width,height,level,plays:[],turns:0,result:''};
 for(let round=0;round<8;round++) {
  if(await page.locator('.result-modal').count())break;
  for(let action=0;action<6;action++) {
   const cards=await page.locator('.hand-card:not(.muted)').evaluateAll(es=>es.map(e=>e.dataset.cardId));
   // Spend energy cards before installations; prefer routes shown as viable by the UI.
   cards.sort((a,b)=>(a==='F03'?-3:!a.startsWith('F')?-2:a==='F06'?-1:0)-(b==='F03'?-3:!b.startsWith('F')?-2:b==='F06'?-1:0));
   let played=false;
   for(const id of cards) {
    await page.locator(`.hand-card[data-card-id="${id}"]:not(.muted)`).first().tap();
    if(!['F02','F04'].includes(id)) {
    const panel=await page.locator('.action-panel').boundingBox(),stage=await page.locator('.battle-stage').boundingBox();
    assert(width>height?panel.x>=stage.x+stage.width-1:panel.y>=stage.y+stage.height-1,'panel covers building');
    assert(panel.y>=0&&panel.y+panel.height<=height+1);
    } else assert.equal(await page.locator('.action-panel').count(),0);
    let mode='function';
    if(!id.startsWith('F')) {
     mode='build';
     const counter=page.getByRole('button',{name:'同名反制对手',exact:true});
     if(await counter.isEnabled() && (await page.locator('.route-hint.risk').count() || !(await page.getByRole('button',{name:'安装到我的方案',exact:true}).isEnabled()))) {await counter.tap();mode='counter';}
     else if(await page.locator('.route-hint.risk').count()){await page.locator('.action-panel .close').tap();continue;}
    }
    for(let i=0;i<await page.locator('.action-panel select').count();i++) {
     const select=page.locator('.action-panel select').nth(i);
     if(await select.locator('option').count()>1)await select.selectOption({index:1});
    }
    if(['F02','F04'].includes(id))await page.locator('.hand-card.target-eligible').first().tap();
    if(await page.locator('.play-button').isEnabled()) {
     await page.locator('.play-button').tap();
     await page.locator(`.card-fx-layer[data-effect-card="${id}"]`).waitFor();
     record.plays.push({round:round+1,id,mode});played=true;
     if(id==='F06'||mode==='counter'){await page.waitForTimeout(400);await page.screenshot({path:`../output/ace405_plan/play_attack_${width}.png`});}
     break;
    }
    await page.locator('.action-panel .close, .target-cancel').tap();
   }
   if(!played)break;
  }
  const end=await page.locator('.turn-actions button').boundingBox(); assert(end.y+end.height<=height+1);
  await page.locator('.turn-actions button').tap();record.turns++;await page.waitForTimeout(1550);
 }
 assert.equal(await page.locator('.result-modal').count(),1,'must play through settlement');
 record.result=await page.locator('.result-modal h1').innerText();assert.deepEqual(errors,[]);
 await page.screenshot({path:`../output/ace405_plan/complete_${width}_${level}.png`});results.push(record);console.log(JSON.stringify(record));await page.close();
}
assert(results.every(r=>r.plays.some(p=>p.mode==='build')),'every game installs a design');
assert(results.some(r=>r.plays.some(p=>p.id==='F06'||p.mode==='counter')),'complete games include attack');
await writeFile('../output/ace405_plan/complete-games.json',JSON.stringify(results,null,2));
} finally {await browser.close();}

