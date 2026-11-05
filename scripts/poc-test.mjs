import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginRun,playCard,blockReason,autoTurn,endTurn,deckList,chooseAction,legalActions,bidScore,opponentTuning} from '../src/game.ts';
import {factors,designs,designById,cardById,allConfigs,performance,change,cost,levels,feasible,qualified,fromVector,keyOf,label,score,turnRules,canCounterDesign,counterDesigns,counterFactors} from '../src/model.ts';

const numericFactors=['WWR','WD','EW','R','Gnd','HR'];
const close=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);
const base=fromVector([0,0,0,0,0,0,0,0]);
const middle=fromVector([.5,.5,0,.5,.5,.5,0,.5]);
assert.equal(levels.length,3);assert.equal(designs.length,16);assert.equal(cardById.F05,undefined);
assert.equal(canCounterDesign(undefined),false);
assert.deepEqual(designs.filter(c=>!canCounterDesign(c)).map(c=>c.id),['G+','G-']);
assert.equal(counterDesigns.length,14);assert.equal(counterFactors.length,7);assert(!counterFactors.includes('GLZ'));
assert.equal(allConfigs.length,2916);
assert.equal(new Set(allConfigs.map(keyOf)).size,allConfigs.length);
for(const factor of factors){
 const values=[...new Set(allConfigs.map(c=>c[factor]))].sort();
 assert.deepEqual(values,numericFactors.includes(factor)?[0,.5,1]:[0,1],`${factor} playable steps`);
 if(numericFactors.includes(factor)){
  assert.notEqual(label(factor,.5),label(factor,0),`${factor} midpoint label`);
  assert.notEqual(label(factor,.5),label(factor,1),`${factor} midpoint label`);
 }
}
// Geometry interpolates endpoint meshes; numerical steps do not require duplicate GLB meshes.
const bytes=readFileSync(new URL('../public/assets/design-lab/building.glb',import.meta.url));
assert.equal(bytes.toString('ascii',0,4),'glTF');
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const variants=gltf.nodes.filter(n=>n.extras?.factor);
for(const factor of factors){
 const options=variants.filter(n=>n.extras.factor===factor).map(n=>n.extras.option);
 assert(options.includes(0)&&options.includes(1),`${factor} endpoint geometry`);
}
for(let i=0;i<levels.length;i++){
 assert(feasible[i].length>10,`${levels[i].id} has viable designs`);
 assert(!qualified(performance(levels[i].initial),levels[i]),`${levels[i].id} requires an adjustment`);
}
// Match simulation records by their names, independently of runtime row indexing.
const source=JSON.parse(readFileSync(new URL('../src/gothenburg.json',import.meta.url),'utf8'));
assert.equal(source.rows.length,256);
const corners=source.rows.map(row=>({row,config:Object.fromEntries(factors.map(f=>[f,Number(row.key.match(new RegExp(`(?:^|_)${f}([01])(?:_|$)`))[1])]))}));
for(const {row,config} of corners){
 const actual=performance(config);
 close(actual.D,row.D,`${row.key} daylight`);close(actual.E,row.E,`${row.key} energy`);
 assert.equal(actual.C,cost(config));
}
// Six simultaneous midpoint parameters average all 64 compatible corners.
for(const GLZ of [0,1])for(const VR of [0,1]){
 const matching=corners.filter(c=>c.config.GLZ===GLZ&&c.config.VR===VR);
 const actual=performance({...middle,GLZ,VR});
 for(const metric of ['D','E'])close(actual[metric],matching.reduce((sum,c)=>sum+c.row[metric],0)/matching.length,`multi-axis midpoint ${metric}`);
}
// Partial imported states interpolate too, without adding extra playable steps.
for(const factor of numericFactors){
 const low=performance({...middle,[factor]:0}),high=performance({...middle,[factor]:1});
 for(const fraction of [.25,.75]){
  const actual=performance({...middle,[factor]:fraction});
  for(const metric of ['D','E'])close(actual[metric],low[metric]*(1-fraction)+high[metric]*fraction,`${factor} partial ${metric}`);
 }
}
assert.equal(cost(change({...base,HR:1/3},designById['H-'])),cost(base),'partial boundary step uses final configuration cost');
assert.deepEqual(change(change(base,designById['W+']),designById['W-']),base);
assert.notEqual(cost({...base,WWR:1,GLZ:0})-cost({...base,WWR:1,GLZ:1}),cost(base)-cost({...base,GLZ:1}),'glazing cost depends on area');
for(const factor of numericFactors){
 const cards=designs.filter(c=>c.factor===factor);
 assert.equal(cards.length,2);assert.deepEqual(cards.map(c=>c.step).sort(),[-.5,.5]);
 for(const card of cards)assert.equal(change(middle,card)[factor],card.step>0?1:0);
}
for(const config of allConfigs)for(const card of designs){
 const next=change(config,card);
 for(const f of factors)assert((numericFactors.includes(f)?[0,.5,1]:[0,1]).includes(next[f]),`${card.id} preserves the playable grid`);
 for(const value of Object.values(performance(next)))assert(Number.isFinite(value));
}
function fixture(id,config=base){
 const g=beginRun(0,405);g.player.hand=[id,'W+','F02','F04','F08'];g.player.config={...config};return g;
}
// Replaying event values catches stale opponent summaries and missing cost updates.
function assertEvents(before,after){
 const configs={player:{...before.player.config},npc:{...before.npc.config}};
 for(const event of after.events.slice(before.events.length)){
  if(event.mode==='counter'||event.card==='F06'){
   assert.notEqual(event.factor,'GLZ','counterplay cannot change a complete glass specification');
   if(event.parameterCard)assert(canCounterDesign(designById[event.parameterCard]),'counter event uses an incremental design');
  }
  if(!event.factor)continue;
  assert.equal(event.before,configs[event.target][event.factor]);
  assert.deepEqual(event.beforeValues,performance(configs[event.target]));
  configs[event.target][event.factor]=event.after;
  assert.deepEqual(event.afterValues,performance(configs[event.target]));
  if(event.blocked)assert.equal(event.before,event.after);
 }
 for(const side of ['player','npc'])assert.deepEqual(configs[side],after[side].config);
}
let g=fixture('H-'),n=playCard(g,'player',{index:0,mode:'self'});
assert.notEqual(n,g);assert.equal(n.player.energy,turnRules.energy-cardById['H-'].ap);
assert.equal(cost(n.player.config),cost(g.player.config));assert.equal(n.player.hand.length,4);
assert.deepEqual(g.player.config,base,'prior snapshot is immutable');assertEvents(g,n);
const overbudget=allConfigs.find(c=>cost(c)>levels[0].limits.C&&cost(change(c,designById['E+']))>cost(c));
assert(overbudget,'there is an over-budget design that can still be upgraded');
g=fixture('E+',overbudget);assert(cost(g.player.config)>levels[0].limits.C);
assert.equal(blockReason(g,'player',{index:0,mode:'self'}),null);
n=playCard(g,'player',{index:0,mode:'self'});assert(cost(n.player.config)>cost(g.player.config));
assert(!qualified(performance(n.player.config),levels[0]));assertEvents(g,n);
// Complete specifications are self-only on both sides; rejected targeting spends nothing.
for(const side of ['player','npc'])for(const id of ['G+','G-']){
 const other=side==='player'?'npc':'player',card=designById[id];
 g=beginRun(0,405);g[side].hand=[id];g[side].config={...middle,GLZ:1-card.set};g[side].amplified=true;
 const rejected={index:0,mode:'counter'},own={index:0,mode:'self'},snapshot=structuredClone(g);
 assert(blockReason(g,side,rejected),`${side} cannot send ${id} to the opponent`);
 assert.equal(playCard(g,side,rejected),g,'rejected glass counter preserves the state object');assert.deepEqual(g,snapshot);
 assert.deepEqual(legalActions(g,side),[own]);assert.equal(blockReason(g,side,own),null);
 n=playCard(g,side,own);assert.equal(n[side].config.GLZ,card.set);
 assert.equal(n[side].energy,turnRules.energy-card.ap);assert.equal(n[side].amplified,true,'own glass does not consume attack amplification');
 assert.deepEqual(n[other],g[other],'self-only glass never touches the other building');assertEvents(g,n);
 for(const policy of ['random','learner','greedy','planner','tactical','opponent']){
  const action=chooseAction(g,side,policy);assert(!action||action.mode==='self',`${policy} never plans a glass counter`);
 }
}
for(const side of ['player','npc']){
 g=beginRun(0,405);g[side].hand=['F07','G+','G-'];
 assert(blockReason(g,side,{index:0,mode:'function'}),'glass alone cannot provide a follow-up to amplification');
 assert(!legalActions(g,side).some(a=>a.index===0));
 g[side].hand.push('F06');assert.equal(blockReason(g,side,{index:0,mode:'function'}),null,'targeted interference remains an eligible amplification follow-up');
 g=beginRun(0,405);g[side].hand=['F08'];
 const protectGlass={index:0,mode:'function',factor:'GLZ'};
 assert(blockReason(g,side,protectGlass),'glass is already immune to counterplay');assert.equal(playCard(g,side,protectGlass),g);
 assert.deepEqual(legalActions(g,side).map(a=>a.factor).sort(),[...counterFactors].sort());
}
g=fixture('W-');g.npc.config={...base,WWR:1};n=playCard(g,'player',{index:0,mode:'counter'});
assert.equal(n.npc.config.WWR,.5);assert.equal(n.player.energy,2);assertEvents(g,n);
g=fixture('H-');g.npc.config={...base,HR:1/3};n=playCard(g,'player',{index:0,mode:'counter'});
assert.equal(n.npc.config.HR,0);assert.equal(performance(n.npc.config).C,cost(base));assertEvents(g,n);
g=fixture('W-');g.npc.config={...base,WWR:1};g.npc.shield='WWR';n=playCard(g,'player',{index:0,mode:'counter'});
assert.equal(n.npc.config.WWR,1);assert.equal(n.npc.shield,null);assert(n.events.at(-1).blocked);assertEvents(g,n);
g=fixture('F07');g.player.hand=['F07','H+'];g.npc.config={...base,HR:0};
n=playCard(g,'player',{index:0,mode:'function'});n=playCard(n,'player',{index:0,mode:'counter'});
assert.equal(n.npc.config.HR,1);assert.equal(n.player.amplified,false);assertEvents(g,n);
// Interference changes the actual building, with no separate score penalty.
g=fixture('F06');assert(blockReason(g,'player',{index:0,mode:'function'}),'interference requires a chosen metric');
assert.deepEqual(legalActions(g,'player').filter(a=>a.index===0).map(a=>a.metric).sort(),['D','E']);
for(const metric of ['D','E']){
 g=fixture('F06');g.npc.config={...middle};
 const before=performance(g.npc.config),action={index:0,mode:'function',metric};
 n=playCard(g,'player',action);const after=performance(n.npc.config),event=n.events.at(-1);
 assert(metric==='D'?after.D<before.D:after.E>before.E,`${metric} interference worsens the target metric`);
 const candidates=counterDesigns.map(c=>performance(change(g.npc.config,c))[metric]);
 close(after[metric],metric==='D'?Math.min(...candidates):Math.max(...candidates),`${metric} strongest one-step interference`);
 assert.equal(factors.filter(f=>g.npc.config[f]!==n.npc.config[f]).length,1);
 assert.equal(n.player.energy,turnRules.energy-cardById.F06.ap);assert(!('penalty' in n.npc));
 assert.equal(bidScore(n,'npc'),score(after,levels[n.level]));assertEvents(g,n);
 const protectedGame=structuredClone(g);protectedGame.npc.shield=event.factor;
 const protectedResult=playCard(protectedGame,'player',action);
 assert.deepEqual(protectedResult.npc.config,g.npc.config,`${metric} interference respects factor protection`);
 assert.equal(protectedResult.npc.shield,null);assert(protectedResult.events.at(-1).blocked);assertEvents(protectedGame,protectedResult);
}
// A metric already at its worst attainable value still permits spending the card.
for(const metric of ['D','E']){
 const worst=allConfigs.reduce((a,b)=>(metric==='D'?performance(b).D<performance(a).D:performance(b).E>performance(a).E)?b:a);
 g=fixture('F06');g.npc.config={...worst};g.npc.shield='WWR';g.player.amplified=true;
 const before=performance(g.npc.config),action={index:0,mode:'function',metric};
 assert.equal(blockReason(g,'player',action),null,`${metric} boundary interference remains playable`);
 n=playCard(g,'player',action);
 assert.notEqual(n,g);assert.deepEqual(n.npc.config,g.npc.config);
 assert.equal(n.player.energy,turnRules.energy-cardById.F06.ap);
 assert.equal(n.player.amplified,false);assert.equal(n.npc.shield,'WWR','no parameter attack leaves unrelated protection intact');
 assert(n.player.discard.includes('F06'));assert.equal(n.player.hand.length,g.player.hand.length-1);
 assert.deepEqual(n.events.at(-1).beforeValues,before);assert.deepEqual(n.events.at(-1).afterValues,before);
 assert.equal(n.events.at(-1).factor,undefined);assertEvents(g,n);
}
// F06 is a parameter attack too: F07 must work without an additional design card.
for(const metric of ['D','E']){
 g=fixture('F07');g.player.hand=['F07','F06'];g.npc.config=fromVector([1,0,0,0,0,0,1,1]);
 assert.equal(blockReason(g,'player',{index:0,mode:'function'}),null,'F07 can amplify F06');
 const amplified=playCard(g,'player',{index:0,mode:'function'});
 assert.equal(amplified.player.amplified,true);
 const action={index:0,mode:'function',metric};n=playCard(amplified,'player',action);
 const candidates=counterDesigns.map(c=>performance(change(g.npc.config,c,2))[metric]);
 const single=counterDesigns.map(c=>performance(change(g.npc.config,c))[metric]);
 const expectedMetric=metric==='D'?Math.min(...candidates):Math.max(...candidates);
 const singleMetric=metric==='D'?Math.min(...single):Math.max(...single);
 assert(Math.abs(expectedMetric-singleMetric)>1e-8,'fixture distinguishes single and doubled interference');
 close(performance(n.npc.config)[metric],expectedMetric,`${metric} amplified interference`);
 assert.equal(n.player.amplified,false);
 assert.equal(n.player.energy,1);assert.deepEqual(n.player.hand,[]);assertEvents(g,n);
 const defended=structuredClone(amplified);defended.npc.shield=n.events.at(-1).factor;
 const blocked=playCard(defended,'player',action);
 assert.deepEqual(blocked.npc.config,g.npc.config);assert(blocked.events.at(-1).blocked);
 assert.equal(blocked.player.amplified,false);assert.equal(blocked.npc.shield,null);assertEvents(defended,blocked);
}
// F06 must obey the same target boundary for every playable state, including
// amplified attacks and cases where replacing glass would do more damage.
for(const side of ['player','npc']){
 const other=side==='player'?'npc':'player',template=beginRun(0,405);template[side].hand=['F06'];
 for(const config of allConfigs)for(const metric of ['D','E'])for(const repeat of [1,2]){
  template[other].config={...config};template[side].amplified=repeat===2;
  const result=playCard(template,side,{index:0,mode:'function',metric});
  assert.notEqual(result,template);assert.equal(result[other].config.GLZ,config.GLZ,`${side} F06 preserves GLZ`);
  assert.notEqual(result.events.at(-1).factor,'GLZ');
  const before=performance(config)[metric];
  const candidates=[before,...counterDesigns.map(c=>performance(change(config,c,repeat))[metric])];
  close(performance(result[other].config)[metric],metric==='D'?Math.min(...candidates):Math.max(...candidates),`${side} F06 selects only eligible ${metric} adjustments`);
 }
}
g=fixture('F04');g.player.hand=['F04','W+','H+'];n=playCard(g,'player',{index:0,mode:'function',retain:[1,2]});
assert.deepEqual(n.player.retained,[0,1]);n=playCard(n,'player',{index:0,mode:'self'});assert.deepEqual(n.player.retained,[0]);
g=fixture('F02');g.player.hand=['W+','F02','H+'];n=playCard(g,'player',{index:1,mode:'function',discard:0});
assert(n.player.discard.includes('F02')&&n.player.discard.includes('W+'));assert(n.player.hand.includes('H+'));

