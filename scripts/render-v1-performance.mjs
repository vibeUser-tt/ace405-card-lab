import fs from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

// Host GPU observation only. This is not a mobile-device performance claim.
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route(/\/src\/BattleScene\.tsx(?:\?.*)?$/,async route=>{
  const response=await route.fetch();let body=await response.text();
  body=body.replace('renderer.render(scene, camera);','window.__renderBench = {renderer, roots}; (window.__renderTimes ||= []).push(performance.now()); renderer.render(scene, camera);');
  await route.fulfill({response,body});
 });
 await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:/进入采光关/}).click();
 await page.waitForSelector('.scene-host[data-assets="ready"]');await page.waitForTimeout(2000);
 await page.evaluate(()=>{window.__renderTimes=[];});await page.waitForTimeout(6000);
 const result=await page.evaluate(()=>{
  const {renderer}=window.__renderBench,gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const times=window.__renderTimes,intervals=times.slice(1).map((t,i)=>t-times[i]).sort((a,b)=>a-b);
  return {viewport:'1440x900',gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',
   averageRenderedFps:(times.length-1)*1000/(times.at(-1)-times[0]),frameIntervalP95Ms:intervals[Math.floor(intervals.length*.95)],
   drawCalls:renderer.info.render.calls,trianglesIncludingShadowPass:renderer.info.render.triangles,
   geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
   note:'Local desktop browser, base buildings and six animated citizens, 30fps idle render cap. Not a phone benchmark.'};
 });
 await fs.writeFile('Art/renders/host-performance-v1.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
