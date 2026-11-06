import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {beginRun,playCard,endTurn,slotMultiplier} from '../src/game.ts';
import {pointById,performance,levels,gates} from '../src/model.ts';
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
const out='validation/gate-screenshots';await mkdir(out,{recursive:true});
const report={sources:{},cases:[],errors:[]};
for(const file of ['src/game.ts','src/model.ts','src/main.tsx','src/feedback.ts','src/PlayFeedback.tsx','src/MetricCard.tsx','src/style.css','scripts/poc-gates.mjs'])report.sources[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'no-preference'});
page.on('pageerror',e=>report.errors.push(e.message));
let seed=1;
while(seed<10000){let g=beginRun(0,seed);if([9,1,4].every(n=>g.player.hand.some(id=>pointById[id].rank===n&&slotMultiplier(g,id,n===4?'HR':'WWR','player')===1&&(n===4||slotMultiplier(g,id,'WWR','npc')===1)))){g=playCard(g,'player',{kind:'point',index:g.player.hand.findIndex(id=>pointById[id].rank===4),mode:'self',factor:'HR',direction:1});if(endTurn(g).phase==='battle')break;}seed++;}
assert(seed<10000);report.seed=seed;
async function start(){await page.goto((process.env.POC_URL||'http://127.0.0.1:4180/')+'?seed='+seed);await page.locator('.start').click();await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor();assert.equal(await page.locator('.gate-effect').count(),0);return beginRun(0,seed);}
async function play(g,rank,factor,direction,mode,name,expected,{reduced=false}={}){
 const index=g.player.hand.findIndex(id=>pointById[id].rank===rank);assert(index>=0);const action={kind:'point',index,factor,direction,mode},next=playCard(g,'player',action),target=mode==='self'?'player':'npc';
 await page.locator('.hand .point-card').nth(index).click();await page.locator('.'+target+' [data-factor="'+factor+'"]').click();
 const sample=page.evaluate(({target,direction})=>new Promise(resolve=>{
  const rows=[],start=performance.now();let active=false;
  function frame(){
   const stage=document.querySelector('.app-shell').dataset.playStage;
   const metrics=Object.fromEntries(['D','E'].map(k=>{
    const e=document.querySelector('.'+target+' [data-metric="'+k+'"]'),wash=e.querySelector('.gate-wash'),status=e.querySelector('.gate-status'),n=e.querySelector('strong');
    return [k,{value:n.textContent,rolling:e.dataset.rolling==='true',passed:e.classList.contains('pass'),transition:e.dataset.gateTransition,pulse:e.dataset.gatePulse,opacity:wash?+getComputedStyle(wash).opacity:0,status:status.textContent,textClear:status.getBoundingClientRect().right<=n.getBoundingClientRect().left+1}];
   }));
   rows.push({time:performance.now()-start,stage,metrics,locked:document.querySelector('.end-turn').disabled,pending:document.querySelector('.'+target+' .qualification-note')?.textContent,won:!!document.querySelector('.result.victory'),width:innerWidth,pageWidth:document.documentElement.scrollWidth,height:innerHeight,pageHeight:document.documentElement.scrollHeight});
   if(stage)active=true;
   if(active&&!stage&&!document.querySelector('.gate-effect')||performance.now()-start>5500){resolve(rows);return;}
   requestAnimationFrame(frame);
  }
  document.querySelector('.direction-options button[data-direction="'+direction+'"]').click();requestAnimationFrame(frame);
 }),{target,direction});
 if(Object.values(expected).includes('passed')&&!reduced){
  await page.waitForFunction(target=>[...document.querySelectorAll('.'+target+' .gate-effect.passed .gate-wash')].some(e=>+getComputedStyle(e).opacity>=.35),target);
  await page.screenshot({path:out+'/'+name+'-green.png'});
 }
 const frames=await sample;const final=gates(performance(next[target].config),levels[0]);
 for(const k of ['D','E']){
  const transitions=frames.map(f=>f.metrics[k].transition).filter(Boolean);
  if(expected[k])assert(transitions.includes(expected[k]),name+' missing '+k+' '+expected[k]);else assert.equal(transitions.length,0,name+' unexpected replay '+k);
  const ids=new Set(frames.map(f=>f.metrics[k].pulse).filter(Boolean));assert(ids.size<=1,name+' repeated animation within one crossing');
  assert.equal(frames.at(-1).metrics[k].passed,final[k]);assert.equal(frames.at(-1).metrics[k].status,final[k]?'✓ 已达标':'待优化');
  assert.equal(frames.at(-1).metrics[k].opacity,0,'wash must fade away');
  assert(frames.every(f=>f.metrics[k].rolling||f.metrics[k].passed===(k==='D'?Number(f.metrics[k].value)+1e-8>=levels[0].limits.D:Number(f.metrics[k].value)<=levels[0].limits.E+1e-8)),name+' rounded display contradicts gate');
  assert(frames.every(f=>f.metrics[k].textClear),name+' status overlaps value');
 }
 assert(frames.every(f=>!Object.values(f.metrics).some(m=>m.transition)||!Object.values(f.metrics).some(m=>m.rolling)),'gate light waits until numbers settle');
 assert(frames.every(f=>!f.won),'no early victory');assert(frames.every(f=>f.pageWidth<=f.width+1));
 if(frames[0].width>=1000)assert(frames.every(f=>f.pageHeight<=f.height+1),'desktop one screen');
 if(!reduced&&Object.values(expected).includes('passed'))assert(frames.some(f=>!f.locked&&Object.values(f.metrics).some(m=>m.transition==='passed')),'gate light must not extend input lock');
 assert.equal(!!frames.at(-1).pending,final.D&&final.E);
 await page.screenshot({path:out+'/'+name+'-settled.png'});
 report.cases.push({name,expected,frames});console.log('PASS '+name);return next;
}
try{
 let g=await start();g=await play(g,9,'WWR',1,'self','single-daylight',{D:'passed'});
 g=await play(g,1,'WWR',1,'self','already-passing',{});
 g=await start();g=await play(g,9,'WWR',1,'counter','opponent-pass',{D:'passed'});
 g=await play(g,1,'WWR',-1,'counter','opponent-loses',{D:'lost'});
 g=await start();g=await play(g,4,'HR',1,'self','prepare-both',{});
 await page.locator('.end-turn').click();g=endTurn(g);await page.locator('.roundbar').getByText('第 2 轮',{exact:false}).waitFor();
 await page.setViewportSize({width:1024,height:768});
 g=await play(g,9,'WWR',1,'self','both-pending',{D:'passed',E:'passed'});
 assert.equal(g.phase,'battle');assert.equal(await page.locator('.result').count(),0);
 await page.locator('.end-turn').click();await page.locator('.result').waitFor();
 await page.getByRole('button',{name:'重开一局',exact:true}).click();
 await page.locator('.hand .point-card').first().waitFor();assert.equal(await page.locator('.gate-effect').count(),0,'restart must not play a loss effect');
 report.cases.push({name:'restart-reset',passed:true});
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});
 g=await start();g=await play(g,9,'WWR',1,'self','mobile-reduced',{D:'passed'},{reduced:true});
 assert.equal(await page.locator('.gate-effect').count(),0);assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/points-gates.json',JSON.stringify(report,null,2));await browser.close();}
