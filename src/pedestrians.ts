/** World-space metres, shared by the animation and its collision audit. Front is +Z. */
import { seatingLayout, seatedPose, seatStandZ, smoothSeat } from './seating.ts';
export type PedestrianState = 'loop' | 'wait_enter' | 'enter' | 'inside' | 'wait_exit' | 'exit' | 'depart' | 'bench_approach' | 'bench_turn' | 'bench_backstep' | 'sit_down' | 'seated' | 'stand_up' | 'bench_leave' | 'bench_merge';
export type Pedestrian = { state: PedestrianState; distance: number; x: number; z: number; heading: number; timer: number; walking: boolean; visible: boolean; visits: number; bench: number; seatBlend: number; sits: number; restDuration: number; benchCooldown: number };
const points = [[0,2.5],[-2.35,2.5],[-2.562,2.412],[-2.65,2.2],[-2.65,-2.2],[-2.562,-2.412],[-2.35,-2.5],[2.35,-2.5],[2.562,-2.412],[2.65,-2.2],[2.65,2.2],[2.562,2.412],[2.35,2.5],[0,2.5]];
const segments = points.slice(1).map((p,i)=>({a:points[i],b:p,length:Math.hypot(p[0]-points[i][0],p[1]-points[i][1])}));
export const promenadeLength = segments.reduce((n,s)=>n+s.length,0);
export const pedestrianRadius = .19;
export function promenadePoint(distance: number) {
  let d = ((distance % promenadeLength) + promenadeLength) % promenadeLength;
  for (const s of segments) {
    if (d <= s.length) { const t=d/s.length; return {x:s.a[0]+(s.b[0]-s.a[0])*t,z:s.a[1]+(s.b[1]-s.a[1])*t,heading:Math.atan2(s.b[0]-s.a[0],s.b[1]-s.a[1])}; }
    d-=s.length;
  }
  return {x:0,z:2.5,heading:-Math.PI/2};
}
const rearStart = segments.slice(0, 6).reduce((n,s)=>n+s.length,0);
export const benchStops = seatingLayout.benches.x.map((x,index)=>({index,x,distance:rearStart+x+2.35}));
export type PedestrianSimulation = { people: Pedestrian[]; owner: number; benchOwner: number; doorAngle: number; time: number; random: ()=>number };
export function createPedestrians(count=2, phase=0, random?:()=>number): PedestrianSimulation {
  // Cosmetic timing must never consume the game deck's random stream.
  let seed=405+Math.floor(phase*100000);
  const dwellRandom=random||(()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296));
  const people=Array.from({length:count},(_,i)=>{
    const distance=((i/count+phase+.96)%1)*promenadeLength;
    return {state:'loop' as const,distance,...promenadePoint(distance),timer:0,walking:false,visible:true,visits:0,bench:-1,seatBlend:0,sits:0,restDuration:0,benchCooldown:0};
  });
  return {people,owner:-1,benchOwner:-1,doorAngle:0,time:0,random:dwellRandom};
}
export function stepPedestrians(sim: PedestrianSimulation, delta: number) {
  const dt=Math.min(Math.max(delta,0),.06), speed=.46;
  if (!dt) return;
  sim.time+=dt;
  const owner=sim.people[sim.owner];
  const open=!!owner && (['enter','wait_exit','exit'].includes(owner.state) || owner.state==='wait_enter' && owner.timer>=.65);
  const target=open?-Math.PI/2:0;
  sim.doorAngle+=Math.sign(target-sim.doorAngle)*Math.min(Math.abs(target-sim.doorAngle),dt*1.5);
  const fullyOpen=sim.doorAngle<=-Math.PI/2+.015;
  for (const [i,p] of sim.people.entries()) {
    p.walking=false;p.timer+=dt;
    const change=(state:PedestrianState)=>{p.state=state;p.timer=0;p.walking=false;};
    const clear=(x:number,z:number)=>sim.people.every((other,j)=>j===i || !other.visible || Math.hypot(x-other.x,z-other.z)>.48);
    const turn=(heading:number)=>{const angle=Math.atan2(Math.sin(heading-p.heading),Math.cos(heading-p.heading));p.heading+=Math.sign(angle)*Math.min(Math.abs(angle),2.8*dt);return Math.abs(angle)<.02;};
    const move=(x:number,z:number,velocity=speed,backward=false)=>{
      const distance=Math.hypot(x-p.x,z-p.z);
      if(distance<.00001)return true;
      if(!turn(backward?0:Math.atan2(x-p.x,z-p.z)))return false;
      const fraction=Math.min(1,velocity*dt/distance),nx=p.x+(x-p.x)*fraction,nz=p.z+(z-p.z)*fraction;
      if(!clear(nx,nz))return false;
      p.x=nx;p.z=nz;p.walking=true;return fraction===1;
    };
    if (p.state==='loop' || p.state==='depart' || p.state==='bench_merge') {
      let next=p.distance+speed*dt;
      const crossing=next>=promenadeLength;
      const pos=promenadePoint(next);
      // The door visitor has priority across the pavement. Following walkers yield.
      const reserved=sim.owner!==-1 && sim.owner!==i && owner && owner.state!=='inside' && Math.abs(pos.x)<.62 && pos.z>2.2;
      const sitter=sim.people[sim.benchOwner];
      const benchReserved=sim.benchOwner!==i && sitter && sitter.state!=='seated' && Math.abs(pos.x-seatingLayout.benches.x[sitter.bench])<.70 && pos.z<-2.2;
      if (reserved || benchReserved || !clear(pos.x,pos.z)) continue;
      if(p.state==='bench_merge'&&!turn(pos.heading))continue;
      if(p.state==='loop'&&sim.benchOwner===-1&&sim.time>=p.benchCooldown) {
        const bench=benchStops.find(b=>p.distance<b.distance&&next>=b.distance);
        if(bench&&sim.random()<.45) {
          sim.benchOwner=i;p.bench=bench.index;p.distance=bench.distance;p.x=bench.x;p.z=seatingLayout.benches.pathZ;
          change('bench_approach');continue;
        }
      }
      if (crossing && sim.owner===-1) { sim.owner=i;p.distance=0;p.x=0;p.z=2.5;p.heading=Math.PI;change('wait_enter');continue; }
      next%=promenadeLength;p.distance=next;Object.assign(p,pos);p.walking=true;
      if(p.state==='depart' && p.distance>.68) {sim.owner=-1;change('loop');}
      if(p.state==='bench_merge'&&p.distance>benchStops[p.bench].distance+.75) {sim.benchOwner=-1;p.bench=-1;p.benchCooldown=sim.time+35+sim.random()*35;change('loop');}
    } else if (p.state==='wait_enter') {
      if (fullyOpen) change('enter');
    } else if (p.state==='enter') {
      // The foyer ends before P2's inner courtyard glazing at Z=0.50.
      p.z=Math.max(.80,p.z-speed*dt);p.x=0;p.heading=Math.PI;p.walking=true;
      p.visible=p.z>.84;
      if(p.z<=.80) {p.visits++;change('inside');p.timer=-(6+sim.random()*10);p.visible=false;}
    } else if (p.state==='inside') {
      // One doorway reservation spans a visit; indoor dwell varies independently.
      if(p.timer>=0 && sim.people.every((q,j)=>j===i||!q.visible||Math.abs(q.x)>.85||q.z<2.2))change('wait_exit');
    } else if (p.state==='wait_exit') {
      if(fullyOpen) {p.heading=0;change('exit');}
    } else if (p.state==='exit') {
      const z=Math.min(2.5,p.z+speed*dt);
      if(!clear(0,z))continue;
      p.z=z;p.x=0;p.heading=0;p.visible=z>.84;p.walking=true;
      if(z>=2.5) {p.distance=0;change('depart');}
    } else if(p.state==='bench_approach') {
      if(move(seatingLayout.benches.x[p.bench],seatingLayout.benches.turnZ))change('bench_turn');
    } else if(p.state==='bench_turn') {
      if(turn(0))change('bench_backstep');
    } else if(p.state==='bench_backstep') {
      if(move(seatingLayout.benches.x[p.bench],seatStandZ,.22,true))change('sit_down');
    } else if(p.state==='sit_down'||p.state==='stand_up') {
      const sitting=p.state==='sit_down',progress=smoothSeat(p.timer/(sitting?1.8:1.6));
      p.seatBlend=sitting?progress:1-progress;p.z=seatedPose(p.seatBlend).rootZ;
      if(progress===1) {
        if(sitting){p.sits++;p.restDuration=7+sim.random()*13;change('seated');}
        else change('bench_leave');
      }
    } else if(p.state==='seated') {
      const aisleClear=sim.people.every((q,j)=>j===i||!q.visible||Math.abs(q.x-p.x)>.95||q.z>-2.15);
      if(p.timer>=p.restDuration&&aisleClear)change('stand_up');
    } else if(p.state==='bench_leave') {
      if(move(seatingLayout.benches.x[p.bench],seatingLayout.benches.pathZ,.28))change('bench_merge');
    }
  }
}