// Stamina, not a category allowance, governs repeated design actions.
assert.equal(turnRules.energy,4);assert.equal(cardById.F06.ap,2);
for(const card of designs)assert.equal(card.ap,2);
for(const modes of [['self','self'],['counter','counter'],['self','counter']]){
 g=fixture('W+');g.player.hand=['W+','W+','H+'];g.npc.config={...base};
 const start=g;
 for(const mode of modes){
  assert.equal(blockReason(g,'player',{index:0,mode}),null,`${modes.join('/')} permits the next card`);
  g=playCard(g,'player',{index:0,mode});
 }
 assert.equal(g.player.energy,0);assert.equal(g.player.hand.length,1);
 assert.equal(g.player.config.WWR,modes.filter(mode=>mode==='self').length*.5);
 assert.equal(g.npc.config.WWR,modes.filter(mode=>mode==='counter').length*.5);
 for(const mode of ['self','counter']){
  assert.match(blockReason(g,'player',{index:0,mode}),/体力不足/);
  assert.equal(playCard(g,'player',{index:0,mode}),g,'unaffordable card must not mutate state');
 }
 assertEvents(start,g);
 for(const field of ['built','attacked','functions'])assert(!Object.hasOwn(g.player,field),`${field} obsolete category state removed`);
}
// Targeted interference pays the same 2 stamina, including after a design counter.
g=fixture('W-');g.player.hand=['W-','F06'];g.npc.config={...middle,WWR:1};
n=playCard(g,'player',{index:0,mode:'counter'});
assert.equal(blockReason(n,'player',{index:0,mode:'function',metric:'E'}),null);
n=playCard(n,'player',{index:0,mode:'function',metric:'E'});
assert.equal(n.player.energy,0);assert.equal(n.events.slice(g.events.length).length,2);assertEvents(g,n);

