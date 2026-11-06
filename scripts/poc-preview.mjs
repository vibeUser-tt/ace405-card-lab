import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {beginRun,playCard,endTurn} from '../src/game.ts';
import {pointById,label,change} from '../src/model.ts';
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
const out='validation/preview-screenshots';await mkdir(out,{recursive:true});
const report={checks:[],errors:[],sources:{}};
for(const name of ['src/main.tsx','src/MetricCard.tsx','src/ParameterPreview.tsx','src/feedback.ts','src/PlayFeedback.tsx','src/style.css','scripts/poc-preview.mjs'])report.sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'no-preference'});
page.on('pageerror',e=>report.errors.push(e.message));
async function start(seed){await page.goto((process.env.POC_URL||'http://127.0.0.1:4180/')+'?seed='+seed);await page.locator('.start').click();await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor();return beginRun(0,seed);}
async function choose(index,factor,direction,mode='self'){
 if(await page.locator('.cancel').count())await page.locator('.cancel').click();
 await page.locator('.hand .point-card').nth(index).click();
 await page.getByRole('button',{name:mode==='self'?'调整自己':'反制对手',exact:true}).click();
 if(factor)await page.locator('.'+(mode==='self'?'player':'npc')+' [data-factor="'+factor+'"]').click();
 if(direction)await page.locator('[data-direction="'+direction+'"]').click();
}
async function confirm(g,a){
 await page.locator('.confirm-action').click();const next=playCard(g,'player',a),e=next.events.at(-1);
 await page.locator('.app-shell[data-play-stage]').waitFor({state:'detached'});
 assert.equal(await page.locator('.'+e.target+' [data-factor="'+e.factor+'"] strong').innerText(),label(e.factor,e.after));
 await page.locator('.model-preview').waitFor({state:'detached'});return next;
}
try{
 let seed=1;while(!beginRun(0,seed).player.hand.some(id=>pointById[id].rank===6))seed++;
 let g=await start(seed);const index=g.player.hand.findIndex(id=>pointById[id].rank===6);
 assert(!(await page.locator('.hand .point-card').allTextContents()).some(t=>t.includes('投入')));
 await choose(index);assert.match(await page.locator('.preview-status').innerText(),/点击下方参数/);
 await page.locator('.player [data-factor="WWR"]').click();assert.equal(await page.locator('.preview-status').innerText(),'选择增加或减少');
 await page.locator('[data-direction="1"]').click();assert.equal(await page.locator('.preview-delta').innerText(),'＋4.4%');
 assert.equal(await page.locator('.player [data-factor="WWR"] strong').innerText(),'22.0%','preview cannot mutate configuration');
 assert.equal(await page.locator('.player [data-metric="C"] strong').innerText(),'0');
 assert.equal(await page.locator('[data-direction="1"]').innerText(),'＋ 增加');
 assert.equal(await page.locator('.preview-delta').evaluate(e=>getComputedStyle(e).animationIterationCount),'infinite');
 await page.screenshot({path:out+'/wwr-increase.png'});
 g=await confirm(g,{kind:'point',index,factor:'WWR',direction:1,mode:'self'});
 await choose(0,'WWR',1);const ownText=await page.locator('.preview-transition').innerText();
 await page.getByRole('button',{name:'反制对手',exact:true}).click();assert.equal(await page.locator('.model-preview').getAttribute('data-target'),'npc');
 assert.notEqual(await page.locator('.preview-transition').innerText(),ownText);assert.match(await page.locator('.preview-transition').innerText(),/^22.0%/);
 await page.locator('[data-direction="-1"]').click();assert.match(await page.locator('.preview-delta').innerText(),/^−/);
 await page.screenshot({path:out+'/opponent-decrease.png'});
 await page.locator('.npc [data-factor="GLZ"]').click();assert.equal(await page.locator('.preview-delta').count(),3);
 await page.screenshot({path:out+'/glass-three-values.png'});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.preview-delta').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.locator('.cancel').click();assert.equal(await page.locator('.model-preview').count(),0);
 report.checks.push('card copy, pending direction, actual WWR delta, preview purity, infinite animation, completion cleanup, live target/direction/factor switching, three glass values, cancellation, reduced motion');
 // Reach a real boundary through normal play, then play another card at zero.
 g=await start(seed);let clipped=false,noOp=false;
 for(let n=0;n<20&&!noOp;n++){
  const candidates=g.player.hand.map((id,index)=>({index,rank:pointById[id].rank})).filter(c=>c.rank<=g.player.energy).sort((a,b)=>b.rank-a.rank);
  if(!candidates.length){await page.locator('.end-turn').click();g=endTurn(g);assert.equal(g.phase,'battle');await page.locator('.roundbar').getByText('第 '+g.round+' 轮',{exact:false}).waitFor();continue;}
  const c=candidates[0],before=g.player.config.HR,after=change(g.player.config,'HR',-1,c.rank).HR;
  await choose(c.index,'HR',-1);
  const deltaText=await page.locator('.preview-delta').innerText();
  if(after===0&&before>0){assert.equal(deltaText,'−'+(before*60).toFixed(1)+'%');clipped=true;await page.screenshot({path:out+'/clipped-decrease.png'});}
  if(before===0){assert.equal(deltaText,'0%');assert.match(await page.locator('.preview-status').innerText(),/已达下限/);noOp=true;await page.screenshot({path:out+'/zero-change.png'});}
  g=await confirm(g,{kind:'point',index:c.index,factor:'HR',direction:-1,mode:'self'});
 }
 assert(clipped&&noOp);report.checks.push('actual clipped reduction, zero-effect play, unchanged resource charging');
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/points-preview.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
