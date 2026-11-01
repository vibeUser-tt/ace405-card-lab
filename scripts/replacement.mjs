import assert from 'node:assert/strict';
import {initialGame, playCard, endTurn, physical, review, canBuild, reachablePlans} from '../src/game.ts';
const base = () => ({...initialGame(), phase:'battle', level:0, round:2, maxRounds:5, energy:3,
  playerBoard:['W2','S2'], hand:['W1'], effects:[
    {side:'player',target:'W2',metric:'D',fraction:-.5},
    {side:'player',target:'W2',metric:'E',fraction:.25},
    {side:'npc',target:'W2',metric:'D',fraction:-.25},
    {side:'player',target:'S2',metric:'H',fraction:.25}], shields:['W2','S2']});
const g=base(), snapshot=JSON.stringify(g), next=playCard(g,0,'build');
assert.equal(JSON.stringify(g),snapshot,'previous state stays immutable');
assert.deepEqual(next.playerBoard,['S2','W1']);
assert.equal(next.built,true);assert.equal(next.energy,2);
assert.deepEqual(physical(next.playerBoard),physical(['W1','S2']),'old interactions are removed');
assert.deepEqual(next.effects,[g.effects[2],g.effects[3]],'remove only old device effects on the correct side');
assert.deepEqual(next.shields,['S2']);
assert(![...next.hand,...next.drawPile,...next.discard].includes('W2'),'dismantled card is not recycled');
assert(!canBuild({...next,hand:['W4'],energy:5},'W4'),'replacement uses the one installation this round');
assert.equal(playCard({...g,energy:0},0,'build').playerBoard,g.playerBoard,'insufficient stamina blocks replacement');
const duplicate={...g,hand:['W2']};assert.equal(playCard(duplicate,0,'build'),duplicate,'cannot cleanse by reinstalling same ID');
const tight={...base(),level:5,playerBoard:['W4','I1','S2','P2','M4'],hand:['W1'],energy:5};
assert(physical(tight.playerBoard).budget<=100);
assert(physical([...tight.playerBoard,'W1']).budget>100);
assert(canBuild(tight,'W1'),'budget subtracts old device before adding new');
assert(physical(playCard(tight,0,'build').playerBoard).budget<=100);
const tooMuch={...tight,playerBoard:['W1','I1','S2','P2','M4','T1'],hand:['W4']};
assert(physical(tooMuch.playerBoard).budget<=100);
assert(!canBuild(tooMuch,'W4'),'replacement cannot exceed final budget');
// A wrong window can be rescued, but an exiled old window cannot reappear in a route.
const route={...base(),playerBoard:['W1'],hand:['W2'],drawPile:['P1','S2'],effects:[],shields:[],
  npcPlans:[{ids:['W2','P1','S2'],score:80,budget:50},{ids:['W1','P1','S2'],score:70,budget:56}]};
assert.equal(reachablePlans(route).length,2,'plans can change an occupied slot');
assert.equal(reachablePlans(route,'player','W2').length,1,'preview excludes exiled card');
assert.equal(reachablePlans({...route,round:5}).length,0,'insufficient remaining installations');
const rescued=playCard(route,0,'build');assert.equal(reachablePlans(rescued).length,1);
// NPC can replace a suppressed device to qualify instead of wasting a shield on it.
const npc={...initialGame(),phase:'battle',level:0,round:5,maxRounds:5,npcEnergy:3,
  npcBoard:['W1','P1','S2'],npcHand:['W2','F08'],npcPlans:[{ids:['W2','P1','S2'],score:80,budget:50}],
  effects:[{side:'npc',target:'W1',metric:'D',fraction:-.5}]};
const response=endTurn(npc);
assert(response.npcBoard.includes('W2')&&!response.npcBoard.includes('W1'),'NPC swaps to the winning window');
assert.equal(response.phase,'defeat');assert.equal(response.npcEnergy,1);
assert(response.npcHand.includes('F08'),'NPC saves shield when replacement already clears pressure');
assert.equal(response.effects.length,0);assert(!response.npcDiscard.includes('W1'));
assert.deepEqual(review(response.npcBoard,response.effects,'npc'),physical(response.npcBoard));
// A telegraphed strike at a removed device fizzles; it does not transfer to the replacement.
const dodged=playCard({...route,intent:{kind:'attack',state:'PRESSURE',card:'F06',target:'W1',metric:'E',label:''},npcHand:['F06']},0,'build');
const after=endTurn({...dodged,round:5});assert.equal(after.npcAttacks,0);assert.equal(after.effects.length,0);
console.log('Replacement: cost, budget, interactions, cleanup, exile, routes, NPC defense and stale attack passed');
