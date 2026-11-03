import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPedestrians,stepPedestrians,promenadeLength,promenadePoint} from '../src/pedestrians.ts';
import {seatingLayout,seatStandZ,seatedPose} from '../src/seating.ts';

const seen=new Set(), dwell=[], visits=[],sits=[],rests=[];let closestPeople=Infinity,closestDoor=Infinity,maxBenchUsers=0;
const segmentDistance=(x,z,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-ax-t*dx,z-az-t*dz);};
for(const phase of [0,.12,.47,.73]) {
  let seed=405;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const sim=createPedestrians(2,phase,random);const insideAt=[0,0],seatedAt=[0,0];
  for(let frame=0;frame<24000;frame++) {
    const before=sim.people.map(p=>({...p}));stepPedestrians(sim,.05);
    for(const [i,p] of sim.people.entries()) {
      seen.add(p.state);
      if(['enter','exit','inside','wait_enter','wait_exit'].includes(p.state))assert(p.z>=.80,'the indoor visitor stays clear of courtyard glazing');
      assert(Math.hypot(p.x-before[i].x,p.z-before[i].z)<.035,'no teleporting across the site');
      if(['wait_enter','wait_exit','inside','bench_turn','sit_down','seated','stand_up'].includes(p.state))assert(!p.walking,'idle poses must stop the walking clip');
      if(['enter','exit'].includes(p.state))assert(sim.doorAngle<-1.5,'only cross an open door');
      if(p.state==='inside'&&before[i].state!=='inside')insideAt[i]=sim.time;
      if(p.state==='wait_exit'&&before[i].state==='inside'){const seconds=sim.time-insideAt[i];assert(seconds>=6&&seconds<19);dwell.push(seconds);}
      if(p.bench>=0)assert.equal(sim.benchOwner,i,'the whole approach/sit/leave sequence owns the reservation');
      if(p.state==='seated'&&before[i].state!=='seated')seatedAt[i]=sim.time;
      if(p.state==='stand_up'&&before[i].state==='seated'){const seconds=sim.time-seatedAt[i];assert(seconds>=7&&seconds<26);rests.push(seconds);}
      if(p.seatBlend>0) {
        const pose=seatedPose(p.seatBlend),rig=seatingLayout.person;
        const kneeY=rig.standingHipHeight+pose.rootY-rig.thighLength*Math.cos(pose.hip);
        const kneeZ=p.z-rig.thighLength*Math.sin(pose.hip);
        const ankleY=kneeY-rig.shinLength*Math.cos(pose.hip+pose.knee);
        const ankleZ=kneeZ-rig.shinLength*Math.sin(pose.hip+pose.knee);
        assert(Math.abs(ankleY-rig.ankleHeight)<1e-8&&Math.abs(ankleZ-seatStandZ)<1e-8,'feet stay planted throughout sitting and standing');
        assert(Math.abs(p.x-seatingLayout.benches.x[p.bench])<1e-8,'pelvis aligns with the bench centre');
      }
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
    const users=sim.people.filter(p=>p.bench>=0).length;maxBenchUsers=Math.max(maxBenchUsers,users);assert(users<=1,'only one person can reserve/use a bench in this building');
    const priorOwner=before.findIndex(p=>p.bench>=0);
    if(priorOwner>=0&&sim.people[priorOwner].bench>=0)for(let i=0;i<before.length;i++)if(before[i].bench<0)assert(sim.people[i].bench<0,'the other person cannot start sitting while the seat is occupied');
    if(sim.people.every(p=>p.visible)) {
      const [a,b]=sim.people,d=Math.hypot(a.x-b.x,a.z-b.z);closestPeople=Math.min(closestPeople,d);assert(d>.475,'people overlap');
    }
  }
  visits.push(sim.people.map(p=>p.visits));assert(sim.people.every(p=>p.visits>=7),'both people must repeatedly enter and leave');
  sits.push(sim.people.map(p=>p.sits));assert(sim.people.every(p=>p.sits>=3),'both people can randomly use the benches without starvation');
}
assert.deepEqual([...seen].sort(),['depart','enter','exit','inside','loop','wait_enter','wait_exit','bench_approach','bench_turn','bench_backstep','sit_down','seated','stand_up','bench_leave','bench_merge'].sort());
assert(Math.max(...dwell)-Math.min(...dwell)>5,'indoor dwell must vary');
assert(Math.max(...rests)-Math.min(...rests)>8,'bench rest duration must vary');
assert(promenadePoint(.5).x<0,'front promenade goes toward the left, reversing v1');
const gameRandom=Math.random;Math.random=()=>{throw Error('cosmetic animation consumed game randomness');};
try{const cosmetic=createPedestrians(2);for(let frame=0;frame<8000;frame++)stepPedestrians(cosmetic,.05);assert(cosmetic.people.every(p=>p.visits>0));}finally{Math.random=gameRandom;}
const report={simulatedSeconds:4800,seen:[...seen],visits,sits,maxBenchUsers,closestPeople,closestDoor,dwellRange:[Math.min(...dwell),Math.max(...dwell)],benchRestRange:[Math.min(...rests),Math.max(...rests)],routeLength:promenadeLength};
await fs.mkdir('validation',{recursive:true});await fs.writeFile('validation/pedestrians-v2.json',JSON.stringify(report,null,2));console.log(report);
