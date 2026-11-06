import assert from 'node:assert/strict';
import {auditSingleFactors,combinedWitnesses} from './single-factor-audit.mjs';
import {readFileSync} from 'node:fs';
import {beginRun,playCard,endTurn,autoTurn,chooseAction,blockReason,remainingPoints,publicCost,visibleEvents,deckList,functionDeck} from '../src/game.ts';
import {pointCards,pointById,factors,change,performance,fromVector,levels,qualified,pointStep,glass,turnRules,functionById} from '../src/model.ts';
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,a+' != '+b);
const pointHand=(g,side,ids)=>{const a=g[side];a.hand=[...ids];a.used=[];a.draw=deckList().filter(id=>!ids.includes(id));return g;};
function giveFunction(g,side,id){const a=g[side];let index=a.functionHand.indexOf(id);if(index<0){index=a.functionDraw.indexOf(id);assert(index>=0);a.functionHand.push(a.functionDraw.splice(index,1)[0]);index=a.functionHand.length-1;}return index;}
const action=(index,factor,direction,mode='self')=>({kind:'point',index,factor,direction,mode});
const fixture=()=>beginRun(2,405,'player','idle');
assert.equal(pointCards.length,40);assert.equal(new Set(pointCards.map(c=>c.id)).size,40);assert.equal(pointCards.reduce((s,c)=>s+c.rank,0),220);assert(pointStep*220>=8);
// Construct an actual integer-card allocation, not merely a continuous budget.
{
 const groups=['S','H','C','D'].flatMap(s=>[[8,9,10].map(n=>s+n),[2,3,4,5,6,7].map(n=>s+n)]);
 let c=fromVector(Array(8).fill(0));const used=groups.flat();assert.equal(new Set(used).size,36);
 groups.forEach((ids,i)=>{for(const id of ids)c=change(c,factors[i],1,pointById[id].rank);close(c[factors[i]],1);});
 assert.equal(used.reduce((s,id)=>s+pointById[id].rank,0),216);
}
for(const l of levels)assert(!qualified(performance(l.initial),l),'no initial free win');
assert.equal(auditSingleFactors().length,24,'no single-factor path can qualify');
assert.equal(combinedWitnesses().length,3,'combined allocation remains reachable');
// Mixed replenishment: finite inventories, no type quota, and a point guarantee.
{
 const pointCounts=new Set();let points=0;
 for(let seed=1;seed<=2000;seed++){
  const g=beginRun(0,seed,'player','idle');
  for(const a of [g.player,g.npc]){
   assert.equal(a.hand.length+a.functionHand.length,4);assert(a.hand.length>=1);
   pointCounts.add(a.hand.length);points+=a.hand.length;
  }
 }
 assert.deepEqual([...pointCounts].sort(),[1,2,3,4]);
 assert(points/4000>3.1&&points/4000<3.4,'draw weighted by individual cards, not equal type odds');
}
function mixedFixture(points,functions,remaining=deckList().filter(id=>!points.includes(id))){
 const g=fixture(),a=g.player;a.hand=[...points];a.draw=[...remaining];a.used=deckList().filter(id=>!points.includes(id)&&!remaining.includes(id));
 a.functionHand=[...functions];a.functionDraw=functionDeck();a.functionUsed=[];
 for(const id of functions){const i=a.functionDraw.indexOf(id);assert(i>=0);a.functionDraw.splice(i,1);}
 return g;
}
{
 let g=mixedFixture([],['F08','F08','F01'],['S10']);g.player.rng=1;
 // Next mixed draw is a function. The guarantee returns that new F03 only.
 const i=g.player.functionDraw.indexOf('F03');g.player.functionDraw.push(g.player.functionDraw.splice(i,1)[0]);
 const old=structuredClone(g);g=endTurn(g);
 assert.deepEqual(g.player.hand,['S10']);assert.deepEqual(g.player.functionHand,old.player.functionHand);
 assert.equal(g.player.spent,0);assert.equal(g.player.used.length,39);assert.equal(g.player.functionUsed.length,0);conservation(g);
}
{
 let g=mixedFixture([],['F08','F08','F01','F03']);g=endTurn(g);
 assert.equal(g.player.hand.length,1);assert.equal(g.player.functionHand.length,3);assert.equal(g.player.spent,0);conservation(g);
}
{
 let g=mixedFixture(['S1','S2','S3'],['F01']);g=playCard(g,'player',{kind:'function',index:0});
 assert.equal(g.player.hand.length,5);assert.equal(g.player.functionHand.length,0);assert.equal(g.player.extraDraw,2);
 const retained=[...g.player.hand];g=endTurn(g);assert.deepEqual(g.player.hand,retained);assert.equal(g.player.functionHand.length,0);conservation(g);
}
{
 let g=mixedFixture(['S1','S2'],['F01','F01','F08']);
 for(let i=0;i<2;i++){
  assert.equal(blockReason(g,'player',{kind:'function',index:0}),null,'search frees its own slot');
  g=playCard(g,'player',{kind:'function',index:0});assert.equal(g.player.hand.length+g.player.functionHand.length,5);
 }
 assert.equal(g.player.extraDraw,2);assert.equal(g.player.draw.length,36);conservation(g);
}
{
 let g=mixedFixture(['S1','S2','S3'],['F01'],['S4']);g=playCard(g,'player',{kind:'function',index:0});
 assert.equal(g.player.hand.length,4);assert.equal(g.player.extraDraw,1);assert.equal(g.player.draw.length,0);conservation(g);
 g=mixedFixture([],['F08','F08','F01','F03'],[]);g=endTurn(g);
 assert.equal(g.player.hand.length,0);assert.equal(g.player.functionHand.length,4);assert.equal(remainingPoints(g.player),0);conservation(g);
}
for(const c of pointCards)for(const factor of factors)for(const direction of [-1,1])for(const side of ['player','npc']){
 let g=pointHand(fixture(),side,[c.id]);const initial=structuredClone(g),before={...g[side].config};
 g=playCard(g,side,action(0,factor,direction));
 assert.notEqual(g,initial);assert.deepEqual(g[side].config,change(before,factor,direction,c.rank));
 assert.equal(g[side].energy,10-c.rank);assert.equal(g[side].spent,c.rank);
 assert.deepEqual(initial[side].config,before);assert.equal(remainingPoints(g[side]),220-c.rank);
 const e=g.events.at(-1);assert.deepEqual(e.beforeValues,performance(before));assert.deepEqual(e.afterValues,performance(g[side].config));
}
for(const factor of factors){
 const c=fromVector(Array(8).fill(.3));
 const twice=change(change(c,factor,1,5),factor,1,5),once=change(c,factor,1,10);
 close(twice[factor],once[factor]);close(performance(twice).D,performance(once).D);close(performance(twice).E,performance(once).E);
 for(const v of [0,1]){let g=pointHand(fixture(),'player',['S10']);g.npc.config[factor]=v;g=playCard(g,'player',action(0,factor,v===0?-1:1,'counter'));assert.equal(g.npc.config[factor],v);assert.equal(g.player.spent,10);}
}
assert.deepEqual(glass(0),{U:.9,SHGC:50,VT:70});assert.deepEqual(glass(1),{U:1.8,SHGC:60,VT:75});close(glass(.5).U,1.35);
{
 let g=pointHand(fixture(),'player',['H6']);const before={...g.npc.config};
 g=playCard(g,'player',action(0,'GLZ',-1,'counter'));assert.notEqual(g.npc.config.GLZ,before.GLZ);assert.equal(g.player.spent,6);assert.notEqual(performance(g.npc.config).E,performance(before).E);
}
// Hidden, persistent protection includes glass and consumes the whole attack.
for(const factor of factors)for(const rank of [1,10]){
 let g=fixture(),i=giveFunction(g,'npc','F08');g=playCard(g,'npc',{kind:'function',index:i,factor});
 assert.equal(g.npc.spent,2);assert.equal(publicCost(g,'npc'),0);assert.equal(visibleEvents(g).length,0);
 g=endTurn(g);g=endTurn(g);assert.equal(g.npc.shield.factor,factor);
 g=pointHand(g,'player',['S'+rank,'H1']);const before=g.npc.config[factor];
 const immutable=structuredClone(g);
 g=playCard(g,'player',action(0,factor,-1,'counter'));
 assert(g.events.at(-1).blocked);assert.equal(g.npc.config[factor],before);assert.equal(g.npc.shield,null);assert.equal(g.player.spent,rank);assert.equal(publicCost(g,'npc'),2);assert.equal(visibleEvents(g).length,2);assert.equal(immutable.events[0].revealed,undefined);
 g.player.energy=10;g=playCard(g,'player',action(0,factor,-1,'counter'));assert(!g.events.at(-1).blocked);
}
{
 let g=fixture();g=playCard(g,'npc',{kind:'function',index:giveFunction(g,'npc','F08'),factor:'WWR'});
 g.npc.energy=10;g=playCard(g,'npc',{kind:'function',index:giveFunction(g,'npc','F08'),factor:'GLZ'});
 assert.equal(g.npc.spent,4);assert.equal(g.npc.hiddenCost,4);assert.equal(g.npc.shield.factor,'GLZ');
 g=pointHand(g,'player',['H1']);g=playCard(g,'player',action(0,'GLZ',1,'counter'));
 assert.equal(publicCost(g,'npc'),2);assert.equal(g.npc.hiddenCost,2);
 g.phase='draw';assert.equal(publicCost(g,'npc'),4);assert.equal(visibleEvents(g).length,3);
}
{
 let g=fixture();const original=[...g.player.hand];g=endTurn(g);assert.deepEqual(g.player.hand,original,'unused cards remain');
 const id=g.player.hand[0],rank=pointById[id].rank;g=playCard(g,'player',action(0,'WWR',1));g=endTurn(g);
 assert(!g.player.hand.includes(id));assert(!g.player.draw.includes(id));assert.equal(remainingPoints(g.player),220-rank);
 const index=giveFunction(g,'player','F02'),swapped=g.player.hand[0],total=remainingPoints(g.player);g=playCard(g,'player',{kind:'function',index,discard:0});
 assert.equal(g.player.draw[0],swapped);assert.equal(remainingPoints(g.player),total);
}
{
 let g=fixture();const cost=g.player.spent;
 g=playCard(g,'player',{kind:'function',index:giveFunction(g,'player','F03')});
 assert.equal(g.player.energy,13);assert.equal(g.player.spent,cost+2);
 const i=giveFunction(g,'player','F03');assert(blockReason(g,'player',{kind:'function',index:i}));
}
{
 let g=fixture();g.player.draw=[];g.player.hand=['S1'];g.player.used=deckList().filter(id=>id!=='S1');
 g=playCard(g,'player',action(0,'R',1));g=endTurn(g);assert.equal(g.player.hand.length,0);assert.equal(g.player.draw.length,0);assert.equal(remainingPoints(g.player),0);assert.equal(g.phase,'battle');
 g.npc.draw=[];g.npc.hand=[];g.npc.used=deckList();g=endTurn(g);assert.equal(g.phase,'draw');assert.match(g.drawReason,/耗尽/);
}
// Final review uses all hidden cost, not the public subtotal or weighted score first.
for(const first of ['player','npc']){
 let g=beginRun(0,405,first,'idle');g.player.config=g.npc.config=fromVector([1,0,0,0,0,0,0,1]);
 g.player.spent=5;g.npc.spent=6;g.npc.hiddenCost=2;assert.equal(publicCost(g,'npc'),4);
 g=endTurn(g);assert.equal(g.phase,'victory');assert.equal(publicCost(g,'npc'),6);
 g=beginRun(0,405,first,'idle');g.player.config=g.npc.config=fromVector([1,0,0,0,0,0,0,1]);g=endTurn(g);assert.equal(g.phase,'draw');
}
// Policies cannot see enemy hidden shields, hand, future draws or hidden spending.
for(const policy of ['random','learner','tactical','opponent'])for(let seed=1;seed<=30;seed++){
 const g=beginRun(1,seed),secret=structuredClone(g);secret.npc.shield={factor:'HR',event:0};secret.npc.spent+=2;secret.npc.hiddenCost+=2;secret.npc.hand.reverse();secret.npc.draw.reverse();
 assert.deepEqual(chooseAction(g,'player',policy),chooseAction(secret,'player',policy),policy+' privacy');
}
const fit=JSON.parse(readFileSync('src/response-fit.json','utf8').replace(/^\uFEFF/,''));assert(fit.validation.D.rmse<.5);assert(fit.validation.E.rmse<.5);
for(let i=0;i<1000;i++){const c=fromVector(factors.map((_,j)=>((i*37+j*61)%997)/996)),v=performance(c);assert(Number.isFinite(v.D)&&v.D>=0&&v.D<=100&&Number.isFinite(v.E)&&v.E>=0);}
const mid=fromVector(Array(8).fill(.5));
for(const f of ['GLZ','EW','R','Gnd','VR'])assert(performance({...mid,[f]:.8}).E>performance({...mid,[f]:.2}).E);
assert(performance({...mid,HR:.8}).E<performance({...mid,HR:.2}).E);
assert(performance({...mid,WWR:.8}).D>performance({...mid,WWR:.2}).D);
assert(performance({...mid,WD:.8}).D<performance({...mid,WD:.2}).D);
function conservation(g){
 for(const side of ['player','npc']){
  const a=g[side];assert.deepEqual([...a.hand,...a.draw,...a.used].sort(),deckList().sort());assert.deepEqual([...a.functionHand,...a.functionDraw,...a.functionUsed].sort(),functionDeck().sort());
  assert(a.energy>=0&&a.energy<=turnRules.maxEnergy);assert(a.hand.length+a.functionHand.length<=turnRules.maxHand);
  const mine=g.events.filter(e=>e.side===side);assert.equal(a.spent,mine.reduce((s,e)=>s+e.cost,0));assert.equal(a.hiddenCost,mine.filter(e=>e.hidden&&!e.revealed).reduce((s,e)=>s+e.cost,0));
  assert.equal(remainingPoints(a)+a.used.reduce((s,id)=>s+pointById[id].rank,0),220);
  for(const e of mine)assert.equal(e.cost,e.kind==='point'?pointById[e.card].rank:functionById[e.card].cost);
 }
}
let games=0,rounds=0;
for(let level=0;level<3;level++)for(const policy of ['random','learner','tactical'])for(let seed=1;seed<=100;seed++){
 let g=beginRun(level,seed);while(g.phase==='battle'&&g.round<=80){g=autoTurn(g,'player',policy);conservation(g);g=endTurn(g);conservation(g);rounds++;}assert.notEqual(g.phase,'battle');games++;
}
console.log('PASS: 1280 point transforms; all-factor hidden shields; glass mapping; finite inventories; cumulative/final hidden cost; policies privacy; curves; '+games+' games / '+rounds+' rounds.');
