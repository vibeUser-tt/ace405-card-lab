import raw from './course-config.json' with { type: 'json' };

export type Metric = 'E' | 'D' | 'H' | 'C';
export type Phase = 'intro' | 'battle' | 'victory' | 'defeat' | 'draw';
export type DesignCard = { id: string; name: string; slot: string; budget: number; ap: number; E: number; D: number; H: number; C: number };
export type FunctionCard = { id: string; name: string; count: number; cost: number; unlock: string; role: string; effect: string };
export type Level = { id: string; name: string; curriculum: string; slots: string[]; limits: Record<Metric, number>; weights: Record<Metric, number>; npc_attack_cap: number; npc_attack_earliest_round: number; opponent_style: string };
export type Effect = { target: string; metric: Metric; fraction: number; side: 'player' | 'npc' };
export type Intent = { state: 'SECURE' | 'PRESSURE' | 'BUILD' | 'REFILL'; label: string; card?: string; target?: string; metric?: Metric; kind: 'build' | 'attack' | 'draw' | 'none' };
export type Plan = { ids: string[]; score: number; budget: number };
export type Game = {
  phase: Phase; level: number; round: number; maxRounds: number; energy: number; npcEnergy: number;
  deck: string[]; drawPile: string[]; discard: string[]; hand: string[]; npcDraw: string[]; npcDiscard: string[]; npcHand: string[];
  playerBoard: string[]; npcBoard: string[]; effects: Effect[]; shields: string[]; retained: string[]; npcRetained: string[];
  built: boolean; attacked: boolean; functions: number; extraEnergy: number; extraDraw: number; boostedAttack: boolean; npcAttacks: number;
  intent: Intent; npcPlans: Plan[]; log: string[]; action: string; sequence: number; result: string; history: string[];
};
const data = raw as unknown as { design_cards: DesignCard[]; function_cards: FunctionCard[]; levels: Level[]; interactions: { cards: string[]; delta: Partial<Record<Metric | 'budget', number>> }[]; base_performance: Record<Metric, number> };
export const designs = data.design_cards;
export const functions = data.function_cards;
export const levels = data.levels;
export const designById = Object.fromEntries(designs.map(c => [c.id, c])) as Record<string, DesignCard>;
export const functionById = Object.fromEntries(functions.map(c => [c.id, c])) as Record<string, FunctionCard>;
export const metricNames: Record<Metric, string> = { E: '能耗', D: '采光', H: '过热', C: '前期碳' };
export const metricUnits: Record<Metric, string> = { E: 'kWh/㎡·年', D: '%', H: '小时/年', C: 'kgCO₂e/㎡' };
export const slotNames: Record<string, string> = { window: '窗', wall: '围护', shade: '遮阳', plan: '平面', material: '材料', system: '系统' };
export const maxRounds = (level: number) => level === 0 || level === 2 ? 5 : level === 1 ? 6 : 8;
const metrics: Metric[] = ['E', 'D', 'H', 'C'];
const shuffle = <T,>(items: T[]) => { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
const clone = (g: Game): Game => ({ ...g, deck: [...g.deck], drawPile: [...g.drawPile], discard: [...g.discard], hand: [...g.hand], npcDraw: [...g.npcDraw], npcDiscard: [...g.npcDiscard], npcHand: [...g.npcHand], playerBoard: [...g.playerBoard], npcBoard: [...g.npcBoard], effects: [...g.effects], shields: [...g.shields], retained: [...g.retained], npcRetained: [...g.npcRetained], log: [...g.log], history: [...g.history] });
const note = (g: Game, message: string) => { g.action = message; g.log = [message, ...g.log].slice(0, 7); g.sequence++; };
const paths: Record<string, string[]> = {
  daylight: ['W2', 'P1', 'S2'], energy: ['W4', 'T1', 'P3'], carbon: ['M1', 'T3', 'P3'],
  daylight_heat: ['W2', 'S2', 'P4', 'M2', 'I4', 'T2'], balanced: ['W1', 'I4', 'S1', 'P1', 'M1', 'T3'],
  final: ['W1', 'I4', 'S2', 'P1', 'M3', 'T3'],
};
export function physical(board: string[]): Record<Metric | 'budget', number> {
  const out = { ...data.base_performance, budget: 0 };
  for (const id of board) { const c = designById[id]; if (!c) continue; for (const k of metrics) out[k] += c[k]; out.budget += c.budget; }
  for (const interaction of data.interactions) if (interaction.cards.every(id => board.includes(id))) {
    for (const [key, value] of Object.entries(interaction.delta)) (out as unknown as Record<string, number>)[key] += value ?? 0;
  }
  out.E = Math.max(25, Math.min(160, out.E)); out.D = Math.max(0, Math.min(100, out.D)); out.H = Math.max(0, Math.min(500, out.H)); out.C = Math.max(50, Math.min(650, out.C));
  return out;
}
export const marginal = (board: string[], id: string, metric: Metric) => physical(board)[metric] - physical(board.filter(x => x !== id))[metric];
export function review(board: string[], effects: Effect[], side: 'player' | 'npc') {
  const base = physical(board); const effective = { ...base };
  for (const e of effects) if (e.side === side && board.includes(e.target)) {
    const m = marginal(board, e.target, e.metric), beneficial = e.metric === 'D' ? m > 0 : m < 0;
    if (beneficial) effective[e.metric] += e.fraction * m;
  }
  return effective;
}
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export function score(v: Record<Metric, number>, level: Level) {
  const axes = { E: clamp(100 * (120 - v.E) / 70), D: clamp(100 * (v.D - 30) / 50), H: clamp(100 * (200 - v.H) / 150), C: clamp(100 * (400 - v.C) / 200) };
  return metrics.reduce((s, k) => s + axes[k] * level.weights[k], 0);
}
export function gates(v: Record<Metric | 'budget', number>, level: Level) { return { E: v.E <= level.limits.E, D: v.D >= level.limits.D, H: v.H <= level.limits.H, C: v.C <= level.limits.C, budget: v.budget <= 100 }; }
export const qualified = (v: Record<Metric | 'budget', number>, level: Level) => Object.values(gates(v, level)).every(Boolean);
const gap = (v: Record<Metric, number>, level: Level) => {
  const scale = { E: 30, D: 20, H: 60, C: 80 };
  return metrics.reduce((s, k) => s + level.weights[k] * Math.max(0, (k === 'D' ? level.limits.D - v[k] : v[k] - level.limits[k]) / scale[k]), 0);
};
function draw(g: Game, side: 'player' | 'npc', count: number) {
  const hand = side === 'player' ? g.hand : g.npcHand;
  for (let i = 0; i < count && hand.length < 8; i++) {
    let pile = side === 'player' ? g.drawPile : g.npcDraw;
    if (!pile.length) {
      pile = shuffle(side === 'player' ? g.discard : g.npcDiscard);
      if (side === 'player') { g.drawPile = pile; g.discard = []; } else { g.npcDraw = pile; g.npcDiscard = []; }
    }
    const card = pile.pop(); if (!card) break; hand.push(card);
  }
}
function deckFor(level: Level) {
  const chosen = [...paths[level.id]];
  for (const slot of level.slots) {
    const options = shuffle(designs.filter(c => c.slot === slot && !chosen.includes(c.id)));
    while (chosen.filter(id => designById[id].slot === slot).length < 2 && options.length) chosen.push(options.pop()!.id);
  }
  const unlockIndex = levels.findIndex(l => l.id === level.id);
  const functionPool = functions.filter(f => levels.findIndex(l => l.id === f.unlock) <= unlockIndex).flatMap(f => Array(f.count).fill(f.id) as string[]);
  const guaranteed = unlockIndex >= 3 ? ['F06', 'F08'] : unlockIndex >= 2 ? ['F06'] : [];
  for (const id of guaranteed) functionPool.splice(functionPool.indexOf(id), 1);
  return [...chosen, ...guaranteed, ...shuffle(functionPool).slice(0, 8 - guaranteed.length)];
}
function feasiblePlans(deck: string[], level: Level): Plan[] {
  const options = level.slots.map(slot => deck.filter(id => designById[id]?.slot === slot));
  const result: Plan[] = [];
  const visit = (position: number, ids: string[]) => {
    if (position === options.length) {
      const value = physical(ids);
      if (qualified(value, level)) result.push({ ids, score: score(value, level), budget: value.budget });
      return;
    }
    visit(position + 1, ids);
    for (const id of options[position]) visit(position + 1, [...ids, id]);
  };
  visit(0, []);
  return result;
}
function bestBuild(g: Game, side: 'player' | 'npc') {
  const level = levels[g.level], board = side === 'player' ? g.playerBoard : g.npcBoard;
  const hand = side === 'player' ? g.hand : g.npcHand, energy = side === 'player' ? g.energy : g.npcEnergy;
  const before = physical(board);
  const available = new Set([...board, ...hand, ...(side === 'npc' ? g.npcDraw : g.drawPile), ...(side === 'npc' ? g.npcDiscard : g.discard)]);
  const plans = side === 'npc' ? g.npcPlans.filter(plan => board.every(id => plan.ids.includes(id)) && plan.ids.every(id => available.has(id))) : [];
  return hand.filter(id => !!designById[id]).map(id => {
    const c = designById[id]; if (c.ap > energy || board.some(x => designById[x].slot === c.slot)) return null;
    const after = physical([...board, id]); if (after.budget > 100) return null;
    const utility = 100 * (gap(before, level) - gap(after, level)) + 10 * (Object.values(gates(after, level)).filter(Boolean).length - Object.values(gates(before, level)).filter(Boolean).length) - .2 * c.budget - 2 * c.ap;
    const path = plans.filter(plan => plan.ids.includes(id)).sort((a, b) =>
      a.ids.length - b.ids.length || b.score - a.score || a.budget - b.budget)[0];
    return { id, utility, finishes: qualified(after, level), path, remaining: path ? path.ids.length - board.length : Infinity };
  }).filter(x => x !== null)
    .filter(x => side !== 'npc' || !plans.length || x.path)
    .sort((a, b) => Number(b.finishes) - Number(a.finishes) || Number(!!b.path) - Number(!!a.path)
      || a.remaining - b.remaining || b.utility - a.utility || (b.path?.score ?? 0) - (a.path?.score ?? 0) || a.id.localeCompare(b.id))[0];
}
function attackOptions(g: Game) {
  const board = g.playerBoard, hand = g.npcHand, level = levels[g.level];
  const possibleFinishes = g.deck.filter(id => {
    const card = designById[id];
    return card && !board.some(installed => designById[installed].slot === card.slot)
      && physical([...board, id]).budget <= 100 && qualified(physical([...board, id]), level);
  }).map(id => [...board, id]);
  const options: { id: string; target: string; metric: Metric; cost: number; blocks: number; scoreLoss: number }[] = [];
  for (const id of hand) {
    if (!designById[id] && id !== 'F06') continue;
    for (const target of board) {
      if (id !== 'F06' && id !== target) continue;
      for (const metric of metrics) {
        const m = marginal(board, target, metric), benefit = metric === 'D' ? m > 0 : m < 0;
        if (!benefit) continue;
        const effect: Effect = { target, metric, fraction: id === 'F06' ? -.25 : -.5, side: 'player' };
        const blocks = possibleFinishes.filter(future => !qualified(review(future, [effect], 'player'), level)).length;
        const scoreLoss = score(physical(board), level) - score(review(board, [effect], 'player'), level);
        options.push({ id, target, metric, cost: 1, blocks, scoreLoss });
      }
    }
  }
  return options.sort((a, b) => b.blocks - a.blocks || b.scoreLoss - a.scoreLoss || a.cost - b.cost || a.id.localeCompare(b.id));
}
function chooseIntent(g: Game): Intent {
  const level = levels[g.level], build = bestBuild(g, 'npc');
  const telegraph = (message: string) => g.npcHand.includes('F08') && g.npcBoard.length
    ? `${message}；若遭压制将使用证据护盾` : message;
  const buffFinishes = build && g.npcHand.includes('F05') && g.npcEnergy - designById[build.id].ap >= 1
    && [...g.npcBoard, build.id].some(target => metrics.some(metric =>
      qualified(review([...g.npcBoard, build.id], [{ target, metric, fraction: .25, side: 'npc' }], 'npc'), level)));
  if (build?.finishes || buffFinishes) return { state: 'SECURE', kind: 'build', card: build!.id, label: telegraph(`准备安装「${designById[build!.id].name}」并完成委托门槛`) };
  const options = attackOptions(g).filter(a => a.cost <= g.npcEnergy && a.blocks > 0);
  if (g.round >= level.npc_attack_earliest_round && g.npcAttacks < level.npc_attack_cap && options.length) {
    const a = options[0]; return { state: 'PRESSURE', kind: 'attack', card: a.id, target: a.target, metric: a.metric, label: telegraph(`准备压制「${designById[a.target].name}」的${metricNames[a.metric]}收益`) };
  }
  if (build && (build.path || build.utility > -10)) return { state: 'BUILD', kind: 'build', card: build.id, label: telegraph(`计划安装「${designById[build.id].name}」，推进可行方案`) };
  return { state: 'REFILL', kind: 'draw', label: telegraph('暂无有效措施，尝试找牌或补充体力') };
}
export const initialGame = (): Game => ({ phase: 'intro', level: 0, round: 0, maxRounds: 5, energy: 3, npcEnergy: 3, deck: [], drawPile: [], discard: [], hand: [], npcDraw: [], npcDiscard: [], npcHand: [], playerBoard: [], npcBoard: [], effects: [], shields: [], retained: [], npcRetained: [], built: false, attacked: false, functions: 0, extraEnergy: 0, extraDraw: 0, boostedAttack: false, npcAttacks: 0, intent: { state: 'BUILD', kind: 'none', label: '' }, npcPlans: [], log: [], action: '', sequence: 0, result: '', history: [] });
export function beginRun(previous: Game, levelIndex: number): Game {
  const g = initialGame(), level = levels[levelIndex]; if (!level) return previous;
  g.level = levelIndex; g.phase = 'battle'; g.round = 1; g.maxRounds = maxRounds(levelIndex); g.deck = deckFor(level); g.npcPlans = feasiblePlans(g.deck, level);
  g.drawPile = shuffle(g.deck); g.npcDraw = shuffle(g.deck); draw(g, 'player', 5); draw(g, 'npc', 5);
  g.intent = chooseIntent(g); note(g, `进入「${level.name}」。本关最多 ${g.maxRounds} 轮；先满足全部委托门槛者获胜。`);
  return g;
}
export function buildBlockReason(g: Game, id: string): string | null {
  const c = designById[id];
  if (!c) return '这不是措施牌';
  const occupied = g.playerBoard.find(x => designById[x].slot === c.slot);
  if (occupied) return `${slotNames[c.slot]}槽已安装「${designById[occupied].name}」；同槽不能叠加`;
  if (physical([...g.playerBoard, id]).budget > 100) return `安装后预算会超过 100（当前 ${physical(g.playerBoard).budget} + ${c.budget}）`;
  if (g.built) return '本轮已安装 1 张措施；下轮可再安装';
  if (c.ap > g.energy) return `体力不足：需要 ${c.ap} 点，当前 ${g.energy} 点`;
  return null;
}
export function counterBlockReason(g: Game, id: string): string | null {
  if (!designById[id]) return '这不是措施牌';
  if (g.attacked) return '本轮已反制 1 次；下轮可再反制';
  if (g.energy < 1) return '体力不足：反制需要 1 点';
  if (!g.npcBoard.includes(id)) return '对手没有安装这张同名措施，无法反制';
  if (!metrics.some(k => { const m = marginal(g.npcBoard, id, k); return k === 'D' ? m > 0 : m < 0; })) return '该措施当前没有可削减的正向指标收益';
  return null;
}
export function canBuild(g: Game, id: string) { return buildBlockReason(g, id) === null; }
export function canCounter(g: Game, id: string) { return counterBlockReason(g, id) === null; }
export function validTargets(g: Game, id: string) { return (id === 'F06' ? g.npcBoard : id === 'F05' || id === 'F08' ? g.playerBoard : []).filter(target => id === 'F08' || metrics.some(k => { const m = marginal(id === 'F05' ? g.playerBoard : g.npcBoard, target, k); return k === 'D' ? m > 0 : m < 0; })); }
export function playCard(previous: Game, handIndex: number, mode: 'build' | 'counter' | 'function', target?: string, metric?: Metric, discardIndex?: number, retainIndices?: number[]): Game {
  if (previous.phase !== 'battle') return previous;
  const id = previous.hand[handIndex]; if (!id) return previous;
  const g = clone(previous), c = designById[id], f = functionById[id];
  if (mode === 'build') {
    if (!c || !canBuild(g, id)) return previous;
    g.energy -= c.ap; g.playerBoard.push(id); g.built = true; g.hand.splice(handIndex, 1);
    note(g, `安装「${c.name}」。采光 ${physical(g.playerBoard).D}%，能耗 ${physical(g.playerBoard).E}。`);
  } else if (mode === 'counter') {
    if (!canCounter(g, id) || !metric || !g.npcBoard.includes(id)) return previous;
    const m = marginal(g.npcBoard, id, metric); if (!(metric === 'D' ? m > 0 : m < 0)) return previous;
    const fraction = Math.min(.75, .5 + (g.boostedAttack ? .25 : 0));
    g.energy--; g.attacked = true; g.boostedAttack = false; g.hand.splice(handIndex, 1);
    g.effects.push({ target: id, metric, fraction: -fraction, side: 'npc' });
    note(g, `同名反制「${c.name}」：对手本轮${metricNames[metric]}收益削减 ${Math.round(fraction * 100)}%。`);
  } else if (mode === 'function') {
    if (!f || g.functions >= 2 || g.energy < f.cost) return previous;
    if (id === 'F06' && (g.attacked || !target || !metric || !validTargets(g, id).includes(target))) return previous;
    if ((id === 'F05' || id === 'F08') && (!target || !validTargets(g, id).includes(target))) return previous;
    if (id === 'F02' && (discardIndex === undefined || discardIndex === handIndex || !g.hand[discardIndex])) return previous;
    if (id === 'F03' && g.extraEnergy >= 2) return previous;
    if (id === 'F01' && g.extraDraw >= 4) return previous;
    if (id === 'F04' && (!retainIndices?.length || retainIndices.length > 2 || new Set(retainIndices).size !== retainIndices.length || retainIndices.some(index => index === handIndex || !g.hand[index]))) return previous;
    if (id === 'F07' && (g.attacked || !g.hand.some((card, index) => index !== handIndex && ((card === 'F06' && g.energy >= 2 && validTargets(g, card).length > 0) || (canCounter(g, card) && g.energy >= 2))))) return previous;
    if (id === 'F05' || id === 'F06') {
      if (!metric || !target) return previous;
      const board = id === 'F05' ? g.playerBoard : g.npcBoard, m = marginal(board, target, metric);
      if (!(metric === 'D' ? m > 0 : m < 0)) return previous;
      if (id === 'F05' && g.effects.some(effect => effect.side === 'player' && effect.target === target && effect.metric === metric && effect.fraction > 0)) return previous;
    }
    g.energy -= f.cost; g.functions++; g.hand.splice(handIndex, 1); g.discard.push(id);
    if (id === 'F01') { draw(g, 'player', 2); g.extraDraw += 2; }
    if (id === 'F02') { const actual = discardIndex! > handIndex ? discardIndex! - 1 : discardIndex!; g.discard.push(g.hand.splice(actual, 1)[0]); draw(g, 'player', 2); }
    if (id === 'F03') { g.energy = Math.min(5, g.energy + 2); g.extraEnergy += 2; }
    if (id === 'F04') g.retained = retainIndices!.map(index => g.hand[index > handIndex ? index - 1 : index]);
    if (id === 'F05') g.effects.push({ target: target!, metric: metric!, fraction: .25, side: 'player' });
    if (id === 'F06') { g.effects.push({ target: target!, metric: metric!, fraction: -(g.boostedAttack ? .5 : .25), side: 'npc' }); g.attacked = true; g.boostedAttack = false; }
    if (id === 'F07') g.boostedAttack = true;
    if (id === 'F08') g.shields.push(target!);
    note(g, `使用「${f.name}」${target ? `，目标「${designById[target].name}」` : ''}${metric ? `的${metricNames[metric]}` : ''}。`);
  } else return previous;
  return g;
}
function npcAct(g: Game) {
  const intent = g.intent;
  let functionsUsed = 0;
  const useFunction = (id: string, cost: number) => {
    if (functionsUsed >= 2 || !g.npcHand.includes(id) || g.npcEnergy < cost) return false;
    g.npcHand.splice(g.npcHand.indexOf(id), 1);
    g.npcDiscard.push(id);
    g.npcEnergy -= cost;
    functionsUsed++;
    return true;
  };
  if (intent.kind === 'attack' && intent.card && intent.target && intent.metric && g.npcHand.includes(intent.card) && g.playerBoard.includes(intent.target) && g.npcEnergy >= 1) {
    const id = intent.card, blocked = g.shields.includes(intent.target);
    g.npcHand.splice(g.npcHand.indexOf(id), 1); g.npcEnergy--; g.npcAttacks++;
    if (blocked) { g.shields.splice(g.shields.indexOf(intent.target), 1); note(g, `对手攻击「${designById[intent.target].name}」，被你的证据护盾挡下。`); }
    else { g.effects.push({ target: intent.target, metric: intent.metric, fraction: id === 'F06' ? -.25 : -.5, side: 'player' }); note(g, `对手压制「${designById[intent.target].name}」的${metricNames[intent.metric]}收益。`); }
    if (id === 'F06') g.npcDiscard.push(id);
  }
  const threatened = g.effects.filter(effect => effect.side === 'npc' && effect.fraction < 0 && g.npcBoard.includes(effect.target));
  if (threatened.length && g.npcHand.includes('F08') && g.npcEnergy >= 1) {
    const mostHarmful = threatened.map(effect => {
      const without = g.effects.filter(item => item !== effect);
      const before = review(g.npcBoard, g.effects, 'npc'), after = review(g.npcBoard, without, 'npc');
      return { effect, loss: (qualified(after, levels[g.level]) ? 100 : 0) - (qualified(before, levels[g.level]) ? 100 : 0) + score(after, levels[g.level]) - score(before, levels[g.level]) };
    }).sort((a, b) => b.loss - a.loss)[0];
    if (mostHarmful.loss > 0 && useFunction('F08', 1)) {
      g.effects.splice(g.effects.indexOf(mostHarmful.effect), 1);
      note(g, `对手用证据护盾挡下对「${designById[mostHarmful.effect.target].name}」的压制。`);
    }
  }
  let build = bestBuild(g, 'npc');
  if (!build && g.npcEnergy <= 2 && g.npcHand.includes('F03') && g.npcHand.some(id => designById[id]?.ap > g.npcEnergy)) {
    if (useFunction('F03', 1)) { g.npcEnergy = Math.min(5, g.npcEnergy + 2); note(g, '对手使用短时冲刺，补充体力。'); build = bestBuild(g, 'npc'); }
  }
  if (!build && functionsUsed < 2 && g.npcHand.includes('F01') && g.npcEnergy >= 1) {
    if (useFunction('F01', 1)) { draw(g, 'npc', 2); note(g, '对手整理资料，额外抽了两张牌。'); build = bestBuild(g, 'npc'); }
  }
  if (!build && functionsUsed < 2 && g.npcHand.includes('F02') && g.npcHand.length > 1) {
    const livePlans = g.npcPlans.filter(plan => g.npcBoard.every(id => plan.ids.includes(id)));
    const discardIndex = g.npcHand.findIndex(id => id !== 'F02' && (!designById[id] || !livePlans.some(plan => plan.ids.includes(id))));
    if (discardIndex >= 0 && useFunction('F02', 0)) {
      const actual = g.npcHand.findIndex(id => id !== 'F02' && (!designById[id] || !livePlans.some(plan => plan.ids.includes(id))));
      if (actual >= 0) g.npcDiscard.push(g.npcHand.splice(actual, 1)[0]);
      draw(g, 'npc', 2); note(g, '对手筛掉无关方案，重新抽牌。'); build = bestBuild(g, 'npc');
    }
  }
  if (build && (build.path || build.utility > -10) && g.npcHand.includes(build.id)) {
    const c = designById[build.id]; g.npcHand.splice(g.npcHand.indexOf(build.id), 1); g.npcBoard.push(build.id); g.npcEnergy -= c.ap;
    note(g, `对手安装「${c.name}」，其采光为 ${physical(g.npcBoard).D}%。`);
  }
  if (functionsUsed < 2 && g.npcEnergy >= 1 && g.npcHand.includes('F05') && g.npcBoard.length) {
    const before = review(g.npcBoard, g.effects, 'npc'), level = levels[g.level];
    const buffs = g.npcBoard.flatMap(target => metrics.flatMap(metric => {
      const m = marginal(g.npcBoard, target, metric);
      if (!(metric === 'D' ? m > 0 : m < 0)) return [];
      const after = review(g.npcBoard, [...g.effects, { target, metric, fraction: .25, side: 'npc' }], 'npc');
      return [{ target, metric, after, gain: (qualified(after, level) ? 100 : 0) - (qualified(before, level) ? 100 : 0) + score(after, level) - score(before, level) }];
    })).sort((a, b) => b.gain - a.gain);
    const best = buffs[0];
    if (best && (qualified(best.after, level) || (qualified(before, level) && best.gain > 1)) && useFunction('F05', 1)) {
      g.effects.push({ target: best.target, metric: best.metric, fraction: .25, side: 'npc' });
      note(g, `对手聚焦优化「${designById[best.target].name}」的${metricNames[best.metric]}收益。`);
    }
  }
  if (functionsUsed < 2 && g.npcEnergy >= 1 && g.npcHand.includes('F04')) {
    const livePlans = g.npcPlans.filter(plan => g.npcBoard.every(id => plan.ids.includes(id)));
    const valuable = g.npcHand.filter(id => !!designById[id] && livePlans.some(plan => plan.ids.includes(id))).slice(0, 2);
    if (valuable.length && useFunction('F04', 1)) {
      g.npcRetained = valuable;
      note(g, `对手保留 ${valuable.length} 张后续可用的措施牌。`);
    }
  }
}
export function endTurn(previous: Game): Game {
  if (previous.phase !== 'battle') return previous;
  const g = clone(previous); npcAct(g);
  const level = levels[g.level], p = review(g.playerBoard, g.effects, 'player'), n = review(g.npcBoard, g.effects, 'npc');
  const pOK = qualified(p, level), nOK = qualified(n, level), pScore = score(p, level), nScore = score(n, level);
  g.history.push(`第 ${g.round} 轮：你 ${pScore.toFixed(1)} 分 / ${Object.values(gates(p, level)).filter(Boolean).length} 项达标；对手 ${nScore.toFixed(1)} 分 / ${Object.values(gates(n, level)).filter(Boolean).length} 项达标。`);
  if (pOK || nOK) {
    const won = pOK && (!nOK || pScore > nScore || (pScore === nScore && p.budget < n.budget));
    const tied = pOK && nOK && pScore === nScore && p.budget === n.budget;
    g.phase = tied ? 'draw' : won ? 'victory' : 'defeat';
    g.result = tied ? '双方同时达标，分数与预算相同，平局。' : won ? `你在第 ${g.round} 轮赢得委托。` : `对手在第 ${g.round} 轮先完成委托。`;
    note(g, g.result); return g;
  }
  if (g.round >= g.maxRounds) { g.phase = 'defeat'; g.result = `共 ${g.maxRounds} 轮，双方都未满足全部门槛；本局没有中标方案。`; note(g, g.result); return g; }
  g.effects = []; g.shields = []; g.boostedAttack = false;
  const keep: string[] = [];
  for (const id of g.retained) if (g.hand.filter(x => x === id).length > keep.filter(x => x === id).length) keep.push(id);
  const unretained = [...g.hand]; for (const id of keep) unretained.splice(unretained.indexOf(id), 1);
  g.discard.push(...unretained); g.hand = keep; g.retained = [];
  const npcKeep: string[] = [];
  for (const id of g.npcRetained) if (g.npcHand.filter(x => x === id).length > npcKeep.filter(x => x === id).length) npcKeep.push(id);
  const npcUnretained = [...g.npcHand]; for (const id of npcKeep) npcUnretained.splice(npcUnretained.indexOf(id), 1);
  g.npcDiscard.push(...npcUnretained); g.npcHand = npcKeep; g.npcRetained = [];
  g.round++; g.energy = 3; g.npcEnergy = 3; g.built = false; g.attacked = false; g.functions = 0; g.extraEnergy = 0; g.extraDraw = 0;
  draw(g, 'player', 5); draw(g, 'npc', 5); g.intent = chooseIntent(g);
  note(g, `第 ${g.round} 轮。对手处于 ${g.intent.state} 状态：${g.intent.label}。`);
  return g;
}
