import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
import {beginRun,chooseAction,playCard,endTurn} from '../src/game.ts';
import {factors,levels,performance,label,designById,cardById,turnRules,canCounterDesign,counterFactors} from '../src/model.ts';
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
const base=process.env.POC_URL||'http://127.0.0.1:5173/';
await mkdir('validation/screenshots',{recursive:true});const report={errors:[],diagnostics:[],views:[],actions:[]};
const modelUrls=new Set(['assets/modern-v2/building.glb','assets/modern-v2/citizen.glb','assets/design-lab/building.glb'].map(file=>new URL(file,base).href));
async function assertDisplayedState(page,g){
 if(g.phase==='battle')assert.equal(await page.locator('.stamina').getAttribute('data-energy'),String(g.player.energy),'displayed stamina follows actual spending');
 for(const side of ['player','npc']){
  const values=performance(g[side].config);
  for(const k of ['D','E','C'])assert.equal(await page.locator(`.${side} .stat[data-metric="${k}"] strong`).textContent(),values[k].toFixed(1),`${side} ${k} follows current configuration`);
  for(const [index,factor] of factors.entries())assert.equal(await page.locator(`.${side} .config-grid button strong`).nth(index).textContent(),label(factor,g[side].config[factor]),`${side} ${factor} follows current configuration`);
  const update=g.events.findLast(event=>event.target===side&&(event.beforeValues||event.factor));
  assert.equal(await page.locator(`.${side} .stats`).getAttribute('data-updated-round'),String(update?.round??0));
 }
 const settledRound=g.history.at(-1)?.round;
 if(settledRound){
  assert((await page.locator('.opponent-review summary').textContent()).includes(`第 ${settledRound} 轮对手已行动`));
  assert.equal(await page.locator('.opponent-action').count(),g.events.filter(event=>event.side==='npc'&&event.round===settledRound).length,'all actions from the last NPC turn are visible');
 }
 const event=g.events.at(-1);
 if(event?.beforeValues&&event?.afterValues){
  assert.equal(await page.locator('.event-line .change-item').count(),3);
  for(const [index,k] of ['D','E','C'].entries())assert.equal(await page.locator('.event-line .change-item b').nth(index).textContent(),`${event.beforeValues[k].toFixed(1)} → ${event.afterValues[k].toFixed(1)}`);
 }
}
async function perform(page,g,action){
 const id=g.player.hand[action.index],card=cardById[id];
 await page.locator('.hand .hand-card').nth(action.index).click();
 if(id==='F02')await page.locator('.hand .hand-card').nth(action.discard).click();
 if(id==='F04')for(const index of action.retain)await page.locator('.hand .hand-card').nth(index).click();
 if(id==='F06')await page.getByRole('button',{name:action.metric==='D'?'削减采光':'增加能耗',exact:true}).click();
 if(id==='F08'){
  assert.equal(await page.locator('.player .config-grid .selectable').count(),counterFactors.length);
  const glass=page.locator('.player .config-grid button').nth(factors.indexOf('GLZ'));
  assert(!(await glass.getAttribute('class')).includes('selectable'),'glass is not a protection target');
  await glass.click();assert.equal(await page.locator('.player .config-grid .picked').count(),0);
  assert(await page.locator('.self-action').isDisabled(),'clicking glass does not select a shield target');
  await page.locator('.player .config-grid button').nth(factors.indexOf(action.factor)).click();
 }
 if(designById[id]){
  assert((await page.locator('.self-action').textContent()).includes(`· ${card.ap} 体力`));
  if(canCounterDesign(designById[id]))assert((await page.locator('.counter-action').textContent()).includes(`· ${card.ap} 体力`));
  else assert.equal(await page.locator('.counter-action').count(),0,'whole-system cards only expose self use');
 }
 const button=page.locator(action.mode==='counter'?'.counter-action':'.self-action');
 assert(!await button.isDisabled(),`${id} remains playable when stamina permits`);
 await button.click();
 const next=playCard(g,'player',action);assert.notEqual(next,g);
 await assertDisplayedState(page,next);
 return next;
}
function findOpening(predicate){
 for(let seed=1;seed<=5000;seed++)if(predicate(beginRun(0,seed).player.hand))return seed;
 throw Error('Could not find a deterministic opening hand');
}
try {
 for(const viewport of [{width:1440,height:1000},{width:844,height:390},{width:390,height:844}]){
  const page=await browser.newPage({viewport});let closing=false;const responseStatus=new Map(),failedRequests=[];
  page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{responseStatus.set(r.request(),r.status());if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});page.on('requestfailed',r=>{if(!closing)failedRequests.push(r);});
  await page.goto(`${base}?seed=405`);await page.locator('.level-list').waitFor();assert.equal(await page.locator('.level-list button').count(),3);
  await page.screenshot({path:`validation/screenshots/intro-${viewport.width}.png`,fullPage:true});
  await page.locator('.start').click();await page.locator('.building-view[data-assets="ready"]').first().waitFor({timeout:60000});await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor();
  await page.locator('.hand-card img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.decode()));});
  await page.screenshot({path:`validation/screenshots/battle-${viewport.width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal page overflow');
  assert.equal(await page.locator('.stat[data-metric="H"]').count(),0);
  assert.equal(await page.locator('.config-grid button').count(),16);
  const design=page.locator('.hand .design-card').first();
  if(await design.count()){
   const id=await design.getAttribute('data-card-id');await design.click();assert(!await page.locator('.self-action').isDisabled());
   await page.locator('.self-action').click();await page.waitForTimeout(200);assert((await page.locator('.event-line').textContent()).includes('你使用'));
   report.actions.push({width:viewport.width,card:id,kind:'self'});
   const attack=page.locator('.hand .design-card[data-counterable="true"]').first();
   if(await attack.count()){await attack.click();await page.locator('.counter-action').click();assert((await page.locator('.event-line').textContent()).includes('向对方'));report.actions.push({width:viewport.width,kind:'counter'});}
  }
  await page.getByRole('button',{name:'玩法说明',exact:true}).click();assert(await page.getByRole('dialog').isVisible());await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.getByRole('button',{name:'牌组',exact:true}).click();assert.equal(await page.locator('.catalog .hand-card').count(),23);assert.equal(await page.locator('[data-card-id="F05"]').count(),0);await page.screenshot({path:`validation/screenshots/deck-${viewport.width}.png`,fullPage:true});await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.locator('.end-turn').click();await page.locator('.opponent-review summary').waitFor();assert((await page.locator('.opponent-review summary').textContent()).includes('第 1 轮对手已行动'));await page.screenshot({path:`validation/screenshots/feedback-${viewport.width}.png`,fullPage:true});await page.getByRole('button',{name:'方案比较',exact:true}).click();assert((await page.locator('tbody tr').count())>=3);assert(await page.locator('.event-log .performance-change').count()>0);await page.getByRole('button',{name:'关闭弹窗'}).click();
  assert.equal(await page.locator('.building-view[data-assets="ready"]').count(),2,'both buildings remain decoded and ready after the full interaction sequence');
  for(const request of failedRequests){
   const error=request.failure()?.errorText;
   // Chromium can report a cancelled stream after a GLB has decoded. Keep that
   // event visible, but only accept it with HTTP 200 and both models ready.
   if(error==='net::ERR_ABORTED'&&modelUrls.has(request.url())&&responseStatus.get(request)===200)report.diagnostics.push({width:viewport.width,url:request.url(),error,httpStatus:200,modelsReady:true});
   else report.errors.push(`${request.url()}: ${error}`);
  }
  report.views.push(viewport);closing=true;await page.close();
 }
 for(const id of ['G+','G-']){
  const seed=findOpening(hand=>hand.includes(id)),level=id==='G+'?1:0;
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`${base}?seed=${seed}`);await page.locator('.level-list button').nth(level).click();await page.locator('.start').click();
  let g=beginRun(level,seed);const index=g.player.hand.indexOf(id),beforeNpc={...g.npc.config};
  assert.notEqual(g.player.config.GLZ,designById[id].set,'fixture switches the player glass');
  assert((await page.locator('.hand .hand-card').nth(index).locator('.card-category').textContent()).includes('仅自身'));
  g=await perform(page,g,{index,mode:'self'});
  assert.equal(g.player.config.GLZ,designById[id].set);assert.deepEqual(g.npc.config,beforeNpc);
  report.actions.push({kind:'glass-self-only',card:id,seed,level});await page.close();
 }
 const repeatSeed=findOpening(hand=>hand.filter(id=>canCounterDesign(designById[id])).length>=3);
 for(const mode of ['self','counter']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`${base}?seed=${repeatSeed}`);await page.locator('.start').click();
  let g=beginRun(0,repeatSeed);assert.equal(g.player.energy,turnRules.energy);
  for(let n=0;n<2;n++){
   const index=g.player.hand.findIndex(id=>canCounterDesign(designById[id])),before=g.player.energy,cost=cardById[g.player.hand[index]].ap;
   g=await perform(page,g,{index,mode});assert.equal(g.player.energy,before-cost);
  }
  assert.equal(g.player.energy,0,'two same-fee design actions spend the ordinary round budget');
  const third=g.player.hand.findIndex(id=>canCounterDesign(designById[id]));await page.locator('.hand .hand-card').nth(third).click();
  assert(await page.locator('.self-action').isDisabled());assert(await page.locator('.counter-action').isDisabled());
  report.actions.push({kind:'repeat-design',mode,seed:repeatSeed,plays:2,remainingEnergy:g.player.energy});await page.close();
 }
 const functionSeed=findOpening(hand=>['F03','F04','F08'].every(id=>hand.includes(id))&&hand.some(id=>designById[id]));
 {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`${base}?seed=${functionSeed}`);await page.locator('.start').click();
  let g=beginRun(0,functionSeed);
  for(const id of ['F03','F04','F08']){
   const action={index:g.player.hand.indexOf(id),mode:'function'};
   if(id==='F04')action.retain=[g.player.hand.findIndex(card=>designById[card])];
   if(id==='F08')action.factor='WWR';
   g=await perform(page,g,action);
  }
  assert.equal(g.events.filter(e=>e.side==='player'&&e.mode==='function').length,3);
  report.actions.push({kind:'repeat-function',seed:functionSeed,plays:3,remainingEnergy:g.player.energy});await page.close();
 }
 let interferenceSeed=1;
 while(!beginRun(0,interferenceSeed).player.hand.includes('F06')){assert(interferenceSeed<2000,'F06 available in opening hands');interferenceSeed++;}
 for(const metric of ['D','E']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`${base}?seed=${interferenceSeed}`);await page.locator('.start').click();
  let g=beginRun(0,interferenceSeed);const index=g.player.hand.indexOf('F06'),glassBefore=g.npc.config.GLZ;
  await page.locator('.hand .hand-card').nth(index).click();
  assert(await page.locator('.self-action').isDisabled(),'targeted interference requires an explicit metric');
  await page.getByRole('button',{name:metric==='D'?'削减采光':'增加能耗',exact:true}).click();
  await page.locator('.self-action').click();g=playCard(g,'player',{index,mode:'function',metric});
  assert.equal(g.npc.config.GLZ,glassBefore,'targeted interference cannot change glass');
  await assertDisplayedState(page,g);
  assert.equal(await page.locator('.event-line .performance-change').count(),1,'interference reveals actual configuration outcomes');
  report.actions.push({kind:'interference',metric,seed:interferenceSeed});await page.close();
 }
 report.games=[];
 for(let level=0;level<3;level++)for(const {policy,seed} of [{policy:'tactical',seed:405},{policy:'tactical',seed:812},{policy:'random',seed:405}]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`${base}?seed=${seed}`);await page.locator('.level-list button').nth(level).click();await page.locator('.start').click();
  let g=beginRun(level,seed),plays=0;
  while(g.phase==='battle'){
   let turnPlays=0;
   while(true){
    const action=chooseAction(g,'player',policy);if(!action)break;
    assert(++turnPlays<=turnRules.maxHand+turnRules.extraDraw,'every play consumes a card from the bounded hand/draw budget');
    g=await perform(page,g,action);plays++;
   }
   await page.locator('.end-turn').click();g=endTurn(g);
   if(g.phase==='battle')await page.locator('.roundbar').getByText(new RegExp(`第 ${g.round} /`)).waitFor();
   else await page.locator('.result').waitFor();
   await assertDisplayedState(page,g);
  }
  assert(await page.locator(`.result.${g.phase}`).isVisible());
  await page.screenshot({path:`validation/screenshots/result-${level}-${policy}-${seed}.png`,fullPage:true});
  report.games.push({level:levels[level].id,policy,seed,phase:g.phase,rounds:g.round,plays});console.log('Played',report.games.at(-1));await page.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/poc-ui.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