// Three different function cards can be used in one turn, retaining their own effects.
g=fixture('F03');g.player.hand=['F03','F08','F04','W+'];
n=playCard(g,'player',{index:0,mode:'function'});
assert.equal(n.player.energy,5);
n=playCard(n,'player',{index:0,mode:'function',factor:'WWR'});
assert.equal(blockReason(n,'player',{index:0,mode:'function',retain:[1]}),null,'third function is playable');
n=playCard(n,'player',{index:0,mode:'function',retain:[1]});
assert.equal(n.events.slice(g.events.length).length,3);assert.equal(n.player.shield,'WWR');
assert.deepEqual(n.player.retained,[0]);assert.equal(n.player.energy,4);

// Recycled zero-cost filtering cannot evade the total extra-draw cap.
g=fixture('F02');g.player.hand=['F02','F02','W+','H+','F04'];g.player.draw=[];g.player.discard=[];
const filterStart=g;
for(let i=0;i<2;i++){
 const action={index:g.player.hand.indexOf('F02'),mode:'function',discard:g.player.hand.findIndex(id=>id!=='F02')};
 assert.equal(blockReason(g,'player',action),null);g=playCard(g,'player',action);
}
assert.equal(g.player.extraDraw,turnRules.extraDraw);assert.equal(g.player.energy,turnRules.energy);
const blockedFilter={index:g.player.hand.indexOf('F02'),mode:'function',discard:g.player.hand.findIndex(id=>id!=='F02')};
assert(blockedFilter.index>=0,'a used filter was drawn back into the hand');
assert.match(blockReason(g,'player',blockedFilter),/抽牌.*上限/);
assert.equal(playCard(g,'player',blockedFilter),g);
assert.equal(g.events.length-filterStart.events.length,2);

