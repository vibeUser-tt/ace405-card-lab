import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1240,height:1200}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+m.location().url);});
 await page.route(/\/src\/RenderReview\.tsx(?:\?.*)?$/,async route=>{
   const response=await route.fetch();let body=await response.text();
   body=body.replace('renderer.render(scene, camera);','window.__review={scene,camera,instance,renderer};renderer.render(scene,camera);');
   body=body.replace('renderer.render(scene,camera);','window.__review={scene,camera,instance,renderer};renderer.render(scene,camera);');
   body=body.replace('createModernBuilding(assets, 1)','createModernBuilding(assets, 2)').replace('createModernBuilding(assets,1)','createModernBuilding(assets,2)');
   await route.fulfill({response,body});
 });
 await page.goto('http://127.0.0.1:5173/?renderReview');await page.waitForFunction(()=>window.__review?.instance);await page.waitForSelector('.render-review[data-ready="true"]');
 const report=await page.evaluate(async()=>{
   const T=await import('/node_modules/.vite/deps/three.js');
   const {updateModernBuilding,installModernCards,loadModernAssets}=await import('/src/modern-assets.ts');
   const {createPedestrians}=await import('/src/pedestrians.ts');
   const {seatingLayout,seatStandZ}=await import('/src/seating.ts');
   const {instance:i,renderer,scene,camera}=window.__review;
   i.simulation=createPedestrians(2,0,()=>0);
   const seen=new Set(),benchIds=new Set(),result={frames:0,triangleChecks:0,minimumFootY:Infinity,maximumFootDrift:0,maximumSeatGap:0,collisions:[],states:[],benchIds:[]};
   const localMatrix=o=>new T.Matrix4().copy(i.group.matrixWorld).invert().multiply(o.matrixWorld);
   function triangles(mesh){
     const g=mesh.geometry,p=g.attributes.position,idx=g.index,m=localMatrix(mesh),out=[];
     for(let v=0;v<(idx?idx.count:p.count);v+=3){
       const pts=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(v+j):v+j).applyMatrix4(m));
       const tri=new T.Triangle(...pts),box=new T.Box3().setFromPoints(pts),plane=new T.Plane().setFromCoplanarPoints(...pts);
       out.push({tri,box,plane,name:mesh.name});
     }return out;
   }
   i.group.updateMatrixWorld(true);
   // Use the exported scenery triangles, including seat, backrest, legs and curb.
   const scenery=triangles(i.group.getObjectByName('Site')).filter(t=>t.box.max.y>.004&&t.box.min.z<-2.30);
   const ray=new T.Ray(),hit=new T.Vector3(),bary=new T.Vector3(),eps=.0001;
   function edgeCross(a,b){
     const points=[a.tri.a,a.tri.b,a.tri.c];
     for(let n=0;n<3;n++){
       const start=points[n],end=points[(n+1)%3],ds=b.plane.distanceToPoint(start),de=b.plane.distanceToPoint(end);
       if(!((ds>eps&&de<-eps)||(ds<-eps&&de>eps)))continue;
       ray.origin.copy(start);ray.direction.subVectors(end,start).normalize();
       if(ray.intersectTriangle(b.tri.a,b.tri.b,b.tri.c,false,hit)&&hit.distanceTo(start)<start.distanceTo(end)-eps){
         b.tri.getBarycoord(hit,bary);if(Math.min(bary.x,bary.y,bary.z)>1e-5)return true;
       }
     }return false;
   }
   let swapped=false,seatSnapshot;
   for(let frame=0;frame<4600;frame++){
     updateModernBuilding(i,.025,false);i.group.updateMatrixWorld(true);
     for(const p of i.simulation.people)seen.add(p.state);
     if(!i.simulation.people.some(p=>p.bench>=0))continue;
     const count=i.simulation.people.filter(p=>p.bench>=0).length;
     if(count!==1)throw Error('More than one person owns a bench');
     const owner=i.simulation.benchOwner,p=i.simulation.people[owner];benchIds.add(p.bench);
     if(!swapped&&p.state==='seated'){
       const original=i.people[owner].root;installModernCards(i,await loadModernAssets(),['W2','I2','S2','P2','M2','T2']);
       if(i.people[owner].root!==original||i.simulation.benchOwner!==owner)throw Error('Installation interrupted a seated actor');
       i.group.rotation.y=.7;swapped=true;
     }
     if(frame%2)continue;result.frames++;
     i.group.updateMatrixWorld(true);
     for(let personIndex=0;personIndex<i.people.length;personIndex++){
       const actor=i.people[personIndex],state=i.simulation.people[personIndex];
       if(!state.visible||state.z>-2.2)continue;
       const inverse=new T.Matrix4().copy(i.group.matrixWorld).invert();
       for(const side of ['L','R']){
         const shoe=actor.root.getObjectByName(`Ankle_${side}_Mesh`),verts=triangles(shoe).flatMap(t=>[t.tri.a,t.tri.b,t.tri.c]);
         const floor=Math.min(...verts.map(v=>v.y));result.minimumFootY=Math.min(result.minimumFootY,floor);
         if(floor<-.0002)throw Error(`Foot penetrates paving at ${state.state}: ${floor}`);
         if(state.seatBlend>0){
           const ankle=actor.root.getObjectByName(`Ankle_${side}`).getWorldPosition(new T.Vector3()).applyMatrix4(inverse);
           result.maximumFootDrift=Math.max(result.maximumFootDrift,Math.abs(floor),Math.abs(ankle.y-seatingLayout.person.ankleHeight),Math.abs(ankle.z-seatStandZ));
         }
       }
       if(state.state==='seated'){
         const body=actor.root.getObjectByName('Torso_Mesh');const ys=triangles(body).flatMap(t=>[t.tri.a.y,t.tri.b.y,t.tri.c.y]);
         result.maximumSeatGap=Math.max(result.maximumSeatGap,Math.abs(Math.min(...ys)-seatingLayout.benches.seatHeight));
         seatSnapshot={owner,bench:state.bench,x:state.x,z:state.z};
       }
       const meshes=[];actor.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
       for(const mesh of meshes){
         const parts=triangles(mesh),bounds=new T.Box3();for(const a of parts)bounds.union(a.box);
         const nearby=scenery.filter(b=>b.box.intersectsBox(bounds));
         for(const a of parts)for(const b of nearby){
           if(!a.box.intersectsBox(b.box))continue;result.triangleChecks++;
           if(edgeCross(a,b)||edgeCross(b,a)){
             result.collisions.push({frame,person:personIndex,state:state.state,blend:state.seatBlend,mesh:mesh.name,actor:a.tri,scenery:b.tri});
             renderer.render(scene,camera);return result;
           }
         }
       }
     }
   }
   result.states=[...seen];result.benchIds=[...benchIds];result.seatedSnapshot=seatSnapshot;result.visits=i.simulation.people.map(p=>p.visits);result.sits=i.simulation.people.map(p=>p.sits);
   result.finalOwner=i.simulation.benchOwner;result.installationPreservedSeat=swapped;
   return result;
 });
 await fs.writeFile('validation/seating-browser.json',JSON.stringify(report,null,2));
 if(report.collisions.length)await page.screenshot({path:'Art/renders/seating-collision.png'});
 assert.deepEqual(report.collisions,[],'exported person triangles must not intersect exported scenery');
 assert(report.maximumFootDrift<.002,'feet must remain on the paving');assert(report.maximumSeatGap<.002,'pelvis must rest on the seat');
 assert(report.installationPreservedSeat);assert.equal(report.benchIds.length,2,'both benches exercised');
 for(const state of ['sit_down','seated','stand_up','bench_merge'])assert(report.states.includes(state));
 await page.unrouteAll();await page.goto('http://127.0.0.1:5173/?renderReview&seated');await page.waitForSelector('.render-review[data-ready="true"]');await page.waitForTimeout(300);
 await fs.writeFile('Art/renders/web-reference-v2-seated.png',Buffer.from(await page.locator('canvas').evaluate(c=>c.toDataURL().split(',')[1]),'base64'));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(report));
}finally{await browser.close();}
