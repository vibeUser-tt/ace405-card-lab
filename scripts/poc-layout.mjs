import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {beginRun} from '../src/game.ts';
import {pointById} from '../src/model.ts';
let seed=1;while(true){const g=beginRun(0,seed);if(g.player.hand.length&&pointById[g.player.hand[0]].suit===g.slotSuits.player.GLZ)break;seed++;}
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
const output='validation/layout-screenshots';await mkdir(output,{recursive:true});
const report={sources:{},views:[],boundaries:[],errors:[]};
for(const name of ['src/game.ts','src/model.ts','src/main.tsx','src/MetricCard.tsx','src/ParameterPreview.tsx','src/feedback.ts','src/PlayFeedback.tsx','src/style.css','scripts/poc-layout.mjs'])report.sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
async function inspect(page,desktop,stage){
 const measure=await page.evaluate(()=>{
  const bounds=selector=>{const e=typeof selector==='string'?document.querySelector(selector):selector;if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,overflowY:e.scrollHeight-e.clientHeight,overflowX:e.scrollWidth-e.clientWidth};};
  return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,arena:bounds('.arena'),hand:bounds('.hand'),end:bounds('.end-turn'),command:bounds('.command-bar'),confirm:bounds('.confirm-action'),controls:bounds('.command-controls'),preview:bounds('.model-preview'),previewContent:bounds('.preview-content')??bounds('.preview-guides'),selectedSlot:bounds('.config-grid .picked'),directions:Array.from(document.querySelectorAll('.direction-options button')).map(e=>({rect:bounds(e),values:Array.from(e.querySelectorAll('.preview-value')).map(bounds)})),firstCardTop:Math.min(...Array.from(document.querySelectorAll('.hand-card')).map(e=>e.getBoundingClientRect().top))};
 });
 assert(measure.pageWidth<=measure.width+1,stage+' page horizontal overflow');
 if(measure.preview){
  assert(measure.previewContent.top>=measure.preview.top-1&&measure.previewContent.bottom<=measure.preview.bottom+1,stage+' preview clipped '+JSON.stringify({preview:measure.preview,content:measure.previewContent,directions:measure.directions}));
  assert(measure.previewContent.left>=measure.preview.left-1&&measure.previewContent.right<=measure.preview.right+1,stage+' preview horizontally clipped');
  assert(Math.abs((measure.preview.left+measure.preview.right)/2-measure.width/2)<2,stage+' preview not centered');
 }
 for(const {rect,values} of measure.directions){
  assert(rect.height>=44&&rect.width>=44,stage+' direction touch target too small');
  assert(rect.overflowY<=1&&rect.overflowX<=1,stage+' direction contents overflow');
  for(const value of values)assert(value.left>=rect.left-1&&value.right<=rect.right+1&&value.top>=rect.top-1&&value.bottom<=rect.bottom+1&&value.overflowX<=1&&value.overflowY<=1,stage+' preview value clipped '+JSON.stringify({rect,value}));
 }
 if(!desktop&&measure.width<=430&&measure.preview&&measure.selectedSlot){
  const span=measure.selectedSlot.bottom-measure.preview.top;
  if(span<=measure.height-24)assert(measure.preview.top>=-1&&measure.preview.bottom<=measure.height+1&&measure.selectedSlot.top>=0&&measure.selectedSlot.bottom<=measure.height+1,stage+' preview and selected slot should both remain visible '+JSON.stringify(measure));
 }
 if(desktop){
  assert(measure.pageHeight<=measure.height+1,stage+' page vertical overflow '+JSON.stringify(measure));
  for(const key of ['end','hand','command',...(measure.confirm?['confirm']:[])]){
   const r=measure[key];assert(r.top>=0&&r.bottom<=measure.height+1&&r.left>=0&&r.right<=measure.width+1,stage+' clipped '+key+' '+JSON.stringify(measure));
  }
  assert(Math.abs((measure.hand.left+measure.hand.right)/2-measure.width/2)<2,stage+' hand not centered');
  if(measure.controls){assert(Math.abs((measure.controls.left+measure.controls.right)/2-measure.width/2)<2,stage+' controls not centered');assert(measure.controls.bottom<=measure.firstCardTop,stage+' controls overlap cards');}
  if(measure.height>=720)assert(measure.arena.overflowY<=1,stage+' building or parameters require scrolling '+JSON.stringify(measure));
 }
 return {stage,...measure};
}
try{
 const viewports=[{width:2560,height:1347},{width:1707,height:898},{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},{width:1280,height:720},{width:1024,height:768},{width:1280,height:600},{width:844,height:390},{width:667,height:375},{width:360,height:800},{width:390,height:844},{width:430,height:932}];
 const requested=process.env.POC_VIEWPORTS?.split(',');
 for(const viewport of viewports.filter(view=>!requested||requested.includes(view.width+'x'+view.height))){
  const desktop=viewport.width>=1000&&viewport.height>=600,page=await browser.newPage({viewport,reducedMotion:'reduce',isMobile:!desktop,hasTouch:!desktop});
  const activate=locator=>desktop?locator.click():locator.tap();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto((process.env.POC_URL||'http://127.0.0.1:4180/')+'?seed='+seed);await page.locator('.start').click();
  await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor({timeout:60000});
  const states=[await inspect(page,desktop,'initial')];
  await page.screenshot({path:output+'/'+viewport.width+'x'+viewport.height+'-initial.png'});
  await activate(page.locator('.hand .point-card').first());
  assert.equal(await page.locator('.config-grid .selectable').count(),16);
  assert.equal(await page.locator('.target-guide').count(),2);
  states.push(await inspect(page,desktop,'target-guides'));
  await page.screenshot({path:output+'/'+viewport.width+'x'+viewport.height+'-guides.png',fullPage:!desktop});
  await activate(page.locator('.player [data-factor="GLZ"]'));
  if(!desktop)await page.locator('.model-preview').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.preview-delta').count(),6);
  assert.equal(await page.locator('.confirm-action').count(),0);
  assert.equal(await page.locator('.preview-target .suit-bonus').count(),1);
  states.push(await inspect(page,desktop,'glass-selected'));
  await page.screenshot({path:output+'/'+viewport.width+'x'+viewport.height+'-selected.png'});
  await activate(page.locator('.npc [data-factor="GLZ"]'));
  states.push(await inspect(page,desktop,'opponent-glass-selected'));
  if(!desktop&&viewport.width<=430){
   await activate(page.locator('.player [data-factor="HR"]'));
   states.push(await inspect(page,desktop,'last-row-selected'));
   await page.screenshot({path:output+'/'+viewport.width+'x'+viewport.height+'-last-row.png'});
  }
  await activate(page.locator('.player [data-factor="GLZ"]'));
  await activate(page.locator('[data-direction="1"]'));await page.locator('.end-turn').click();
  await page.locator('.roundbar').getByText('第 2 轮',{exact:false}).waitFor();
  await page.locator('.opponent-review summary').click();
  states.push(await inspect(page,desktop,'review-expanded'));
  await activate(page.locator('.hand .point-card').first());await activate(page.locator('.player [data-factor="GLZ"]'));
  states.push(await inspect(page,desktop,'review-and-action'));
  report.views.push({viewport,desktop,states});console.log('PASS '+viewport.width+'x'+viewport.height);await page.close();
 }
 if(!requested||requested.includes('1280x600')){
  let boundarySeed=1,boundaryIndex=-1;
  for(;boundarySeed<10000;boundarySeed++){
   const g=beginRun(0,boundarySeed);
   if(g.player.hand.length<2)continue;
   boundaryIndex=g.player.hand.findIndex(id=>pointById[id].rank===10&&pointById[id].suit===g.slotSuits.player.GLZ);
   if(boundaryIndex>=0)break;
  }
  assert(boundaryIndex>=0);
  const page=await browser.newPage({viewport:{width:1280,height:600},reducedMotion:'reduce'});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto((process.env.POC_URL||'http://127.0.0.1:4180/')+'?seed='+boundarySeed);await page.locator('.start').click();
  await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor({timeout:60000});
  await page.locator('.hand .point-card').nth(boundaryIndex).click();await page.locator('.player [data-factor="GLZ"]').click();
  await page.locator('[data-direction="1"]').click();await page.locator('.app-shell[data-play-stage]').waitFor({state:'detached'});
  await page.locator('.hand .point-card').first().click();await page.locator('.player [data-factor="GLZ"]').click();
  assert.match(await page.locator('[data-direction="1"] .preview-boundary').innerText(),/已达上限/);
  report.boundaries.push({seed:boundarySeed,...await inspect(page,true,'glass-upper-boundary')});
  await page.screenshot({path:output+'/1280x600-glass-boundary.png'});await page.close();console.log('PASS 1280x600 glass upper boundary');
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/points-layout.json',JSON.stringify(report,null,2));await browser.close();}