// A second recovery cannot create extra stamina, even after spending the first.
g=fixture('F03');g.player.hand=['F03','W+','F03'];
n=playCard(g,'player',{index:0,mode:'function'});n=playCard(n,'player',{index:0,mode:'self'});
assert.equal(n.player.energy,3);assert.equal(n.player.extraEnergy,turnRules.extraEnergy);
assert.match(blockReason(n,'player',{index:0,mode:'function'}),/体力增补.*上限/);
assert.equal(playCard(n,'player',{index:0,mode:'function'}),n);

// Amplification needs enough energy for its following attack, but is legal after an earlier attack.
g=fixture('F07');g.player.hand=['F07','H-'];g.player.energy=2;
assert(blockReason(g,'player',{index:0,mode:'function'}));
g.player.energy=3;assert.equal(blockReason(g,'player',{index:0,mode:'function'}),null);
g=fixture('W-');g.player.energy=5;g.player.hand=['W-','F07','H-'];g.npc.config={...base,WWR:1,HR:1};
n=playCard(g,'player',{index:0,mode:'counter'});
assert.equal(blockReason(n,'player',{index:0,mode:'function'}),null);
n=playCard(n,'player',{index:0,mode:'function'});n=playCard(n,'player',{index:0,mode:'counter'});
assert.equal(n.npc.config.WWR,.5);assert.equal(n.npc.config.HR,0);assert.equal(n.player.energy,0);assertEvents(g,n);

