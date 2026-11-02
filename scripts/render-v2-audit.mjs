import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const output=new URL('../Art/renders/',import.meta.url), report={};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1240,height:1200}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route(/\/src\/RenderReview\.tsx(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();assert(body.includes('renderer.render(scene, camera);'));
    body=body.replace('renderer.render(scene, camera);','window.__renderReview={scene,camera,instance,renderer};renderer.render(scene,camera);');await route.fulfill({response,body});
  });
  const capture=async(query,suffix)=>{
    await page.goto('http://127.0.0.1:5173/?renderReview'+query);await page.waitForSelector('.render-review[data-ready="true"]');await page.waitForTimeout(600);
    const image=await page.locator('canvas').evaluate(c=>c.toDataURL().split(',')[1]);await fs.writeFile(new URL(`web-reference-v2${suffix}.png`,output),Buffer.from(image,'base64'));
  };
  await capture('','');
  report.base=await page.evaluate(async()=>{
    const {instance:i,renderer}=window.__renderReview,{Box3,Vector3}=await import('/node_modules/.vite/deps/three.js');
    const shell=i.group.getObjectByName('BuildingShell'),actor=new Box3().setFromObject(i.people[0].root).getSize(new Vector3()),door=new Box3().setFromObject(i.door).getSize(new Vector3());
    return {lightmap:!!shell.material.lightMap,uv1:!!shell.geometry.attributes.uv1,adultHeight:actor.y,doorHeight:door.y,opaque:!shell.material.transparent,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,clipCount:i.people[0].mixer._actions.length};
  });
  assert(report.base.lightmap&&report.base.uv1&&report.base.opaque);assert(report.base.adultHeight/report.base.doorHeight>.75);assert(report.base.clipCount>=1);
  report.animation=await page.evaluate(async()=>{
    const {updateModernBuilding}=await import('/src/modern-assets.ts'),i=window.__renderReview.instance;const seen=new Set();
    for(let step=0;step<2200;step++){updateModernBuilding(i,.05,false);seen.add(i.people[0].root.userData.state);}
    return {states:[...seen],visits:i.simulation.people[0].visits};
  });
  assert.equal(report.animation.states.length,7);assert(report.animation.visits>=1);
  await capture('&view=back','-back');
  for(let n=1;n<=4;n++) {
    const ids=['W','I','S','P','M','T'].map(c=>c+n);await capture('&cards='+ids.join(','),'-cards-'+n);
    report['cards'+n]=await page.evaluate(async(ids)=>{
      const {instance:i,renderer}=window.__renderReview,{loadModernAssets}=await import('/src/modern-assets.ts'),assets=await loadModernAssets();
      const cardNodes=ids.map(id=>{const root=i.components.getObjectByName('Installed_'+id);let meshes=0;root?.traverse(o=>{if(o.isMesh)meshes++;});return {id,meshes};});
      const layout=i.components.getObjectByName('Layout_'+ids[3]);let bakedLayout=false;layout?.traverse(o=>{if(o.isMesh&&o.material.lightMap)bakedLayout=true;});
      return {cardNodes,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,roofVisible:i.group.getObjectByName('Roof').visible,shellVisible:i.group.getObjectByName('BuildingShell').visible,bakedLayout,animatedNodes:i.animations.length,manifestCount:Object.keys(assets.manifest.cards).length};
    },ids);
    assert(report['cards'+n].cardNodes.every(c=>c.meshes>0));assert.equal(report['cards'+n].manifestCount,24);
    assert.equal(report['cards'+n].roofVisible,false);assert.equal(report['cards'+n].shellVisible,n>2);
    if(n<3)assert(report['cards'+n].bakedLayout);
  }
  for(const [width,height] of [[1440,900],[390,844],[844,390]]) {
    await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:/进入采光关/}).click();await page.waitForSelector('.scene-host[data-assets="ready"]');await page.waitForTimeout(900);
    assert.equal(await page.locator('.scene-fallback').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:new URL(`game-v2-${width}.png`,output).pathname.replace(/^\/(\w:)/,'$1')});
    report[`${width}x${height}`]=await page.locator('.scene-host').evaluate(e=>({...e.dataset}));
  }
  assert.deepEqual(errors,[]);await fs.writeFile(new URL('web-audit-v2.json',output),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
