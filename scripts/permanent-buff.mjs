import assert from 'node:assert/strict';
import {initialGame,playCard,endTurn,beginRun,review,physical,qualified,levels,marginal,reachablePlans,validTargets} from '../src/game.ts';
const base=()=>({...initialGame(),phase:'battle',level:5,round:1,maxRounds:8,playerBoard:['W4'],hand:['F05','F05'],npcBoard:['W1']});
const source=base(),optimized=playCard(source,0,'function','W4','E');
assert.equal(source.effects.length,0,'play is immutable');
assert.equal(review(optimized.playerBoard,optimized.effects,'player').E,90);
assert.equal(playCard(optimized,0,'function','W4','E'),optimized,'same device/metric cannot stack');
let next=endTurn(optimized);
for(let i=0;i<3;i++){
 assert.equal(next.phase,'battle');assert.equal(review(next.playerBoard,next.effects,'player').E,90,'optimization survives several round transitions');
 const duplicate={...next,hand:['F05']};assert.equal(playCard(duplicate,0,'function','W4','E'),duplicate,'later rounds cannot stack either');
 next=endTurn(next);
}
const multi=playCard({...next,hand:['F05']},0,'function','W4','H');
assert.equal(multi.effects.filter(e=>e.side==='player').length,2,'another beneficial metric is allowed');
const pressed={...multi,effects:[...multi.effects,{side:'player',target:'W4',metric:'E',fraction:-.5},{side:'npc',target:'W1',metric:'D',fraction:.25}],shields:['W4']};
assert.equal(review(pressed.playerBoard,pressed.effects,'player').E,94,'temporary pressure combines with permanent optimization');
const recovered=endTurn(pressed);
assert.equal(review(recovered.playerBoard,recovered.effects,'player').E,90);
assert(recovered.effects.every(e=>e.fraction>0));assert.deepEqual(recovered.shields,[]);
assert(recovered.effects.some(e=>e.side==='npc'),'NPC permanent effects also survive');
const swapped=playCard({...recovered,hand:['W1'],built:false,energy:3},0,'build');
assert(!swapped.effects.some(e=>e.side==='player'),'replacement removes old device optimization');
assert(swapped.effects.some(e=>e.side==='npc'),'replacement leaves the other side intact');
assert.equal(beginRun(recovered,1).effects.length,0,'permanent means this run, not later games');
const full={...base(),playerBoard:['W1'],effects:[{side:'player',target:'W1',metric:'D',fraction:.25}]};
assert.deepEqual(validTargets(full,'F05'),[],'fully optimized device is no longer selectable');
const badMetric={...base(),hand:['F05']};assert.equal(playCard(badMetric,0,'function','W4','C'),badMetric,'cannot amplify a harmful metric');
// Route hints include a solution that becomes feasible only through existing permanent optimization.
const route={...base(),level:0,playerBoard:['W1','P1','S1'],hand:[],effects:[{side:'player',target:'W1',metric:'D',fraction:.25}],npcPlans:[]};
assert(!qualified(physical(route.playerBoard),levels[0]));
assert(qualified(review(route.playerBoard,route.effects,'player'),levels[0]));
assert(reachablePlans(route).some(p=>p.ids.length===3),'do not report zero routes for an optimized winning board');
// NPC cannot spend a card on a duplicate optimization, even on an already qualifying design.
const board=['W2','P1','S2'],effects=board.flatMap(target=>['E','D','H','C'].filter(metric=>{const m=marginal(board,target,metric);return metric==='D'?m>0:m<0;}).map(metric=>({side:'npc',target,metric,fraction:.25})));
const npc=endTurn({...initialGame(),phase:'battle',level:0,round:4,maxRounds:5,npcBoard:board,npcHand:['F05'],effects});
assert.equal(npc.effects.length,effects.length);assert(npc.npcHand.includes('F05'),'NPC respects permanent per-metric cap');
console.log('Permanent optimization: multiple rounds, stack cap, other metrics, suppression expiry, NPC parity, replacement, new run reset and route hints passed');
