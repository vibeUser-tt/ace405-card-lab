import assert from 'node:assert/strict';
import { beginRun, boardAfterBuild, buildBlockReason, canBuild, canCounter, counterBlockReason, designById, endTurn, gates, initialGame, levels, marginal, physical, playCard, qualified, review, score } from '../src/game.ts';

function seedRandom(seed) {
  let state = seed >>> 0;
  Math.random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
}
const paths = {
  daylight: ['W2', 'P1', 'S2'], energy: ['W4', 'T1', 'P3'], carbon: ['M1', 'T3', 'P3'],
  daylight_heat: ['W2', 'S2', 'P4', 'M2', 'I4', 'T2'],
  balanced: ['W1', 'I4', 'S1', 'P1', 'M1', 'T3'],
  final: ['W1', 'I4', 'S2', 'P1', 'M3', 'T3'],
};
for (const level of levels) {
  assert(qualified(physical(paths[level.id]), level), `${level.id} has a feasible path`);
  assert(physical(paths[level.id]).budget <= 100, `${level.id} respects budget`);
}
const base = physical([]);
assert.deepEqual([base.E, base.D, base.H, base.C], [100, 45, 160, 300]);
assert.equal(marginal(['W2', 'S2'], 'S2', 'H'), -90, 'interaction included in marginal');
const debuffed = review(['W2', 'S2'], [{ target: 'S2', metric: 'H', fraction: -.5, side: 'npc' }], 'npc');
assert.equal(debuffed.H, physical(['W2', 'S2']).H + 45, 'attack changes review but not physical proxy');
seedRandom(42);
const setup = beginRun(initialGame(), 0);
setup.hand = ['W2', 'F03', 'F06'];
setup.npcBoard = ['W2'];
const installed = playCard(setup, 0, 'build');
assert.deepEqual(installed.playerBoard, ['W2']);
assert.equal(installed.energy, 1);
assert.equal(buildBlockReason({ ...installed, built: false, energy: 5 }, 'W4'), null);
assert.match(counterBlockReason(installed, 'W4'), /对手没有安装/);
assert.equal(canBuild({ ...installed, built: false, energy: 5 }, 'W4'), true);
assert.equal(canCounter(installed, 'W4'), false);
assert.equal(setup.playerBoard.length, 0, 'actions do not mutate previous state');
const energized = playCard(installed, 0, 'function');
assert.equal(energized.energy, 2, 'stamina card costs 1 then grants 2');
const counterSetup = beginRun(initialGame(), 0);
counterSetup.hand = ['W2'];
counterSetup.npcBoard = ['W2', 'S2'];
const countered = playCard(counterSetup, 0, 'counter', undefined, 'D');
assert.equal(countered.attacked, true);
assert.equal(countered.hand.length, 0, 'same-name counter exiles the card');
assert.equal(review(countered.npcBoard, countered.effects, 'npc').D, physical(countered.npcBoard).D - 12);
const genericSetup = beginRun(initialGame(), 2);
genericSetup.hand = ['F06'];
genericSetup.npcBoard = ['M1'];
const generic = playCard(genericSetup, 0, 'function', 'M1', 'C');
assert.equal(generic.energy, 2);
assert.equal(review(generic.npcBoard, generic.effects, 'npc').C, physical(generic.npcBoard).C + 20);
const retainSetup = beginRun(initialGame(), 0);
retainSetup.hand = ['F04', 'W2', 'S2', 'F01'];
const retaining = playCard(retainSetup, 0, 'function', undefined, undefined, undefined, [1, 2]);
assert.deepEqual(retaining.retained, ['W2', 'S2']);
const afterRetain = endTurn(retaining);
assert(afterRetain.hand.includes('W2') && afterRetain.hand.includes('S2'), 'selected cards survive the round');
assert.equal(playCard(retainSetup, 0, 'function'), retainSetup, 'retention requires a selection');
const amplifySetup = beginRun(initialGame(), 2);
amplifySetup.hand = ['F07'];
assert.equal(playCard(amplifySetup, 0, 'function'), amplifySetup, 'attack amplifier requires a playable follow-up');
const noPeek = beginRun(initialGame(), 4);
noPeek.round = noPeek.maxRounds;
const changedHand = { ...noPeek, hand: ['F03', 'M1'] };
const npcA = endTurn(noPeek), npcB = endTurn(changedHand);
assert.deepEqual(npcA.npcBoard, npcB.npcBoard, 'NPC build does not read player hand');
assert.deepEqual(npcA.effects.filter(e => e.side === 'player'), npcB.effects.filter(e => e.side === 'player'), 'NPC attack does not read player hand');

function heuristic(g) {
  // This is a fixed toy policy, not a human player model.
  const path = paths[levels[g.level].id];
  if (!g.built) {
    let i = g.hand.findIndex(id => path.includes(id) && canBuild(g, id));
    if (i < 0) {
      i = g.hand.findIndex(id => !!designById[id] && canBuild(g, id) &&
        score(physical(boardAfterBuild(g.playerBoard, id)), levels[g.level]) > score(physical(g.playerBoard), levels[g.level]) + 1);
    }
    if (i >= 0) return playCard(g, i, 'build');
  }
  const drawIndex = g.hand.findIndex(id => id === 'F01' && g.functions < 2 && g.energy >= 1 && g.extraDraw < 4);
  if (drawIndex >= 0 && !g.built) return playCard(g, drawIndex, 'function');
  const energyIndex = g.hand.findIndex(id => id === 'F03' && g.functions < 2 && g.energy >= 1 && g.extraEnergy < 2);
  if (energyIndex >= 0 && !g.built && g.hand.some(id => !!designById[id] && designById[id].ap > g.energy && designById[id].ap <= g.energy + 1))
    return playCard(g, energyIndex, 'function');
  return g;
}
const stats = [];
for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
  const rounds = [], results = { victory: 0, defeat: 0, draw: 0 };
  for (let seed = 1; seed <= 200; seed++) {
    seedRandom(10000 * levelIndex + seed);
    let g = beginRun(initialGame(), levelIndex);
    assert.equal(g.phase, 'battle');
    assert(g.deck.length <= 20, 'deck size capped for 8-round run');
    assert(g.hand.length <= 8);
    for (let n = 0; n < 8 && g.phase === 'battle'; n++) {
      for (let a = 0; a < 5; a++) {
        const next = heuristic(g); if (next === g) break; g = next;
      }
      const before = g.playerBoard.length;
      g = endTurn(g);
      assert(g.playerBoard.length <= before);
      assert(g.round <= g.maxRounds);
      assert(g.hand.length <= 8);
      if (g.phase === 'battle') assert.equal(g.effects.length, 0, 'temporary effects reset after review');
    }
    assert.notEqual(g.phase, 'battle', `${levels[levelIndex].id} terminates`);
    results[g.phase]++;
    rounds.push(g.round);
    const p = review(g.playerBoard, g.effects, 'player');
    assert.equal(gates(p, levels[levelIndex]).budget, true);
  }
  rounds.sort((a, b) => a - b);
  stats.push({ level: levels[levelIndex].id, maxRounds: gMax(levelIndex), medianEnd: rounds[99], p90End: rounds[179], ...results });
}
function gMax(i) { return i === 0 || i === 2 ? 5 : i === 1 ? 6 : 8; }
console.log(JSON.stringify({ note: '200 seeded runs per level. Toy build-first policy; these are not student win rates.', stats }, null, 2));