// Protection still blocks exactly one attack; another protection replaces its chosen variable.
g=fixture('W-');g.player.hand=['W-','W-'];g.npc.config={...base,WWR:1};g.npc.shield='WWR';
n=playCard(g,'player',{index:0,mode:'counter'});n=playCard(n,'player',{index:0,mode:'counter'});
assert(n.events.at(-2).blocked);assert(!n.events.at(-1).blocked);assert.equal(n.npc.config.WWR,.5);assertEvents(g,n);
g=fixture('F08');g.player.hand=['F08','F08'];
n=playCard(g,'player',{index:0,mode:'function',factor:'WWR'});
n=playCard(n,'player',{index:0,mode:'function',factor:'HR'});
assert.equal(n.player.shield,'HR');assert.equal(n.player.energy,2);

// The AI must reconsider a further improvement after recovery, not remember "built once".
g=fixture('W+',levels[0].initial);g.player.energy=3;g.player.hand=['W+','F03','W+'];
n=playCard(g,'player',{index:0,mode:'self'});
const recoveryAction=chooseAction(n,'player','tactical');
assert(recoveryAction,'AI has a useful recovery continuation');assert.equal(n.player.hand[recoveryAction.index],'F03');
const continued=autoTurn(n,'player','tactical');
assert.equal(continued.player.config.WWR,1);assert.equal(continued.player.energy,0);
assert.equal(continued.events.filter(e=>e.side==='player'&&e.mode==='self').length,2);

