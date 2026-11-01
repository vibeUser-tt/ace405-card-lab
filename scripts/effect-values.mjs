import assert from 'node:assert/strict';
import {initialGame, designs, marginal, playCard, review} from '../src/game.ts';
import {metricChangeText, previewMetricChange} from '../src/effect-display.ts';
const base={...initialGame(),phase:'battle',level:5,round:2,energy:3};
let checked=0;
for(const board of [...designs.map(c=>[c.id]),['W2','S2','P1'],['W4','I2','T1'],['W1','I4','S1','P1','M1','T3']]) {
  for(const target of board) for(const metric of ['E','D','H','C']) {
    const contribution=marginal(board,target,metric);
    if(!(metric==='D'?contribution>0:contribution<0))continue;
    for(const [card,mode,fraction,boostedAttack] of [['F05','function',.25,false],['F06','function',-.25,false],['F06','function',-.5,true],[target,'counter',-.5,false],[target,'counter',-.75,true]]) {
      const side=card==='F05'?'player':'npc';
      const g={...base,playerBoard:board,npcBoard:board,hand:[card],boostedAttack,
        effects:side==='npc'?[{side,target,metric,fraction:.25}]:[]};
      const snapshot=JSON.stringify(g);
      const delta=previewMetricChange(g,0,mode,target,metric);
      assert.equal(JSON.stringify(g),snapshot,'preview must not mutate gameplay');
      assert.equal(delta,contribution*fraction,'show applied fraction, not original device contribution');
      const next=playCard(g,0,mode,target,metric);
      assert.equal(delta,review(board,next.effects,side)[metric]-review(board,g.effects,side)[metric]);
      checked++;
    }
  }
}
assert.equal(metricChangeText('D',8),'采光增加 8 个百分点');
assert.equal(metricChangeText('D',-8),'采光减少 8 个百分点');
assert.equal(metricChangeText('E',-3.75),'能耗减少 3.75 kWh/㎡·年');
assert.equal(metricChangeText('H',18.75),'过热增加 18.75 小时/年');
assert.equal(previewMetricChange({...base,hand:['F05'],energy:0,playerBoard:['W2']},0,'function','W2','D'),null);
console.log(`${checked} effect previews: actual deltas, combos, boosted attacks, existing buffs, formatting and immutability passed`);
