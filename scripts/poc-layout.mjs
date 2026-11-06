import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=await import('playwright').catch(()=>import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}:{})});
const output='validation/layout-screenshots';await mkdir(output,{recursive:true});
const report={sources:{},views:[],errors:[]};
for(const name of ['src/main.tsx','src/MetricCard.tsx','src/ParameterPreview.tsx','src/feedback.ts','src/PlayFeedback.tsx','src/style.css','scripts/poc-layout.mjs'])report.sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
async function inspect(page,desktop,stage){
 const measure=await page.evaluate(()=>{
  const bounds=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,overflowY:e.scrollHeight-e.clientHeight};};
  return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,arena:bounds('.arena'),hand:bounds('.hand'),end:bounds('.end-turn'),command:bounds('.command-bar'),confirm:document.querySelector('.confirm-action')?bounds('.confirm-action'):null,controls:document.querySelector('.command-controls')?bounds('.command-controls'):null,preview:document.querySelector('.model-preview')?bounds('.model-preview'):null,previewContent:document.querySelector('.preview-content')?bounds('.preview-content'):null,firstCardTop:Math.min(...Array.from(document.querySelectorAll('.hand-card')).map(e=>e.getBoundingClientRect().top))};
 });
 assert(measure.pageWidth<=measure.width+1,stage+' page horizontal overflow');
 if(measure.preview){
  assert(measure.previewContent.top>=measure.preview.top-1&&measure.previewContent.bottom<=measure.preview.bottom+1,stage+' preview clipped');
  assert(Math.abs((measure.preview.left+measure.preview.right)/2-measure.width/2)<2,stage+' preview not centered');
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
 for(const viewport of [{width:2560,height:1347},{width:1707,height:898},{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},{width:1280,height:720},{width:1024,height:768},{width:1280,height:600},{width:844,height:390},{width:390,height:844}]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'}),desktop=viewport.width>=1000&&viewport.height>=600;
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto((process.env.POC_URL||'http://127.0.0.1:4180/')+'?seed=405');await page.locator('.start').click();
  await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor({timeout:60000});
  const states=[await inspect(page,desktop,'initial')];
  await page.screenshot({path:output+'/'+viewport.width+'x'+viewport.height+'-initial.png'});
  await page.locator('.hand .point-card').first().click();await page.locator('.player [data-factor="GLZ"]').click();await page.locator('[data-direction="1"]').click();
  if(!desktop)await page.locator('.confirm-action').scrollIntoViewIfNeeded();
  states.push(await inspect(page,desktop,'glass-selected'));
  await page.screenshot({path:output+'/'+viewport.width+'x'+viewport.height+'-selected.png'});
  await page.locator('.confirm-action').click();await page.locator('.end-turn').click();
  await page.locator('.roundbar').getByText('第 2 轮',{exact:false}).waitFor();
  await page.locator('.opponent-review summary').click();
  states.push(await inspect(page,desktop,'review-expanded'));
  await page.locator('.hand .point-card').first().click();await page.locator('.player [data-factor="GLZ"]').click();await page.locator('[data-direction="1"]').click();
  states.push(await inspect(page,desktop,'review-and-action'));
  report.views.push({viewport,desktop,states});console.log('PASS '+viewport.width+'x'+viewport.height);await page.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('validation/points-layout.json',JSON.stringify(report,null,2));await browser.close();}
