import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const output = new URL('../Art/renders/',import.meta.url);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[]; const report={};
try {
  const page=await browser.newPage({viewport:{width:1240,height:1120}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route(/\/src\/RenderReview\.tsx(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    assert(body.includes('renderer.render(scene, camera);'));
    body=body.replace('renderer.render(scene, camera);','window.__renderReview = {scene, camera, instance, renderer}; renderer.render(scene, camera);');
    await route.fulfill({response,body});
  });
  await page.goto('http://127.0.0.1:5173/?renderReview');
  await page.waitForSelector('.render-review[data-ready="true"]');await page.waitForTimeout(1800);
  const png=await page.locator('canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1]);
  await fs.writeFile(new URL('web-reference-v1.png',output),Buffer.from(png,'base64'));
  report.reference=await page.evaluate(()=>{
    const {instance,renderer}=window.__renderReview;
    const mesh=instance.group.getObjectByName('Architecture');
    return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,lightmap:!!mesh.material.lightMap,uv1:!!mesh.geometry.attributes.uv1,glassOpaque:!mesh.material.transparent,clips:instance.people[0].mixer._actions.map(a=>a.getClip().name),doorRotation:instance.door.rotation.toArray()};
  });
  assert(report.reference.lightmap&&report.reference.uv1&&report.reference.glassOpaque);
  assert(report.reference.clips.length>0,'Blender-authored walk animation must be exported');
  assert(await page.evaluate(()=>{
    let colored=false;window.__renderReview.instance.people[0].root.traverse(o=>{if(o.isMesh&&o.geometry.attributes.color&&o.material.vertexColors)colored=true;});return colored;
  }),'character palette survives GLB export');
  await page.getByRole('button',{name:'播放人物与门动画'}).click();await page.waitForTimeout(1300);
  report.animation=await page.evaluate(()=>{const i=window.__renderReview.instance;return {doorRotation:i.door.rotation.toArray(),time:i.time,person:i.people[0].root.position.toArray()};});
  assert(report.animation.time>0);assert.notDeepEqual(report.animation.doorRotation,report.reference.doorRotation,'entry door opens');
  const motion=await page.evaluate(async()=>{
    const {updateModernBuilding}=await import('/src/modern-assets.ts');const i=window.__renderReview.instance;
    const before=i.people[0].root.position.clone();
    for(let step=0;step<180;step++)updateModernBuilding(i,.05,false);
    return {distance:i.people[0].root.position.distanceTo(before),tracks:i.people[0].mixer._actions[0].getClip().tracks.length,mixerTime:i.people[0].mixer.time};
  });
  assert(motion.distance>.5&&motion.tracks>0&&motion.mixerTime>0,'citizen follows path and plays authored motion');report.walk=motion;
  await page.screenshot({path:new URL('web-animation-v1.png',output).pathname.replace(/^\/(\w:)/,'$1')});
  // Check a second camera without changing assets, illumination or exposure.
  await page.goto('http://127.0.0.1:5173/?renderReview&view=back');
  await page.waitForSelector('.render-review[data-ready="true"]');await page.waitForTimeout(1000);
  const rear=await page.locator('canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1]);
  await fs.writeFile(new URL('web-reference-v1-back.png',output),Buffer.from(rear,'base64'));
  await page.getByRole('button',{name:'查看 Blender 参考'}).click();
  await page.waitForFunction(()=>document.querySelector('.render-review img')?.complete);
  assert(await page.locator('.render-review img').evaluate(i=>i.naturalWidth===1200));
  await page.close();
  for(const [width,height] of [[1440,900],[390,844],[844,390]]) {
    const game=await browser.newPage({viewport:{width,height}});game.on('pageerror',e=>errors.push(e.message));
    await game.goto('http://127.0.0.1:5173/');await game.getByRole('button',{name:/进入采光关/}).click();
    await game.waitForSelector('.scene-host[data-assets="ready"]');await game.waitForTimeout(1200);
    assert.equal(await game.locator('.scene-fallback').count(),0);
    assert.equal(await game.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await game.screenshot({path:new URL(`game-v1-${width}.png`,output).pathname.replace(/^\/(\w:)/,'$1')});
    report[`${width}x${height}`]=await game.locator('.scene-host').evaluate(e=>({...e.dataset}));
    await game.close();
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('web-audit-v1.json',output),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
