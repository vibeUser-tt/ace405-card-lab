import assert from 'node:assert/strict';
import { beginRun, canOptimizeMetric, boardAfterBuild, reachablePlans, canBuild, canCounter, designById, endTurn, functionById, gates, initialGame, levels, marginal, physical, playCard, qualified, review, score, validTargets } from '../src/game.ts';
import { writeFileSync } from 'node:fs';

const metrics = ['E', 'D', 'H', 'C'];
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const countGates = (v, level) => Object.values(gates(v, level)).filter(Boolean).length;
const deficit = (v, level) => {
  const scales = { E: 30, D: 20, H: 60, C: 80 };
  return metrics.reduce((sum, k) => sum + level.weights[k] * Math.max(0, (k === 'D' ? level.limits.D - v[k] : v[k] - level.limits[k]) / scales[k]), 0);
};
function plansFor(g) {
  const level = levels[g.level], bySlot = level.slots.map(slot => g.deck.filter(id => designById[id]?.slot === slot));
  const plans = [];
  function enumerate(slot, ids) {
    if (slot === bySlot.length) {
      const v = physical(ids);
      if (qualified(v, level)) plans.push({ ids, score: score(v, level), budget: v.budget });
      return;
    }
    enumerate(slot + 1, ids);
    for (const id of bySlot[slot]) enumerate(slot + 1, [...ids, id]);
  }
  enumerate(0, []);
  return plans;
}
function planBuild(g, plans, style) {
  const level = levels[g.level], hand = g.hand.filter(id => designById[id] && canBuild(g, id));
  if (!hand.length) return null;
  if (style === 'novice' || style === 'guided') {
    const choices = style === 'guided' ? hand.filter(id => reachablePlans(g, 'player', id).length > 0) : hand;
    return choices.sort((a, b) => {
    const va = physical(boardAfterBuild(g.playerBoard, a)), vb = physical(boardAfterBuild(g.playerBoard, b)), before = physical(g.playerBoard);
    const ua = 100 * (deficit(before, level) - deficit(va, level)) + 3 * (countGates(va, level) - countGates(before, level));
    const ub = 100 * (deficit(before, level) - deficit(vb, level)) + 3 * (countGates(vb, level) - countGates(before, level));
    return ub - ua;
    })[0];
  }
  const candidates = hand.map(id => {
    const next = boardAfterBuild(g.playerBoard, id);
    const supporting = reachablePlans(g, 'player', id).filter(p => p.ids.includes(id))
      .map(p => ({ ...p, remaining: p.ids.filter(x => !next.includes(x)).length }))
      .sort((a, b) => a.remaining - b.remaining || b.score - a.score || a.budget - b.budget)[0];
    return supporting ? { id, plan: supporting } : null;
  }).filter(Boolean);
  candidates.sort((a, b) => a.plan.remaining - b.plan.remaining || b.plan.score - a.plan.score || a.plan.budget - b.plan.budget);
  return candidates[0]?.id ?? null;
}
function attackMove(g, predictedNpcBoard, ownQualifies) {
  const level = levels[g.level];
  if (g.attacked || !predictedNpcBoard.length) return null;
  const before = review(predictedNpcBoard, g.effects, 'npc');
  const targetWouldWin = qualified(before, level);
  const options = [];
  for (let i = 0; i < g.hand.length; i++) {
    const id = g.hand[i], generic = id === 'F06';
    if (!generic && !canCounter(g, id)) continue;
    if (generic && (g.functions >= 2 || g.energy < 1)) continue;
    const board = generic ? g.npcBoard : [id];
    for (const target of board) for (const metric of metrics) {
      const m = marginal(predictedNpcBoard, target, metric), beneficial = metric === 'D' ? m > 0 : m < 0;
      if (!beneficial) continue;
      const fraction = generic ? .25 : .5;
      const after = review(predictedNpcBoard, [...g.effects, { target, metric, fraction: -fraction, side: 'npc' }], 'npc');
      const prevents = targetWouldWin && !qualified(after, level);
      const scoreLoss = score(before, level) - score(after, level);
      options.push({ i, id, target, metric, prevents, scoreLoss, cost: 1 });
    }
  }
  options.sort((a, b) => Number(b.prevents) - Number(a.prevents) || b.scoreLoss - a.scoreLoss || a.cost - b.cost);
  const best = options[0];
  if (!best) return null;
  // Preserve attack cards unless they stop an imminent win or decide a same-round tie.
  if (!best.prevents && !(targetWouldWin && ownQualifies && best.scoreLoss >= 2)) return null;
  return best;
}
function runPlayer(g, style, plans, random) {
  const moves = [];
  for (let action = 0; action < 8; action++) {
    const current = g;
    const level = levels[g.level];
    const buildId = !g.built && (style === 'random'
      ? g.hand.filter(id => designById[id] && canBuild(g, id)).sort(() => random() - .5)[0]
      : planBuild(g, plans, style));
    if (!g.built && buildId && designById[buildId].ap > g.energy && g.hand.includes('F03') && g.functions < 2 && g.energy >= 1) {
      const i = g.hand.indexOf('F03'); g = playCard(g, i, 'function'); moves.push('F03 补体力'); continue;
    }
    if (!g.built && buildId) {
      g = playCard(g, g.hand.indexOf(buildId), 'build'); moves.push('安装 ' + buildId); continue;
    }
    if (style !== 'random' && !g.built && g.hand.includes('F01') && g.functions < 2 && g.energy >= 1 && g.extraDraw < 4) {
      g = playCard(g, g.hand.indexOf('F01'), 'function'); moves.push('F01 抽牌'); continue;
    }
    if (style === 'expert' && !g.built && g.hand.includes('F02') && g.functions < 2 && g.hand.length > 1) {
      const i = g.hand.indexOf('F02');
      const discard = g.hand.findIndex((id, j) => j !== i && (!designById[id] || !canBuild(g, id)));
      if (discard >= 0) { g = playCard(g, i, 'function', undefined, undefined, discard); moves.push('F02 换牌'); continue; }
    }
    if (style === 'expert' && !g.built && g.hand.includes('F03') && g.functions < 2 && g.energy >= 1 && g.extraEnergy < 2 && g.hand.some(id => designById[id] && designById[id].ap > g.energy)) {
      g = playCard(g, g.hand.indexOf('F03'), 'function'); moves.push('F03 补体力'); continue;
    }
    if (style === 'expert' && g.intent.kind === 'attack' && g.intent.target && g.hand.includes('F08') && g.playerBoard.includes(g.intent.target) && g.energy >= 1 && g.functions < 2) {
      g = playCard(g, g.hand.indexOf('F08'), 'function', g.intent.target); moves.push('F08 护盾 ' + g.intent.target); continue;
    }
    if (style === 'expert' && !g.attacked) {
      const predicted = g.intent.kind === 'build' && g.intent.card && !g.npcBoard.includes(g.intent.card) ? boardAfterBuild(g.npcBoard, g.intent.card) : g.npcBoard;
      const attack = attackMove(g, predicted, qualified(review(g.playerBoard, g.effects, 'player'), level));
      if (attack) {
        if (attack.id === 'F06') g = playCard(g, attack.i, 'function', attack.target, attack.metric);
        else g = playCard(g, attack.i, 'counter', undefined, attack.metric);
        moves.push('反制 ' + attack.target + '/' + attack.metric); continue;
      }
    }
    const predictedNpc = g.intent.kind === 'build' && g.intent.card && !g.npcBoard.includes(g.intent.card)
      ? boardAfterBuild(g.npcBoard, g.intent.card) : g.npcBoard;
    const ownQualified = qualified(review(g.playerBoard, g.effects, 'player'), level);
    const likelyTie = ownQualified && qualified(review(predictedNpc, g.effects, 'npc'), level);
    if (style === 'expert' && (!ownQualified || likelyTie) && g.hand.includes('F05') && g.functions < 2 && g.energy >= 1) {
      const before = review(g.playerBoard, g.effects, 'player');
      const buffs = g.playerBoard.flatMap(target => metrics.filter(metric => {
        return canOptimizeMetric(g.playerBoard, g.effects, 'player', target, metric);
      }).map(metric => {
        const after = review(g.playerBoard, [...g.effects, { target, metric, fraction: .25, side: 'player' }], 'player');
        return { target, metric, finishes: qualified(after, level), gain: deficit(before, level) - deficit(after, level) };
      })).sort((a, b) => Number(b.finishes) - Number(a.finishes) || b.gain - a.gain);
      if (buffs[0] && (buffs[0].finishes || buffs[0].gain > .1)) {
        g = playCard(g, g.hand.indexOf('F05'), 'function', buffs[0].target, buffs[0].metric);
        moves.push('F05 增益 ' + buffs[0].target + '/' + buffs[0].metric); continue;
      }
    }
    if (style !== 'random' && g.built && !ownQualified && g.hand.includes('F04') && g.functions < 2 && g.energy >= 1) {
      const livePlans = reachablePlans(g);
      const retain = g.hand.map((id, index) => ({ id, index }))
        .filter(card => designById[card.id] && livePlans.some(plan => plan.ids.includes(card.id)))
        .slice(0, 2).map(card => card.index);
      if (retain.length) {
        g = playCard(g, g.hand.indexOf('F04'), 'function', undefined, undefined, undefined, retain);
        moves.push('F04 保留 ' + retain.length); continue;
      }
    }
    if (style === 'random' && g.hand.includes('F01') && g.functions < 2 && g.energy >= 1 && random() < .45) {
      g = playCard(g, g.hand.indexOf('F01'), 'function'); moves.push('随机抽牌'); continue;
    }
    if (g === current) break;
  }
  return { g, moves };
}
function oneGame(levelIndex, seed, style, trace = false) {
  const gameRandom = seeded(seed), policyRandom = seeded(seed ^ 0x9e3779b9);
  Math.random = gameRandom;
  let g = beginRun(initialGame(), levelIndex);
  const initialCounts = g.deck.reduce((counts, id) => counts.set(id, (counts.get(id) || 0) + 1), new Map());
  const plans = plansFor(g);
  const turns = [];
  const activity = { builds: 0, counters: 0, functions: 0, emptyTurns: 0, pressureTurns: 0 };
  while (g.phase === 'battle') {
    const start = { round: g.round, hand: [...g.hand], board: [...g.playerBoard], npcBoard: [...g.npcBoard], intent: g.intent };
    const played = runPlayer(g, style, plans, policyRandom);
    activity.builds += played.moves.filter(m => m.startsWith('安装')).length;
    activity.counters += played.moves.filter(m => m.startsWith('反制')).length;
    activity.functions += played.moves.filter(m => m.startsWith('F') || m.startsWith('随机抽牌')).length;
    activity.emptyTurns += Number(played.moves.length === 0);
    activity.pressureTurns += Number(start.intent.state === 'PRESSURE');
    g = endTurn(played.g);
    assert(physical(g.playerBoard).budget <= 100 && physical(g.npcBoard).budget <= 100, 'budget stays legal');
    assert(new Set(g.playerBoard.map(id => designById[id].slot)).size === g.playerBoard.length, 'player has at most one measure per slot');
    assert(new Set(g.npcBoard.map(id => designById[id].slot)).size === g.npcBoard.length, 'NPC has at most one measure per slot');
    assert(g.hand.length <= 8 && g.npcHand.length <= 8, 'hand limit');
    assert(g.energy >= 0 && g.npcEnergy >= 0, 'no negative stamina');
    assert(g.round <= g.maxRounds, 'run terminates by round limit');
    const permanentKeys = g.effects.filter(e => e.fraction > 0).map(e => `${e.side}:${e.target}:${e.metric}`);
    assert.equal(new Set(permanentKeys).size, permanentKeys.length, 'permanent optimization cannot stack on the same device/metric');
    if (g.phase === 'battle') assert(g.effects.every(e => e.fraction > 0), 'only permanent effects survive a round');
    for (const zones of [[g.hand, g.drawPile, g.discard, g.playerBoard], [g.npcHand, g.npcDraw, g.npcDiscard, g.npcBoard]]) {
      const counts = zones.flat().reduce((acc, id) => acc.set(id, (acc.get(id) || 0) + 1), new Map());
      for (const [id, count] of counts) assert(count <= (initialCounts.get(id) || 0), `card ${id} was duplicated`);
    }
    if (trace) turns.push({ ...start, moves: played.moves, playerAfter: [...g.playerBoard], npcAfter: [...g.npcBoard], history: g.history.at(-1), result: g.result });
  }
  return { phase: g.phase, round: g.round, result: g.result, npcWin: g.phase === 'defeat' && qualified(review(g.npcBoard, g.effects, 'npc'), levels[g.level]), timeout: g.result.includes('双方都未'), plans: plans.length, activity, turns };
}
const runs = Number(process.argv.find(a => a.startsWith('--runs='))?.split('=')[1] ?? 500);
const seedStart = Number(process.argv.find(a => a.startsWith('--seed-start='))?.split('=')[1] ?? 0);
const outputPath = process.argv.find(a => a.startsWith('--output='))?.slice('--output='.length);
const styles = (process.argv.find(a => a.startsWith('--styles='))?.split('=')[1] ?? 'random,novice,guided,planner,expert').split(',');
const traceSeed = Number(process.argv.find(a => a.startsWith('--trace='))?.split('=')[1] ?? 0);
const findPhase = process.argv.find(a => a.startsWith('--find='))?.split('=')[1];
if (findPhase) {
  const level = Number(process.argv.find(a => a.startsWith('--level='))?.split('=')[1] ?? 0);
  const style = process.argv.find(a => a.startsWith('--style='))?.split('=')[1] ?? 'expert';
  const found = Array.from({ length: 500 }, (_, i) => 100000 * level + i + 1)
    .map(seed => ({ seed, game: oneGame(level, seed, style, true) }))
    .find(({ game }) => game.phase === findPhase);
  console.log(JSON.stringify({ level: levels[level].id, style, ...found }, null, 2));
} else if (traceSeed) {
  const level = Number(process.argv.find(a => a.startsWith('--level='))?.split('=')[1] ?? 0);
  const style = process.argv.find(a => a.startsWith('--style='))?.split('=')[1] ?? 'expert';
  console.log(JSON.stringify({ level: levels[level].id, seed: traceSeed, style, ...oneGame(level, traceSeed, style, true) }, null, 2));
} else {
  const rows = [];
  for (const style of styles) for (let level = 0; level < levels.length; level++) {
    const outcomes = { victory: 0, defeat: 0, draw: 0, npcWin: 0, timeout: 0 };
    const activity = { builds: 0, counters: 0, functions: 0, emptyTurns: 0, pressureTurns: 0 };
    const rounds = [], plans = [];
    for (let seed = 1; seed <= runs; seed++) {
      const result = oneGame(level, 100000 * level + seedStart + seed, style);
      outcomes[result.phase]++; outcomes.npcWin += Number(result.npcWin); outcomes.timeout += Number(result.timeout);
      for (const key of Object.keys(activity)) activity[key] += result.activity[key];
      rounds.push(result.round); plans.push(result.plans);
    }
    rounds.sort((a, b) => a - b);
    rows.push({ style, level: levels[level].id, runs, winRate: +(100 * outcomes.victory / runs).toFixed(1), drawRate: +(100 * outcomes.draw / runs).toFixed(1), npcWinRate: +(100 * outcomes.npcWin / runs).toFixed(1), timeoutRate: +(100 * outcomes.timeout / runs).toFixed(1), medianRound: rounds[Math.floor(runs / 2)], p90Round: rounds[Math.floor(runs * .9)], minPlans: Math.min(...plans), meanBuilds: +(activity.builds / runs).toFixed(2), meanCounters: +(activity.counters / runs).toFixed(2), meanFunctions: +(activity.functions / runs).toFixed(2), meanEmptyTurns: +(activity.emptyTurns / runs).toFixed(2), meanPressureTurns: +(activity.pressureTurns / runs).toFixed(2) });
  }
  const report = { method: 'Seeded simulated player policies, not measured human win rates.', runsPerCell: runs, seedStart, rows };
  if (outputPath) writeFileSync(outputPath, JSON.stringify(report, null, 2));
  else console.log(JSON.stringify(report, null, 2));
}
