import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPedestrians,stepPedestrians,promenadeLength,promenadePoint} from '../src/pedestrians.ts';

const seen=new Set(), dwell=[], visits=[];let closestPeople=Infinity,closestDoor=Infinity;
const segmentDistance=(x,z,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-ax-t*dx,z-az-t*dz);};
for(const phase of [0,.12,.47,.73]) {
  let seed=405;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const sim=createPedestrians(2,phase,random);const insideAt=[0,0];
  for(let frame=0;frame<24000;frame++) {
    const before=sim.people.map(p=>({...p}));stepPedestrians(sim,.05);
    for(const [i,p] of sim.people.entries()) {
      seen.add(p.state);
      assert(p.z>=.80 || p.state==='loop'||p.state==='depart','the indoor visitor stays clear of courtyard glazing');
      assert(Math.hypot(p.x-before[i].x,p.z-before[i].z)<.035,'no teleporting across the site');
      if(p.state==='wait_enter'||p.state==='wait_exit'||p.state==='inside')assert(!p.walking,'idle poses must stop the walking clip');
      if(['enter','exit'].includes(p.state))assert(sim.doorAngle<-1.5,'only cross an open door');
      if(p.state==='inside'&&before[i].state!=='inside')insideAt[i]=sim.time;
      if(p.state==='wait_exit'&&before[i].state==='inside'){const seconds=sim.time-insideAt[i];assert(seconds>=6&&seconds<19);dwell.push(seconds);}
      if(p.state==='loop'||p.state==='depart') {
        assert(Math.abs(p.x)>2.34||Math.abs(p.z)>2.40,'walkers stay outside all facade components');
        // Furniture is beyond the promenade. Check actual tree beds, bins and bench rectangles.
        for(const [x,z,hx,hz] of [[-3.35,-1.45,.29,.36],[3.35,-.6,.29,.36],[-3.36,.45,.115,.135],[3.36,.45,.115,.135],[-1.32,-3.14,.52,.17],[1.32,-3.14,.52,.17],[-1.9,3.14,.51,.215],[1.9,3.14,.51,.215]]) {
          assert(Math.hypot(Math.max(0,Math.abs(p.x-x)-hx),Math.max(0,Math.abs(p.z-z)-hz))>.24,'walker intersects landscape furniture');
        }
      }
      if(p.visible) {
        const bx=-.405+.78*Math.cos(sim.doorAngle),bz=1.405-.78*Math.sin(sim.doorAngle);
        const d=segmentDistance(p.x,p.z,-.405,1.405,bx,bz);closestDoor=Math.min(closestDoor,d);
        assert(d>.25,'person intersects moving door leaf');
      }
    }
    if(sim.people.every(p=>p.visible)) {
      const [a,b]=sim.people,d=Math.hypot(a.x-b.x,a.z-b.z);closestPeople=Math.min(closestPeople,d);assert(d>.475,'people overlap');
    }
  }
  visits.push(sim.people.map(p=>p.visits));assert(sim.people.every(p=>p.visits>=7),'both people must repeatedly enter and leave');
}
assert.deepEqual([...seen].sort(),['depart','enter','exit','inside','loop','wait_enter','wait_exit'].sort());
assert(Math.max(...dwell)-Math.min(...dwell)>5,'indoor dwell must vary');
assert(promenadePoint(.5).x<0,'front promenade goes toward the left, reversing v1');
const gameRandom=Math.random;Math.random=()=>{throw Error('cosmetic animation consumed game randomness');};
try{const cosmetic=createPedestrians(2);for(let frame=0;frame<8000;frame++)stepPedestrians(cosmetic,.05);assert(cosmetic.people.every(p=>p.visits>0));}finally{Math.random=gameRandom;}
const report={simulatedSeconds:4800,seen:[...seen],visits,closestPeople,closestDoor,dwellRange:[Math.min(...dwell),Math.max(...dwell)],routeLength:promenadeLength};
await fs.mkdir('validation',{recursive:true});await fs.writeFile('validation/pedestrians-v2.json',JSON.stringify(report,null,2));console.log(report);
