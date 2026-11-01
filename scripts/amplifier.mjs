import assert from 'node:assert/strict';
import {initialGame, amplifyBlockReason, playCard} from '../src/game.ts';

const base = {...initialGame(), phase:'battle', level:5, round:5, energy:3,
  hand:['F03','S2','F07','I4','F08'], npcBoard:['W2']};
assert.equal(amplifyBlockReason(base,2),'没有能反制当前对手装置的手牌');
assert.equal(playCard(base,2,'function'),base);

for (const [target,metric] of [['S2','H'],['I4','E']]) {
  const ready = {...base,npcBoard:[target],functions:1};
  assert.equal(amplifyBlockReason(ready,2),null);
  const boosted = playCard(ready,2,'function');
  assert.equal(boosted.energy,2);
  const attacked = playCard(boosted,boosted.hand.indexOf(target),'counter',target,metric);
  assert.equal(attacked.energy,1);
  assert.equal(attacked.effects.at(-1).fraction,-.75);
  assert.equal(attacked.boostedAttack,false);
}
const pressure = {...base,hand:['F07','F06']};
assert.equal(amplifyBlockReason(pressure,0),null);
const boosted = playCard(pressure,0,'function');
const attacked = playCard(boosted,0,'function','W2','D');
assert.equal(attacked.energy,1);
assert.equal(attacked.functions,2);
assert.equal(attacked.effects.at(-1).fraction,-.5);
const noFunctionSlot = {...pressure,functions:1};
assert.equal(amplifyBlockReason(noFunctionSlot,0),'功能次数不足：强化后无法再打压制牌');
assert.equal(playCard(noFunctionSlot,0,'function'),noFunctionSlot);
assert.equal(amplifyBlockReason({...pressure,energy:1},0),'强化并反制共需 2 点体力，当前 1 点');
assert.equal(amplifyBlockReason({...pressure,attacked:true},0),'本轮已反制 1 次；下轮可再反制');
assert.equal(amplifyBlockReason({...pressure,functions:2},0),'本轮功能牌已用满 2 张；下轮可再用');
assert.equal(amplifyBlockReason({...pressure,npcBoard:[]},0),'没有能反制当前对手装置的手牌');
console.log('Amplifier: target, energy, action quota, and both follow-up attacks passed');
