import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {beginRun,playCard,endTurn} from '../src/game.ts';
import {pointById,label,performance} from '../src/model.ts';
import {metricParticles,particleProgress} from '../src/feedback.ts';
const example={before:0,after:1,beforeValues:{D:50,E:150},afterValues:{D:55,E:147}};
assert.deepEqual(metricParticles(example).map(p=>p.count),[30,6],'10% vs 2% must distribute 5:1');
assert.deepEqual(metricParticles({...example,beforeValues:{D:50,E:1500},afterValues:{D:55,E:1470}}).map(p=>p.count),[30,6],'changing energy units cannot change allocation');
assert.deepEqual(metricParticles({...example,blocked:true}),[]);
assert.deepEqual(metricParticles({...example,afterValues:{D:50,E:147}}).map(p=>[p.metric,p.count]),[['E',36]]);
assert(metricParticles({...example,beforeValues:{D:0,E:150}}).every(p=>Number.isFinite(p.relative)));
assert(particleProgress(.25)<.25&&particleProgress(.75)>.75);
assert(particleProgress(.6)-particleProgress(.4)>particleProgress(.2)-particleProgress(0),'accelerate in the middle');
assert(particleProgress(.6)-particleProgress(.4)>particleProgress(1)-particleProgress(.8),'slow down on arrival');
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
const out='validation/feedback-screenshots';await mkdir(out,{recursive:true});
const report={cases:[],errors:[],sources:{}};
for(const name of ['src/game.ts','src/model.ts','src/main.tsx','src/feedback.ts','src/MetricCard.tsx','src/PlayFeedback.tsx','src/ParameterPreview.tsx','src/style.css','scripts/poc-feedback.mjs'])report.sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'no-preference'});
page.on('pageerror',e=>report.errors.push(e.message));
async function start(seed){await page.goto((process.env.POC_URL||'http://127.0.0.1:4180/')+'?seed='+seed);await page.locator('.start').click();await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor();return beginRun(0,seed);}
async function select(a){await page.locator('.hand .point-card').nth(a.index).click();await page.locator('.'+(a.mode==='self'?'player':'npc')+' [data-factor="'+a.factor+'"]').click();}
async function record(g,a,name,{reduced=false,resize=false}={}){
 await select(a);const next=playCard(g,'player',a),e=next.events.at(-1),target=e.target;
 assert.equal(await page.locator('.direction-options button[data-direction]').count(),2);
 assert.equal(await page.locator('.confirm-action').count(),0);
 assert.equal(await page.locator('.preview-target .suit-bonus').count(),e.multiplier===2?1:0);
 const slotMaps=await page.locator('.config-grid').evaluateAll(es=>es.map(e=>Array.from(e.querySelectorAll('button')).map(b=>b.dataset.suit)));
 assert.deepEqual(slotMaps[0],Object.values(g.slotSuits.npc));assert.deepEqual(slotMaps[1],Object.values(g.slotSuits.player));assert.equal(slotMaps[0].filter(s=>s===pointById[e.card].suit).length,2);
 const sampling=page.evaluate(({target,factor,direction})=>new Promise(resolve=>{
  const rows=[],start=performance.now();let active=false;
  const frame=()=>{
   const root=document.querySelector('.app-shell'),stage=root.dataset.playStage;
   const slot=document.querySelector('.'+target+' [data-factor="'+factor+'"]'),flight=document.querySelector('.play-flight');
   const rect=flight?.getBoundingClientRect(),destination=slot.querySelector('strong').getBoundingClientRect();
   const metrics=Object.fromEntries(['D','E'].map(k=>{const box=document.querySelector('.'+target+' [data-metric="'+k+'"]');return [k,{value:box.querySelector('strong').textContent,rolling:box.dataset.rolling,injecting:box.dataset.injecting,gate:box.dataset.gateTransition,delta:box.querySelector('.metric-delta')?.textContent}];}));
   const streams=Array.from(document.querySelectorAll('.particle-stream')).map(stream=>{
    const metric=stream.dataset.metric,dest=document.querySelector('.'+target+' [data-metric="'+metric+'"] strong').getBoundingClientRect();
    return {metric,count:+stream.dataset.count,relative:+stream.dataset.relative,improved:stream.classList.contains('improved'),particles:Array.from(stream.querySelectorAll('.metric-particle')).map(p=>{const r=p.getBoundingClientRect();return {id:+p.dataset.particle,p:+p.dataset.progress,distance:Math.hypot(r.x+r.width/2-dest.x-dest.width/2,r.y+r.height/2-dest.y-dest.height/2)};})};
   });
   rows.push({streams,time:performance.now()-start,stage,value:slot.querySelector('strong').textContent,meter:slot.querySelector('meter').value,rolling:slot.dataset.rolling,impact:slot.dataset.impact,bonus:!!slot.querySelector('.suit-burst'),notice:slot.querySelector('.slot-notice')?.textContent,metrics,flight:rect?{x:rect.x+rect.width/2,y:rect.y+rect.height/2,p:+flight.dataset.progress,distance:Math.hypot(rect.x+rect.width/2-destination.x-destination.width/2,rect.y+rect.height/2-destination.y-destination.height/2)}:null,locked:document.querySelector('.end-turn').disabled,pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth});
   if(stage)active=true;
   if((active&&!stage)||performance.now()-start>3600){resolve(rows);return;}
   requestAnimationFrame(frame);
  };
  document.querySelector('.direction-options button[data-direction="'+direction+'"]').click();requestAnimationFrame(frame);
 }),{target,factor:e.factor,direction:a.direction});
 if(!reduced){
  await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.playStage==='flight');
  await page.screenshot({path:out+'/'+name+'-flight.png'});
 }
 if(resize)await page.setViewportSize({width:1366,height:768});
 else {
  await page.locator('.'+target+' [data-impact]').waitFor();
  await page.screenshot({path:out+'/'+name+'-arrival.png'});
 }
 if(!resize&&!reduced&&metricParticles(e).length){
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.metric-particle')).some(p=>+p.dataset.progress>.35&&+p.dataset.progress<.8));
  await page.screenshot({path:out+'/'+name+'-particles.png'});
 }
 const frames=await sampling;
 assert.equal(frames.at(-1).stage,undefined,name+' must finish');
 assert.equal(frames.at(-1).value,label(e.factor,e.after));
 assert.equal(await page.locator('.player [data-metric="C"] strong').innerText(),String(next.player.spent));
 for(const side of ['player','npc'])for(const metric of ['D','E'])assert(Math.abs(Number(await page.locator('.'+side+' [data-metric="'+metric+'"] strong').innerText())-performance(next[side].config)[metric])<=.050001);
 assert(frames.every(f=>f.pageWidth<=f.viewportWidth+1),name+' animation must not widen the page');
 const active=frames.filter(f=>f.stage);assert(active.length);assert(active.every(f=>f.locked));
 if(!resize&&!reduced){const flights=frames.filter(f=>f.flight?.p>0);assert(flights.length>2);assert(flights.at(-1).flight.distance<flights[0].flight.distance);}
 if(e.blocked||e.before===e.after){
  assert(frames.every(f=>f.value===label(e.factor,e.before)));assert(frames.every(f=>f.rolling==='false'));
  assert(frames.every(f=>!f.metrics.D.delta&&!f.metrics.E.delta));
  assert(frames.some(f=>f.notice===(e.blocked?'已抵挡':'未改变')));
 }else if(!resize&&!reduced){
  assert(frames.some(f=>f.value!==label(e.factor,e.before)&&f.value!==label(e.factor,e.after)),name+' intermediate parameter values');
  assert(frames.some(f=>f.rolling==='true'));
  for(const k of ['D','E'])if(Math.abs(e.afterValues[k]-e.beforeValues[k])>.2){
   assert(frames.some(f=>f.metrics[k].rolling==='true'));assert(frames.some(f=>f.metrics[k].delta));
   assert(frames.find(f=>f.metrics[k].rolling==='true').time>=frames.find(f=>f.rolling==='true').time);
  }
 }
 assert.equal(frames.some(f=>f.bonus),e.multiplier===2&&!e.blocked&&e.before!==e.after,'bonus visual only on actual matched adjustment');
 const expected=metricParticles(e);
 if(reduced||!expected.length)assert(frames.every(f=>f.streams.length===0),'no false particles');
 else if(!resize){
  assert(frames.some(f=>f.streams.length),'particle flow exists');
  assert(frames.filter(f=>f.streams.length).every(f=>f.rolling==='false'&&f.value===label(e.factor,e.after)),'parameter settles before particles');
  for(const impact of expected){
   const samples=frames.flatMap(f=>f.streams.filter(s=>s.metric===impact.metric));
   assert(samples.length);assert(samples.every(s=>s.count===impact.count&&s.improved===impact.improved));
   const seen=new Set(samples.flatMap(s=>s.particles.map(p=>p.id)));assert.equal(seen.size,impact.count,'all allocated particles actually emitted');
   const lead=samples.flatMap(s=>s.particles.filter(p=>p.id===0));assert(lead.at(-1).distance<lead[0].distance,'flow reaches the corresponding metric');
   assert(frames.some(f=>f.metrics[impact.metric].injecting==='true'),'arrival lights up the number');
   assert(frames.filter(f=>['launch','flight','parameter','particles'].includes(f.stage)).every(f=>f.metrics[impact.metric].rolling==='false'),'no early metric rolling');
  }
 }
 assert(frames.every(f=>!f.metrics.D.gate&&!f.metrics.E.gate||f.metrics.D.rolling!=='true'&&f.metrics.E.rolling!=='true'),'green waits for both rolls');
 if(reduced)assert(frames.every(f=>!f.flight&&f.rolling==='false'));
 assert.equal(await page.locator('.play-flight').count(),0);assert.equal(await page.locator('[data-impact]').count(),0);
 report.cases.push({name,event:e,frames});console.log('PASS '+name);return next;
}
try{
 let seed=1;while(!beginRun(0,seed).player.hand.some(id=>pointById[id].rank===6))seed++;
 let g=await start(seed),index=g.player.hand.findIndex(id=>pointById[id].rank===6);
 g=await record(g,{kind:'point',index,mode:'self',factor:'WWR',direction:1},'self');
 g=await start(seed);g=await record(g,{kind:'point',index,mode:'counter',factor:'WWR',direction:-1},'counter-clipped');
 index=g.player.hand.findIndex(id=>pointById[id].rank<=g.player.energy);assert(index>=0);
 g=await record(g,{kind:'point',index,mode:'counter',factor:'WWR',direction:-1},'boundary-zero');
 let shieldSeed=1;while(true){const test=endTurn(beginRun(0,shieldSeed));if(test.npc.shield&&test.player.hand.some(id=>pointById[id].suit===test.slotSuits.npc[test.npc.shield.factor]))break;shieldSeed++;}
 g=await start(shieldSeed);await page.locator('.end-turn').click();g=endTurn(g);await page.locator('.roundbar').getByText('第 2 轮',{exact:false}).waitFor();
 const factor=g.npc.shield.factor;
 g=await record(g,{kind:'point',index:g.player.hand.findIndex(id=>pointById[id].suit===g.slotSuits.npc[factor]),mode:'counter',factor,direction:g.npc.config[factor]>.5?-1:1},'shield-blocked');
 assert(g.events.at(-1).blocked);
 g=await start(seed);index=g.player.hand.findIndex(id=>pointById[id].rank===6);
 await record(g,{kind:'point',index,mode:'self',factor:'GLZ',direction:-1},'glass');
 g=await start(seed);await record(g,{kind:'point',index,mode:'self',factor:'HR',direction:1},'energy-only');
 let counterSeed;
 for(const mode of ['self','counter']){
  const target=mode==='self'?'player':'npc',other=mode==='self'?'npc':'player';let matchSeed=1;
  while(true){const g=beginRun(0,matchSeed);if(g.slotSuits.player.WWR!==g.slotSuits.npc.WWR&&g.player.hand.some(id=>pointById[id].rank===6&&pointById[id].suit===g.slotSuits[target].WWR))break;matchSeed++;}
  const matched=await start(matchSeed),matchedIndex=matched.player.hand.findIndex(id=>pointById[id].rank===6&&pointById[id].suit===matched.slotSuits[target].WWR);
  await select({index:matchedIndex,mode,factor:'WWR',direction:1});
  assert.equal(await page.locator('.suit-bonus').count(),1);
  const doubled=await page.locator('[data-direction="1"] .preview-delta').innerText();
  await page.locator('.'+other+' [data-factor="WWR"]').click();
  assert.equal(await page.locator('.suit-bonus').count(),0);assert.notEqual(await page.locator('[data-direction="1"] .preview-delta').innerText(),doubled);
  await page.locator('.cancel').click();
  await record(matched,{kind:'point',index:matchedIndex,mode,factor:'WWR',direction:1},'matched-'+mode);
  if(mode==='counter')counterSeed=matchSeed;
  else {const again=await start(matchSeed);await record(again,{kind:'point',index:matchedIndex,mode:'counter',factor:'WWR',direction:1},'own-match-counter-unmatched');}
 }
 g=await start(counterSeed);index=g.player.hand.findIndex(id=>pointById[id].rank===6&&pointById[id].suit===g.slotSuits.npc.WWR);
 await record(g,{kind:'point',index,mode:'counter',factor:'WWR',direction:-1},'matched-clipped');
 g=await start(seed);index=g.player.hand.findIndex(id=>pointById[id].rank===6);
 await page.emulateMedia({reducedMotion:'reduce'});g=await start(seed);
 await record(g,{kind:'point',index,mode:'self',factor:'WWR',direction:1},'reduced',{reduced:true});
 await page.emulateMedia({reducedMotion:'no-preference'});g=await start(seed);
 await record(g,{kind:'point',index,mode:'self',factor:'WWR',direction:1},'resize',{resize:true});
 await page.setViewportSize({width:390,height:844});g=await start(seed);
 await record(g,{kind:'point',index,mode:'self',factor:'WWR',direction:1},'mobile');
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/points-feedback.json',JSON.stringify(report,null,2));await browser.close();}