// A legal seven-card sequence must not be truncated by the former six-step AI loop.
g=beginRun(0,35);g.player.hand=['F02','F02','F03','F04','F08'];
g.player.draw=['F06','F07','W+','H+'];g.player.discard=[];
n=autoTurn(g,'player','random');
assert.equal(n.events.length-g.events.length,7,'all seven affordable actions finish');
assert.equal(n.events.at(-1).card,'F06','the final amplified interference is executed');
assert.equal(n.player.energy,0);assert.deepEqual(n.player.hand,[]);assert.equal(n.player.extraDraw,turnRules.extraDraw);
assertEvents(g,n);

g=beginRun(0,123);assert.deepEqual(g,beginRun(0,123),'seeded run is reproducible');
const altered=structuredClone(g);altered.player.draw.reverse();altered.player.hand.reverse();
assert.deepEqual(endTurn(g).npc,endTurn(altered).npc,'opponent does not inspect hidden player hand or deck');
for(let seed=1;seed<=100;seed++){
 const a=beginRun(0,seed),b=structuredClone(a);b.player.hand[0]='F01';const after=playCard(b,'player',{index:0,mode:'function'});
 assert.deepEqual(endTurn(a).npc,endTurn(after).npc,'player draws cannot alter committed NPC draws');
}
let blindCounters=0,blindSelf=0;
for(let seed=1;seed<=200;seed++){
 const a=beginRun(0,seed);a.player.hand=['W+','H-','F08'];
 const b=structuredClone(a);b.player.config={...base};b.npc.config={...middle};
 const action=chooseAction(a,'player','random');
 assert.deepEqual(action,chooseAction(b,'player','random'),'blind player must not use an unseen performance oracle');
 if(action?.mode==='counter')blindCounters++;if(action?.mode==='self')blindSelf++;
}
assert(blindCounters>0&&blindSelf>0,'blind player can try both self adjustment and counterplay');
for(let level=0;level<levels.length;level++)for(let seed=1;seed<=100;seed++){
 let run=beginRun(level,seed);
 for(let round=1;round<=2&&run.phase==='battle';round++){
  assert.equal(run.round,round);
  const blind=autoTurn(run,'player','random'),learning=autoTurn(run,'player','learner');
  assert.deepEqual(learning,blind,`learner and blind play identically in introductory round ${round}`);
  run=endTurn(blind);
  assert(!run.events.slice(blind.events.length).some(e=>e.side==='npc'&&(e.mode==='counter'||e.card==='F06')),'introductory opponent allows two rounds without interference');
 }
}
// Attack permission and card choice must use independent randomness. With the
// same first roll, a 12% permission gate always selected the first of <=8 cards.
const originalTuning={...opponentTuning};
try{
 Object.assign(opponentTuning,{guidedChance:0,attackChance:.12,quietRounds:0});
 const attackedIndices=new Set();
 for(let seed=1;seed<=300;seed++){
  const run=beginRun(0,seed);run.npc.hand=['W+','D+','D+','D+','D+'];
  run.player.config=fromVector([1,0,0,0,0,0,1,1]);
  const action=chooseAction(run,'npc','opponent');
  if(action?.mode==='counter')attackedIndices.add(action.index);
 }
 assert(attackedIndices.size>=2,'opponent can select attacks beyond the first hand position');
}finally{Object.assign(opponentTuning,originalTuning);}
const tally=a=>a.reduce((r,id)=>(r[id]=(r[id]||0)+1,r),{});
const expected=tally(deckList()),policies=['random','learner','planner','tactical'];let checked=0;
for(let level=0;level<levels.length;level++)for(let seed=1;seed<=300;seed++){
 let run=beginRun(level,seed);
 while(run.phase==='battle'){
  const played=autoTurn(run,'player',policies[seed%policies.length]);assertEvents(run,played);
  const next=endTurn(played);assertEvents(played,next);
  assert.deepEqual(next.history.at(-1),{round:run.round,player:performance(next.player.config),npc:performance(next.npc.config)},'round history contains current values for both buildings');
  assert.equal(next.history.length,run.history.length+1);
  if(next.phase==='battle'){
   assert.equal(next.round,run.round+1);assert.notEqual(next.npcPlan,run.npcPlan,'next-round intent is freshly planned');assert.equal(typeof next.intent,'string');
   for(const side of ['player','npc']){
    assert.equal(next[side].energy,turnRules.energy,'stamina refreshes for a new round');
    assert.equal(next[side].extraDraw,0);assert.equal(next[side].extraEnergy,0);
   }
  }
  run=next;
  for(const side of ['player','npc']){
   const a=run[side];assert.deepEqual(tally([...a.hand,...a.draw,...a.discard]),expected);
   assert(a.energy>=0&&a.energy<=turnRules.maxEnergy);assert(a.hand.length<=turnRules.maxHand);
   assert(a.extraDraw<=turnRules.extraDraw);assert(a.extraEnergy<=turnRules.extraEnergy);
   assert(a.retained.length<=turnRules.retain);
   for(const field of ['built','attacked','functions'])assert(!Object.hasOwn(a,field));
   assert(factors.every(k=>(numericFactors.includes(k)?[0,.5,1]:[0,1]).includes(a.config[k])));
   assert.equal(bidScore(run,side),score(performance(a.config),levels[level]));
  }
  checked++;
 }
 assert(run.round<=levels[level].rounds);
 if(run.winner)assert(qualified(performance(run[run.winner].config),levels[level]));
}
console.log(`PASS: 256 source corners, 2916 configurations x 16 actions, self-only glass and 23328 eligible F06 cases, interpolation/boundary/cost/protection/privacy/novice checks; 900 games / ${checked} rounds with current-state events and card conservation.`);
