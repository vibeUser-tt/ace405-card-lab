import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {beginRun,playCard,endTurn,effectivePoints} from '../src/game.ts';
import {pointById,label,change,factors} from '../src/model.ts';
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
const out='validation/preview-screenshots';await mkdir(out,{recursive:true});
const report={checks:[],errors:[],sources:{}};
for(const name of ['src/game.ts','src/model.ts','src/main.tsx','src/MetricCard.tsx','src/ParameterPreview.tsx','src/feedback.ts','src/PlayFeedback.tsx','src/style.css','scripts/poc-preview.mjs'])report.sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'no-preference'});
page.on('pageerror',e=>report.errors.push(e.message));
const option=direction=>page.locator('.direction-options button[data-direction="'+direction+'"]');
async function start(seed){await page.goto((process.env.POC_URL||'http://127.0.0.1:4180/')+'?seed='+seed);await page.locator('.start').click();await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor();return beginRun(0,seed);}
async function choose(index,factor,mode='self'){
 if(await page.locator('.cancel').count())await page.locator('.cancel').click();
 await page.locator('.hand .point-card').nth(index).click();
 if(factor)await page.locator('.'+(mode==='self'?'player':'npc')+' [data-factor="'+factor+'"]').click();
}
async function submit(g,a){
 const next=playCard(g,'player',a),e=next.events.at(-1),count=g.player.hand.length;
 await option(a.direction).click();
 assert.equal(await page.locator('.hand .point-card').count(),count-1,'direction click consumes exactly one card');
 assert.equal(await page.locator('.stamina').getAttribute('data-energy'),String(next.player.energy));
 await page.locator('.app-shell[data-play-stage]').waitFor({state:'detached'});
 assert.equal(await page.locator('.'+e.target+' [data-factor="'+e.factor+'"] strong').innerText(),label(e.factor,e.after));
 await page.locator('.model-preview').waitFor({state:'detached'});return next;
}
try{
 let seed=1;while(!beginRun(0,seed).player.hand.some(id=>pointById[id].rank===6))seed++;
 let g=await start(seed);const index=g.player.hand.findIndex(id=>pointById[id].rank===6);
 assert(!(await page.locator('.hand .point-card').allTextContents()).some(t=>t.includes('投入')));
 await choose(index);
 assert.equal(await page.locator('.config-grid button.selectable').count(),16);
 assert.equal(await page.locator('.target-options,.confirm-action').count(),0);
 assert.equal(await page.locator('.preview-guides .target-guide').count(),2);
 const guides=await page.locator('.target-guide').allTextContents();
 assert(guides[0].includes('反制对手')&&guides[1].includes('调整自己'),'guides align with left opponent / right player');
 const summary=await page.locator('.selection-summary').innerText();
 for(const text of ['任意槽位','点数越大','同花色','×2'])assert(summary.includes(text),'missing rule copy '+text);
 // Every side/parameter is directly selectable; selecting never spends the card.
 for(const side of ['player','npc'])for(const factor of factors){
  await page.locator('.'+side+' [data-factor="'+factor+'"]').click();
  assert.equal(await page.locator('.model-preview').getAttribute('data-target'),side);
  assert.equal(await page.locator('.model-preview').getAttribute('data-factor'),factor);
  assert.equal(await page.locator('.config-grid button.picked').count(),1);
  assert.equal(await page.locator('.'+side+' [data-factor="'+factor+'"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.direction-options button').count(),2);
  assert.equal(await page.locator('.preview-delta').count(),factor==='GLZ'?6:2);
  assert.equal(await page.locator('.'+side+' [data-factor="'+factor+'"] strong').innerText(),label(factor,g[side].config[factor]));
 }
 assert.equal(await page.locator('.hand .point-card').count(),g.player.hand.length);
 assert.equal(await page.locator('.player [data-metric="C"] strong').innerText(),'0');
 await page.locator('.player [data-factor="WWR"]').click();
 assert.equal(await option(1).locator('.preview-delta').innerText(),'＋'+(20*effectivePoints(g,g.player.hand[index],'WWR','player')/27).toFixed(1)+'%');
 assert.equal(await option(-1).locator('.preview-delta').innerText(),'−2.0%','decrease preview is clipped to lower boundary');
 assert.equal(await page.locator('.player [data-factor="WWR"] strong').innerText(),'22.0%','preview cannot mutate configuration');
 assert.equal(await page.locator('.config-grid button.picked').evaluate(e=>getComputedStyle(e).animationIterationCount),'infinite');
 for(const direction of [1,-1])assert.equal(await option(direction).locator('.preview-delta').evaluate(e=>getComputedStyle(e).animationIterationCount),'infinite');
 await page.screenshot({path:out+'/wwr-both-directions.png'});
 g=await submit(g,{kind:'point',index,factor:'WWR',direction:1,mode:'self'});
 await choose(0,'WWR');const ownText=await option(1).locator('.preview-transition').innerText();
 await page.locator('.npc [data-factor="WWR"]').click();assert.equal(await page.locator('.model-preview').getAttribute('data-target'),'npc');
 assert.notEqual(await option(1).locator('.preview-transition').innerText(),ownText);assert.match(await option(1).locator('.preview-transition').innerText(),/^22.0%/);
 assert.match(await option(-1).locator('.preview-delta').innerText(),/^−/);
 await page.screenshot({path:out+'/opponent-both-directions.png'});
 await page.locator('.npc [data-factor="GLZ"]').click();assert.equal(await page.locator('.preview-delta').count(),6);
 await page.screenshot({path:out+'/glass-six-values.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.preview-delta').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.equal(await page.locator('.config-grid button.picked').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.locator('.cancel').click();assert.equal(await page.locator('.model-preview').count(),0);assert.equal(await page.locator('.config-grid button.picked').count(),0);
 const unaffordable=g.player.hand.findIndex(id=>pointById[id].rank>g.player.energy);
 if(unaffordable>=0){
  await choose(unaffordable,'WWR');assert(await option(1).isDisabled());assert(await option(-1).isDisabled());
  assert.equal(await page.locator('.hand .point-card').count(),g.player.hand.length);await page.locator('.cancel').click();
  report.checks.push('both direct-play choices disabled when stamina is insufficient');
 }
 report.checks.push('16 directly selectable slots, aligned guides, full rule copy, unique breathing selection, dual preview purity, live target/parameter switching, six glass values, direction click consumes once, cancellation, reduced motion');
 // Reach a real boundary through normal play, then play another card at zero.
 g=await start(seed);let clipped=false,noOp=false;
 for(let n=0;n<20&&!noOp;n++){
  const candidates=g.player.hand.map((id,index)=>({index,rank:pointById[id].rank})).filter(c=>c.rank<=g.player.energy).sort((a,b)=>b.rank-a.rank);
  if(!candidates.length){await page.locator('.end-turn').click();g=endTurn(g);assert.equal(g.phase,'battle');await page.locator('.roundbar').getByText('第 '+g.round+' 轮',{exact:false}).waitFor();continue;}
  const c=candidates[0],before=g.player.config.HR,after=change(g.player.config,'HR',-1,effectivePoints(g,g.player.hand[c.index],'HR','player')).HR;
  await choose(c.index,'HR');
  const deltaText=await option(-1).locator('.preview-delta').innerText();
  if(after===0&&before>0){assert.equal(deltaText,'−'+(before*60).toFixed(1)+'%');clipped=true;await page.screenshot({path:out+'/clipped-decrease.png'});}
  if(before===0){assert.equal(deltaText,'0%');assert.match(await option(-1).innerText(),/已达下限/);noOp=true;await page.screenshot({path:out+'/zero-change.png'});}
  g=await submit(g,{kind:'point',index:c.index,factor:'HR',direction:-1,mode:'self'});
 }
 assert(clipped&&noOp);report.checks.push('actual clipped reduction, zero-effect direct play, unchanged resource charging');
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/points-preview.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
