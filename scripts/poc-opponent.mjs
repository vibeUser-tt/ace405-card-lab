import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {beginRun,playCard,endTurn,chooseAction,publicCost} from '../src/game.ts';
import {factors,label,performance} from '../src/model.ts';
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const report={cases:[],errors:[],sources:{}};
for(const p of ['src/game.ts','src/model.ts','src/main.tsx','scripts/poc-opponent.mjs'])report.sources[p]=createHash('sha256').update(await readFile(p)).digest('hex');
function scenario(kind){
 for(let seed=1;seed<=2000;seed++){
  let g=beginRun(0,seed);const steps=[];
  for(let round=0;round<6&&g.phase==='battle';round++){
   let simulated=g,attack;
   for(const a of g.npcPlan){simulated=playCard(simulated,'npc',a);if(a.mode==='counter')attack=simulated.events.at(-1);}
   if(attack&&!attack.blocked&&attack.before!==attack.after&&(kind==='matched'?attack.multiplier===2:kind==='ordinary'?attack.multiplier===1:g.player.functionHand.includes('F08')))
    return {seed,g,steps,attack};
   while(true){const a=chooseAction(g,'player','skilled');if(!a)break;steps.push(a);g=playCard(g,'player',a);}
   steps.push(null);g=endTurn(g);
  }
 }
 throw Error('No counter scenario '+kind);
}
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
const out='validation/opponent-screenshots';await mkdir(out,{recursive:true});
async function play(page,g,a){
 const id=(a.kind==='point'?g.player.hand:g.player.functionHand)[a.index];
 await page.locator(a.kind==='point'?'.hand .point-card':'.hand .function-card').nth(a.index).click();
 if(a.kind==='point'){
  await page.getByRole('button',{name:a.mode==='self'?'调整自己':'反制对手',exact:true}).click();
  await page.locator('.'+(a.mode==='self'?'player':'npc')+' [data-factor="'+a.factor+'"]').click();await page.locator('[data-direction="'+a.direction+'"]').click();
 }else if(id==='F08')await page.locator('.player [data-factor="'+a.factor+'"]').click();
 else if(id==='F02')await page.locator('.hand .point-card').nth(a.discard).click();
 await page.locator('.confirm-action').click();await page.locator('.app-shell[data-play-stage]').waitFor({state:'detached'});
 return playCard(g,'player',a);
}
async function finish(page,g){
 await page.locator('.end-turn').click();const next=endTurn(g);
 if(next.phase==='battle')await page.locator('.roundbar').getByText('第 '+next.round+' 轮',{exact:false}).waitFor();else await page.locator('.result').waitFor();
 return next;
}
try{
 for(const kind of ['ordinary','matched','protected']){
  const found=scenario(kind),page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto((process.env.POC_URL||'http://127.0.0.1:4180/')+'?seed='+found.seed);await page.locator('.start').click();
  await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor();let g=beginRun(0,found.seed);
  for(const a of found.steps)g=a?await play(page,g,a):await finish(page,g);
  if(kind==='protected')g=await play(page,g,{kind:'function',index:g.player.functionHand.indexOf('F08'),factor:found.attack.factor});
  const count=g.events.length,plan=JSON.stringify(g.npcPlan);g=await finish(page,g);
  const attack=g.events.slice(count).find(e=>e.side==='npc'&&e.mode==='counter');assert(attack);
  assert.equal(!!attack.blocked,kind==='protected');assert.equal(attack.factor,found.attack.factor);
  if(kind==='matched')assert.equal(attack.multiplier,2);
  if(kind==='protected')assert.equal(attack.after,attack.before);
  else assert(attack.afterValues.D<attack.beforeValues.D||attack.afterValues.E>attack.beforeValues.E);
  for(const side of ['player','npc']){
   for(const f of factors)assert.equal(await page.locator('.'+side+' [data-factor="'+f+'"] strong').innerText(),label(f,g[side].config[f]));
   const v=performance(g[side].config);for(const metric of ['D','E'])assert(Math.abs(Number(await page.locator('.'+side+' [data-metric="'+metric+'"] strong').innerText())-v[metric])<=.050001);
   assert.equal(await page.locator('.'+side+' [data-metric="C"] strong').innerText(),String(publicCost(g,side)));
  }
  await page.locator('.opponent-review summary').click();assert((await page.locator('.opponent-review').innerText()).includes(attack.message));
  await page.screenshot({path:out+'/'+kind+'.png'});report.cases.push({kind,seed:found.seed,round:attack.round,plan:JSON.parse(plan),attack});console.log('PASS opponent '+kind);await page.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/points-opponent.json',JSON.stringify(report,null,2));await browser.close();}
