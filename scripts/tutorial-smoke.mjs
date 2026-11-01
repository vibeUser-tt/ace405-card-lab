import assert from 'node:assert/strict';
import {beginRun,initialGame,endTurn,canBuild,designById,levels,physical,qualified,missingRequirements} from '../src/game.ts';
const setSeed=seed=>{let n=seed;Math.random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296);};
const counts=ids=>ids.reduce((o,id)=>(o[id]=(o[id]||0)+1,o),{});
const npcFinish={};
for(let seed=1;seed<=1000;seed++){
 setSeed(seed);let g=beginRun(initialGame(),0);
 const pair=g.hand.filter(id=>['W2','P1','S2'].includes(id));
 assert(pair.length>=2&&g.hand.includes('F04'),'two complementary devices plus retention guaranteed');
 assert(new Set(pair.map(id=>designById[id].slot)).size>=2);
 assert(pair.every(id=>canBuild(g,id)));
 assert.equal(g.hand.length,5);assert.equal(g.deck.length,14);
 assert.deepEqual(counts([...g.hand,...g.drawPile]),counts(g.deck),'deal conserves every card');
 assert.deepEqual(counts([...g.npcHand,...g.npcDraw]),counts(g.deck),'NPC has same deck without extra cards');
 assert.equal(g.intent.kind,'none');assert(g.intent.label.includes('首轮勘察'));
 assert(!qualified(physical(['W2','P1']),levels[0]),'daylight alone still fails heat and energy gates');
 g=endTurn(g);assert.equal(g.round,2);assert.deepEqual(g.npcBoard,[]);assert.equal(g.npcAttacks,0);
 while(g.phase==='battle'){
  if(g.round<=3)assert(!qualified(physical(g.npcBoard),levels[0]));
  g=endTurn(g);
 }
 assert.equal(g.phase,'defeat','doing nothing never wins');
 assert(g.round>=4,'opponent cannot end a normal run before round 4');
 npcFinish[g.round]=(npcFinish[g.round]||0)+1;
 assert(g.result.includes('采光差 25'),'loss explains the remaining target');
}
assert.equal(missingRequirements(physical(['W2','P1']),levels[0]),'能耗超 4 · 过热超 55');
assert.equal(missingRequirements(physical(['W2','P1','S2']),levels[0]),'');
const bothQualified=endTurn({...initialGame(),phase:'battle',round:5,maxRounds:5,level:0,playerBoard:['W1','P1','S2'],npcBoard:['W2','P1','S2']});
assert.equal(bothQualified.phase,'defeat');assert(bothQualified.result.includes('双方同时达标，对手综合分更高'));
assert(levels.slice(1).every(l=>!l.tutorial),'tutorial rules are confined to first level');
console.log(JSON.stringify({checks:'1000 openings, card conservation, meaningful choices, visible setup turn, no free win, failure explanation',npcFinish},null,2));
