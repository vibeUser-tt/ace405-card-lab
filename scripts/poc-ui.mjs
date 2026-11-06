import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
import {beginRun,playCard,endTurn,autoTurn,chooseAction,publicCost,visibleEvents} from '../src/game.ts';
import {performance,factors,label,pointById} from '../src/model.ts';
const base=process.env.POC_URL||'http://127.0.0.1:4180/';
const out='validation/points-screenshots';await mkdir(out,{recursive:true});
const report={errors:[],diagnostics:[],views:[],games:[],privacy:[],sources:{},url:base};
for(const name of ['src/model.ts','src/game.ts','src/main.tsx','src/MetricCard.tsx','src/ParameterPreview.tsx','src/feedback.ts','src/PlayFeedback.tsx','src/style.css','scripts/poc-ui.mjs'])report.sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
let duplicateChecked=false;
async function state(page,g){
 for(const side of ['player','npc']){
  const v=performance(g[side].config);for(const k of ['D','E'])assert(Math.abs(Number(await page.locator('.'+side+' [data-metric="'+k+'"] strong').textContent())-v[k])<=.050001);
  assert.equal(await page.locator('.'+side+' [data-metric="C"] strong').textContent(),String(publicCost(g,side)));
  for(const f of factors)assert.equal(await page.locator('.'+side+' [data-factor="'+f+'"] strong').textContent(),label(f,g[side].config[f]));
 }
 if(g.phase==='battle'){
  assert.equal(await page.locator('.stamina').getAttribute('data-energy'),String(g.player.energy));
  const count=await page.locator('.hand .hand-card').count();assert.equal(count,g.player.hand.length+g.player.functionHand.length);assert(count<=5);
 }
}
async function perform(page,g,a){
 const id=(a.kind==='point'?g.player.hand:g.player.functionHand)[a.index];
 await page.locator(a.kind==='point'?'.hand .point-card':'.hand .function-card').nth(a.index).click();
 if(a.kind==='point'){
  assert.equal(await page.locator('.config-grid button.selectable').count(),16);
  assert.equal(await page.locator('.target-options,.confirm-action').count(),0);
  await page.locator('.'+(a.mode==='self'?'player':'npc')+' [data-factor="'+a.factor+'"]').click();
  assert.equal(await page.locator('.direction-options button').count(),2);
  const direction=page.locator('[data-direction="'+a.direction+'"]');
  if(!duplicateChecked){
   await direction.evaluate(button=>{button.click();button.click();});
   duplicateChecked=true;report.diagnostics.push({doubleClick:'synchronous repeat settles exactly one card and one cost'});
  }else await direction.click();
 }else if(id==='F08')await page.locator('.player [data-factor="'+a.factor+'"]').click();
 else if(id==='F02')await page.locator('.hand .point-card').nth(a.discard).click();
 if(a.kind==='function'){assert(!await page.locator('.confirm-action').isDisabled());await page.locator('.confirm-action').click();}
 const next=playCard(g,'player',a);assert.notEqual(next,g);
 if(a.kind==='point'){
  const e=next.events.at(-1);
  if(e.blocked)assert.match(await page.locator('.'+e.target+' [data-factor="'+e.factor+'"] .slot-notice').innerText(),/已抵挡/);
  await page.locator('.app-shell[data-play-stage]').waitFor({state:'detached'});
 }
 await state(page,next);return next;
}
async function open(level,seed,viewport={width:1440,height:1000}){
 const page=await browser.newPage({viewport,reducedMotion:'reduce',isMobile:viewport.width<500,hasTouch:viewport.width<500});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.goto(base+'?seed='+seed);assert.equal(await page.locator('.level-list button').count(),3);
 await page.locator('.level-list button').nth(level).click();await page.locator('.start').click();
 await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor({timeout:60000});
 return page;
}
try{
 for(const viewport of [{width:1440,height:1000},{width:844,height:390},{width:390,height:844}]){
  const page=await open(0,405,viewport);let g=beginRun(0,405);await state(page,g);
  assert.equal(await page.locator('.config-grid button').count(),16);
  assert.equal(await page.locator('.hand').count(),1);
  assert.equal(await page.locator('.hand .hand-card').count(),g.player.hand.length+g.player.functionHand.length);
  const tops=await page.locator('.hand > div').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().top));
  assert(Math.max(...tops)-Math.min(...tops)<1,'all hand cards share a row');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:out+'/battle-'+viewport.width+'.png',fullPage:true});
  const index=g.player.hand.findIndex(id=>pointById[id].rank<=g.player.energy);
  const beforeGlass=g.npc.config.GLZ;
  g=await perform(page,g,{kind:'point',index,mode:'counter',factor:'GLZ',direction:-1});
  assert.notEqual(g.npc.config.GLZ,beforeGlass,'glass can be countered');
  const remaining=[...g.player.hand];await page.locator('.end-turn').click();g=endTurn(g);await page.locator('.roundbar').getByText('第 2 轮',{exact:false}).waitFor();await state(page,g);
  assert(remaining.every(id=>g.player.hand.includes(id)));assert.equal(await page.locator('.hand .point-card').count(),g.player.hand.length);
  await page.getByRole('button',{name:'牌组',exact:true}).click();assert.equal(await page.locator('.catalog .hand-card').count(),44);await page.screenshot({path:out+'/deck-'+viewport.width+'.png',fullPage:true});await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.getByRole('button',{name:'玩法说明',exact:true}).click();assert((await page.getByRole('dialog').textContent()).includes('不按轮数失效'));await page.keyboard.press('Escape');
  await page.screenshot({path:out+'/feedback-'+viewport.width+'.png',fullPage:true});
  report.views.push(viewport);await page.close();
 }
 // Actual mixed opening and search from a full five-card retained hand.
 let searchSeed=0,searchGame;
 for(let seed=1;seed<5000;seed++){
  let g=beginRun(0,seed);
  if(g.player.functionHand.filter(id=>id==='F01').length!==2)continue;
  g=playCard(g,'player',{kind:'function',index:g.player.functionHand.indexOf('F01')});g=endTurn(g);
  if(g.phase==='battle'){searchSeed=seed;searchGame=g;break;}
 }
 assert(searchSeed);
 {
  const page=await open(0,searchSeed,{width:390,height:844});let g=beginRun(0,searchSeed);
  assert.equal(await page.locator('.hand .hand-card').count(),4);
  g=await perform(page,g,{kind:'function',index:g.player.functionHand.indexOf('F01')});
  assert.equal(await page.locator('.hand .hand-card').count(),5);
  await page.locator('.end-turn').click();await page.locator('.roundbar').getByText('第 2 轮',{exact:false}).waitFor();g=searchGame;await state(page,g);
  const before=g.player.draw.length;g=await perform(page,g,{kind:'function',index:g.player.functionHand.indexOf('F01')});
  assert.equal(g.player.draw.length,before-1);assert.equal(await page.locator('.hand .hand-card').count(),5);
  await page.screenshot({path:out+'/mixed-search-390.png',fullPage:true});report.diagnostics.push({searchSeed,opening:4,afterSearch:5,retained:5,fullHandSearchDraw:1});await page.close();
 }
 // Observe an actually hidden NPC action, not a synthetic browser state.
 let privacySeed=0,privateGame;
 for(let seed=1;seed<500;seed++){const g=endTurn(beginRun(0,seed));if(g.phase==='battle'&&g.npc.shield&&g.npc.hiddenCost>0){privacySeed=seed;privateGame=g;break;}}
 assert(privacySeed);const page=await open(0,privacySeed);await page.locator('.end-turn').click();await page.locator('.roundbar').getByText('第 2 轮',{exact:false}).waitFor();await state(page,privateGame);
 assert(!(await page.locator('.npc .project-title').innerText()).includes('防护'));
 const privateEvent=privateGame.events[privateGame.npc.shield.event];assert(!visibleEvents(privateGame).includes(privateEvent));
 assert(!(await page.locator('.opponent-review').innerText()).includes('暗置防护：'));
 await page.getByRole('button',{name:'方案比较',exact:true}).click();assert(!(await page.locator('.event-log').innerText()).includes(privateEvent.message));await page.getByRole('button',{name:'关闭弹窗'}).click();
 const attack={kind:'point',index:0,mode:'counter',factor:privateGame.npc.shield.factor,direction:-1};
 const attacked=await perform(page,privateGame,attack);assert(attacked.events.at(-1).blocked);assert((await page.locator('.event-line').textContent()).includes('防护'));report.privacy.push({seed:privacySeed,hiddenUntilAttack:true});await page.close();
 for(let level=0;level<3;level++)for(const policy of ['tactical','random']){
  const page=await open(level,405);let g=beginRun(level,405),plays=0;
  while(g.phase==='battle'&&g.round<80){
   while(true){const a=chooseAction(g,'player',policy);if(!a)break;g=await perform(page,g,a);plays++;}
   await page.locator('.end-turn').click();g=endTurn(g);
   if(g.phase==='battle')await page.locator('.roundbar').getByText('第 '+g.round+' 轮',{exact:false}).waitFor();else await page.locator('.result').waitFor();
   await state(page,g);
  }
  assert.notEqual(g.phase,'battle');await page.screenshot({path:out+'/result-'+level+'-'+policy+'.png',fullPage:true});report.games.push({level,policy,rounds:g.round,phase:g.phase,cost:g.player.spent,plays});console.log(report.games.at(-1));await page.close();
 }
 // Real resource exhaustion and restart through the same public UI.
 let drawSeed=0;
 for(let seed=1;seed<500;seed++){let g=beginRun(0,seed);while(g.phase==='battle'&&g.round<80)g=endTurn(autoTurn(g,'player','random'));if(g.phase==='draw'&&g.drawReason.includes('耗尽')){drawSeed=seed;break;}}
 assert(drawSeed);
 {
  const page=await open(0,drawSeed);let g=beginRun(0,drawSeed),plays=0;
  while(g.phase==='battle'){
   while(true){const a=chooseAction(g,'player','random');if(!a)break;g=await perform(page,g,a);plays++;}
   await page.locator('.end-turn').click();g=endTurn(g);
   if(g.phase==='battle')await page.locator('.roundbar').getByText('第 '+g.round+' 轮',{exact:false}).waitFor();else await page.locator('.result.draw').waitFor();
   await state(page,g);
  }
  assert((await page.locator('.result.draw').innerText()).includes('耗尽'));
  await page.screenshot({path:out+'/resource-draw.png',fullPage:true});
  await page.getByRole('button',{name:'重开一局',exact:true}).click();await state(page,beginRun(0,drawSeed));assert.equal(await page.locator('.hand .hand-card').count(),4);assert(await page.locator('.hand .point-card').count()>=1);
  report.games.push({level:0,policy:'random',seed:drawSeed,rounds:g.round,phase:g.phase,plays,restart:true});await page.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/points-ui.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
