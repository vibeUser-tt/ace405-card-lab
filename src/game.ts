import { cardById, designById, designs, canCounterDesign, counterDesigns, counterFactors, change, performance, levels, score, gap, qualified, feasible, distance, keyOf, label, factorNames, turnRules } from './model.ts';
import type { Config, Factor, Values, DesignCard } from './model.ts';
export type Side = 'player' | 'npc';
export type Mode = 'self' | 'counter' | 'function';
export type Policy = 'random' | 'greedy' | 'planner' | 'tactical' | 'learner' | 'opponent' | 'idle';
export const opponentTuning = { guidedChance: .04, attackChance: .12, quietRounds: 2 };
export type Agent = {
    config: Config;
    hand: string[];
    draw: string[];
    discard: string[];
    energy: number;
    extraDraw: number;
    extraEnergy: number;
    retained: number[];
    shield: Factor | null;
    amplified: boolean;
    rng: number;
};
export type Event = {
    round: number;
    side: Side;
    card: string;
    mode: Mode;
    target: Side;
    factor?: Factor;
    before?: number;
    after?: number;
    blocked?: boolean;
    beforeValues?: Values;
    afterValues?: Values;
    parameterCard?: string;
    message: string;
};
export type Game = {
    phase: 'intro' | 'battle' | 'victory' | 'defeat' | 'draw' | 'timeout';
    level: number;
    round: number;
    seed: number;
    player: Agent;
    npc: Agent;
    events: Event[];
    history: {
        round: number;
        player: ReturnType<typeof performance>;
        npc: ReturnType<typeof performance>;
    }[];
    intent: string;
    npcPlan: Action[];
    winner: Side | null;
};
export type Action = {
    index: number;
    mode: Mode;
    factor?: Factor;
    metric?: 'D' | 'E';
    discard?: number;
    retain?: number[];
};
export const other = (s: Side): Side => s === 'player' ? 'npc' : 'player';
function random(g: Agent) { g.rng = (Math.imul(g.rng, 1664525) + 1013904223) >>> 0; return g.rng / 4294967296; }
function shuffle(g: Agent, items: string[]) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
export const deckList = () => [...designs.map(c => c.id), 'H+', 'H-', 'F01', 'F02', 'F02', 'F03', 'F04', 'F06', 'F07', 'F08'];
function fresh(config: Config): Agent { return { config: { ...config }, hand: [], draw: [], discard: [], energy: turnRules.energy, extraDraw: 0, extraEnergy: 0, retained: [], shield: null, amplified: false, rng: 1 }; }
export function initialGame(): Game { return { phase: 'intro', level: 0, round: 1, seed: 1, player: fresh(levels[0].initial), npc: fresh(levels[0].initial), events: [], history: [], intent: '', npcPlan: [], winner: null }; }
function draw(g: Game, side: Side, n: number) { const a = g[side]; for (let i = 0; i < n && a.hand.length < turnRules.maxHand; i++) {
    if (!a.draw.length) {
        a.draw = shuffle(a, a.discard);
        a.discard = [];
    }
    const id = a.draw.pop();
    if (!id)
        break;
    a.hand.push(id);
} }
export function beginRun(level = 0, seed = Date.now()): Game {
    const g = initialGame();
    g.level = level;
    g.seed = seed >>> 0;
    g.phase = 'battle';
    for (const side of ['player', 'npc'] as Side[]) {
        g[side] = fresh(levels[level].initial);
        g[side].rng = (Math.imul(seed >>> 0, 2654435761) ^ (side === 'npc' ? 0x9e3779b9 : 0x12345678)) >>> 0;
        g[side].draw = shuffle(g[side], deckList());
        draw(g, side, turnRules.hand);
    }
    prepareNpc(g);
    return g;
}
const clone = (g: Game): Game => ({ ...g, player: cloneAgent(g.player), npc: cloneAgent(g.npc), events: [...g.events], history: [...g.history] });
const cloneAgent = (a: Agent): Agent => ({ ...a, config: { ...a.config }, hand: [...a.hand], draw: [...a.draw], discard: [...a.discard], retained: [...a.retained] });
export function blockReason(g: Game, side: Side, action: Action): string | null {
    const a = g[side], id = a.hand[action.index], c = cardById[id];
    if (g.phase !== 'battle')
        return '当前不在设计回合';
    if (!c)
        return '请选择手牌';
    if (designById[id]) {
        if (action.mode === 'function')
            return '请选择自己或对手';
        if (action.mode === 'counter' && !canCounterDesign(designById[id]))
            return '成套方案只能用于自己';
        if (a.energy < c.ap)
            return '体力不足';
        return null; // Over-budget designs and bounded no-ops are deliberately legal.
    }
    if (action.mode !== 'function')
        return '这是功能牌';
    if (a.energy < c.ap)
        return '体力不足';
    if ((id === 'F01' || id === 'F02') && a.extraDraw >= turnRules.extraDraw)
        return '额外抽牌已达上限';
    if (id === 'F02' && (action.discard === undefined || action.discard === action.index || !a.hand[action.discard]))
        return '请选择另一张手牌弃置';
    if (id === 'F03' && (a.extraEnergy >= turnRules.extraEnergy || a.energy >= turnRules.maxEnergy))
        return '本回合体力增补已达上限';
    if (id === 'F04' && (!action.retain?.length || action.retain.length > turnRules.retain || new Set(action.retain).size !== action.retain.length || action.retain.some(i => i === action.index || !a.hand[i])))
        return '请选择 1–2 张其他手牌保留';
    if (id === 'F06' && action.metric !== 'D' && action.metric !== 'E')
        return '请选择削减采光或增加能耗';
    if (id === 'F07' && (a.amplified || !a.hand.some(x => (canCounterDesign(designById[x]) || x === 'F06') && a.energy >= c.ap + cardById[x].ap)))
        return '需要另一张参数反制牌及强化后反制所需体力';
    if (id === 'F08' && (!action.factor || !counterFactors.includes(action.factor)))
        return '请选择可能受到反制的变量';
    return null;
}
function remove(a: Agent, index: number) { const [id] = a.hand.splice(index, 1); a.discard.push(id); a.retained = a.retained.filter(i => i !== index).map(i => i > index ? i - 1 : i); return id; }
export function interference(config: Config, metric: 'D' | 'E', repeat = 1): DesignCard | null {
    const before = performance(config)[metric];
    let best: DesignCard | null = null, damage = 1e-8;
    for (const card of counterDesigns) {
        const after = performance(change(config, card, repeat))[metric];
        const delta = metric === 'D' ? before - after : after - before;
        if (delta > damage) { damage = delta; best = card; }
    }
    return best;
}
function applyParameter(g: Game, side: Side, target: Side, card: DesignCard, attack: boolean, event: Event) {
    const a = g[side], victim = g[target];
    event.factor = card.factor;
    event.parameterCard = card.id;
    event.before = victim.config[card.factor];
    event.beforeValues = performance(victim.config);
    if (attack && victim.shield === card.factor) {
        event.blocked = true;
        victim.shield = null;
    } else victim.config = change(victim.config, card, attack && a.amplified ? 2 : 1);
    if (attack) a.amplified = false;
    event.after = victim.config[card.factor];
    event.afterValues = performance(victim.config);
    return event.blocked ? '被防护挡住' : `${factorNames[card.factor]} ${label(card.factor, event.before)} → ${label(card.factor, event.after)}${event.before === event.after ? '（状态不变）' : ''}`;
}
export function playCard(g: Game, side: Side, action: Action): Game {
    if (blockReason(g, side, action))
        return g;
    const n = clone(g), a = n[side], id = a.hand[action.index], c = designById[id];
    const target = action.mode === 'counter' || id === 'F06' ? other(side) : side;
    const who = side === 'player' ? '你' : '对手';
    const event: Event = { round: n.round, side, card: id, mode: action.mode, target, message: '' };
    if (c) {
        a.energy -= c.ap;
        event.message = `${who}${action.mode === 'counter' ? '向对方使用' : '使用'}「${c.name}」：${applyParameter(n, side, target, c, action.mode === 'counter', event)}`;
        remove(a, action.index);
    }
    else {
        a.energy -= cardById[id].ap;
        if (id === 'F04')
            a.retained = [...new Set([...a.retained, ...action.retain!])].slice(0, turnRules.retain);
        remove(a, action.index);
        if (id === 'F02') {
            const di = action.discard! - (action.discard! > action.index ? 1 : 0);
            remove(a, di);
        }
        if (id === 'F01' || id === 'F02') {
            const count = Math.min(2, turnRules.extraDraw - a.extraDraw);
            const before = a.hand.length;
            draw(n, side, count);
            a.extraDraw += a.hand.length - before;
        }
        if (id === 'F03') {
            a.energy = Math.min(turnRules.maxEnergy, a.energy + 2);
            a.extraEnergy += 2;
        }
        if (id === 'F06') {
            const adjustment = interference(n[target].config, action.metric!, a.amplified ? 2 : 1);
            const goal = action.metric === 'D' ? '削减采光' : '增加能耗';
            event.beforeValues = performance(n[target].config);
            event.message = `${who}使用「针对性干扰」${goal}：${adjustment ? applyParameter(n, side, target, adjustment, true, event) : '相关参数已达边界，状态不变'}`;
            event.afterValues = performance(n[target].config);
            a.amplified = false;
        }
        if (id === 'F07')
            a.amplified = true;
        if (id === 'F08')
            a.shield = action.factor!;
        if (id !== 'F06') event.message = `${who}使用「${cardById[id].name}」${id === 'F08' ? `：保护${factorNames[action.factor!]}` : ''}`;
    }
    n.events.push(event);
    return n;
}
// Goals are calculated from the same simulation/cost model as the player. No hidden opponent cards are read.
const goalCache = new Map<string, number>();
export function potential(c: Config, level: number, policy: Policy = 'planner'): number {
    const l = levels[level], v = performance(c);
    if (policy === 'greedy')
        return -gap(v, l) * 35 + score(v, l) * .18 + (qualified(v, l) ? 20 : 0);
    const key = `${level}:${keyOf(c)}`;
    let p = goalCache.get(key);
    if (p === undefined) {
        const best = Math.min(...feasible[level].map(goal => distance(c, goal) - score(performance(goal), l) * .006));
        p = -best * 9 - gap(v, l) * 16 + score(v, l) * .12 + (qualified(v, l) ? 24 : 0);
        goalCache.set(key, p);
    }
    return p;
}
function handValue(g: Game, side: Side, id: string, policy: Policy): number {
    const c = designById[id];
    if (!c)
        return id === 'F02' ? 8 : id === 'F03' ? 5 : 2;
    const a = g[side], b = g[other(side)];
    return Math.max(potential(change(a.config, c), g.level, policy) - potential(a.config, g.level, policy), canCounterDesign(c) ? (potential(b.config, g.level, policy) - potential(change(b.config, c), g.level, policy)) * .6 : 0);
}
// Estimate the opportunity cost of spending stamina on a function using only
// cards already in hand. Actual gains are recalculated after every played card.
function handOpportunity(moves: { index: number; value: number; cost: number }[], energy: number, exclude = -1) {
    const values = Array(Math.max(0, energy) + 1).fill(0) as number[];
    for (const move of moves) {
        if (move.index === exclude || move.value <= 0) continue;
        for (let budget = energy; budget >= move.cost; budget--)
            values[budget] = Math.max(values[budget], values[budget - move.cost] + move.value);
    }
    return values[Math.max(0, energy)];
}
export function legalActions(g: Game, side: Side): Action[] {
    const a = g[side], result: Action[] = [];
    a.hand.forEach((id, index) => {
        if (designById[id])
            for (const mode of (canCounterDesign(designById[id]) ? ['self', 'counter'] : ['self']) as Mode[])
                result.push({ index, mode });
        else if (id === 'F02')
            a.hand.forEach((_, discard) => { if (discard !== index)
                result.push({ index, mode: 'function', discard }); });
        else if (id === 'F04')
            a.hand.forEach((_, i) => { if (i !== index)
                result.push({ index, mode: 'function', retain: [i] }); });
        else if (id === 'F08')
            for (const factor of counterFactors)
                result.push({ index, mode: 'function', factor });
        else if (id === 'F06')
            for (const metric of ['D', 'E'] as const)
                result.push({ index, mode: 'function', metric });
        else
            result.push({ index, mode: 'function' });
    });
    return result.filter(action => !blockReason(g, side, action));
}
// Decision randomness is independent of either shuffled deck. Each decision has
// a reproducible stream; asking for a recommendation does not mutate game state.
function decisionRandom(g: Game, side: Side, salt = 0) {
    let state = (g.seed ^ salt ^ Math.imul(g.round, 0x9e3779b9) ^ Math.imul(g.events.filter(e => e.side === side).length + 1, 0x85ebca6b) ^ (side === 'npc' ? 0x27d4eb2f : 0x165667b1)) >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function noviceAction(g: Game, side: Side, policy: 'random' | 'learner', canAttack = true): Action | null {
    const a = g[side], enemy = g[other(side)], l = levels[g.level], roll = decisionRandom(g, side);
    const actions = legalActions(g, side).filter(x => {
        const attack = x.mode === 'counter' || a.hand[x.index] === 'F06';
        if (!attack) return true;
        if (!canAttack) return false;
        if (side !== 'npc') return true;
        // The introductory opponent may experiment on its own building, but
        // does not intentionally improve the player's project when attacking.
        const c = designById[a.hand[x.index]] ?? interference(enemy.config, x.metric!, a.amplified ? 2 : 1);
        if (!c || enemy.shield === c.factor) return false;
        const after = change(enemy.config, c, a.amplified ? 2 : 1);
        if (!qualified(performance(enemy.config), l) && qualified(performance(after), l)) return false;
        return potential(after, g.level, 'greedy') < potential(enemy.config, g.level, 'greedy') - .05;
    });
    const blind = () => {
        const indices = [...new Set(actions.map(x => x.index))];
        if (!indices.length) return null;
        const index = indices[Math.floor(roll() * indices.length)];
        let candidates = actions.filter(x => x.index === index);
        if (designById[a.hand[index]]) {
            const mode = roll() < .7 ? 'self' : 'counter';
            if (candidates.some(x => x.mode === mode)) candidates = candidates.filter(x => x.mode === mode);
        }
        return candidates[Math.floor(roll() * candidates.length)];
    };
    if (policy === 'random' || g.round <= 2) return blind();
    // A learning player only estimates outcomes from changes already observed
    // from their own trials, never from a simulated future configuration. Seeing
    // a positive card does not immediately teach its unseen inverse counterpart.
    const memory = new Map<string, { n: number; delta: Values }>();
    for (const e of g.events) {
        if (e.side !== side || !e.parameterCard || !e.factor || !e.beforeValues || !e.afterValues || e.before === undefined || e.after === undefined || e.before === e.after) continue;
        const m = memory.get(e.parameterCard) ?? { n: 0, delta: { D: 0, E: 0, C: 0 } };
        m.n++;
        for (const k of ['D', 'E', 'C'] as const) m.delta[k] += (e.afterValues[k] - e.beforeValues[k]) / (e.after - e.before);
        memory.set(e.parameterCard, m);
    }
    if (roll() < Math.max(.4, .8 - memory.size * .04)) return blind();
    const utility = (v: Values) => -gap(v, l) * 35 + score(v, l) * .18 + (qualified(v, l) ? 20 : 0);
    const estimate = (card: DesignCard, target: Agent, repeat = 1): number | null => {
        const delta = change(target.config, card, repeat)[card.factor] - target.config[card.factor];
        if (!delta) return 0;
        const m = memory.get(card.id);
        if (!m) return null;
        const before = performance(target.config), after = { ...before };
        for (const k of ['D', 'E', 'C'] as const) after[k] += m.delta[k] / m.n * delta;
        return utility(after) - utility(before);
    };
    const valueOfCard = (id: string) => designById[id] ? Math.max(estimate(designById[id], a) ?? 1, canCounterDesign(designById[id]) ? -(estimate(designById[id], enemy) ?? 0) * .6 : 0) : 1;
    const moves = a.hand.flatMap((id, index) => designById[id] || id === 'F06' ? [{ index, cost: cardById[id].ap, value: id === 'F06' ? 2 : valueOfCard(id) }] : []);
    const opportunity = (energy: number, exclude = -1) => handOpportunity(moves, energy, exclude);
    let best: Action | null = null, bestValue = .05;
    for (const action of actions) {
        const id = a.hand[action.index], card = designById[id];
        let value = -1;
        if (card) {
            const predicted = estimate(card, action.mode === 'self' ? a : enemy, action.mode === 'counter' && a.amplified ? 2 : 1);
            value = predicted === null ? .8 : action.mode === 'self' ? predicted : enemy.shield === card.factor ? -1 : -predicted * .65;
        } else if (id === 'F02') value = 2 - valueOfCard(a.hand[action.discard!]);
        else if (id === 'F01') value = a.energy >= cardById[id].ap + designs[0].ap ? 1 - (opportunity(a.energy) - opportunity(a.energy - cardById[id].ap)) : -1;
        else if (id === 'F03') value = opportunity(Math.min(turnRules.maxEnergy, a.energy + 1)) - opportunity(a.energy) + (a.hand.some(x => x !== 'F03' && cardById[x].ap === 1) ? .3 : 0);
        else if (id === 'F04') value = a.retained.length < turnRules.retain && a.energy < (cardById[a.hand[action.retain![0]]].ap || designs[0].ap) && !a.retained.includes(action.retain![0]) ? valueOfCard(a.hand[action.retain![0]]) * .4 : -1;
        else if (id === 'F06') value = action.metric === l.focus ? 3 : 1;
        else if (id === 'F08') value = a.shield !== action.factor && designs.some(c => c.factor === action.factor && memory.has(c.id)) ? .4 - (opportunity(a.energy) - opportunity(a.energy - cardById[id].ap)) : -1;
        else if (id === 'F07') {
            const gain = Math.max(0, ...a.hand.filter(x => canCounterDesign(designById[x])).map(x => (estimate(designById[x], enemy) ?? 0) - (estimate(designById[x], enemy, 2) ?? 0)));
            value = gain * .65 - (opportunity(a.energy) - opportunity(a.energy - cardById[id].ap));
        }
        if (value > bestValue) { bestValue = value; best = action; }
    }
    return best;
}
export function chooseAction(g: Game, side: Side, policy: Policy = 'tactical'): Action | null {
    if (policy === 'idle') return null;
    if (policy === 'random' || policy === 'learner') return noviceAction(g, side, policy);
    if (policy === 'opponent') {
        const roll = decisionRandom(g, side, 0x51ed270b);
        const canAttack = g.round > opponentTuning.quietRounds && roll() < opponentTuning.attackChance;
        const guided = roll() < opponentTuning.guidedChance;
        const candidate = guided ? chooseAction(g, side, canAttack ? 'tactical' : 'greedy') : noviceAction(g, side, 'random', canAttack);
        return candidate;
    }
    const a = g[side], enemy = g[other(side)];
    const selfBefore = potential(a.config, g.level, policy), enemyBefore = potential(enemy.config, g.level, policy);
    const actions = legalActions(g, side);
    const selfValue = (c: DesignCard) => potential(change(a.config, c), g.level, policy) - selfBefore;
    const attackValue = (c: DesignCard | null, repeat = a.amplified ? 2 : 1) => policy !== 'tactical' || !c || !canCounterDesign(c) || enemy.shield === c.factor ? 0 : (enemyBefore - potential(change(enemy.config, c, repeat), g.level, policy)) * .72;
    const moves = a.hand.flatMap((id, index) => {
        const c = designById[id];
        if (c) return [{ index, cost: c.ap, value: Math.max(0, selfValue(c), attackValue(c)) }];
        if (id === 'F06') return [{ index, cost: cardById[id].ap, value: Math.max(0, ...(['D', 'E'] as const).map(metric => attackValue(interference(enemy.config, metric, a.amplified ? 2 : 1)))) }];
        return [];
    });
    const opportunity = (energy: number, exclude = -1) => handOpportunity(moves, energy, exclude);
    const shieldRisk = (factor: Factor | null) => factor ? Math.max(0, ...counterDesigns.filter(c => c.factor === factor).map(c => selfBefore - potential(change(a.config, c), g.level, policy))) : 0;
    let best: Action | null = null, bestValue = .12;
    for (const action of actions) {
        const id = a.hand[action.index], c = designById[id];
        let value = -1;
        if (c) {
            value = action.mode === 'self' ? selfValue(c) : attackValue(c);
        }
        else if (id === 'F01' || id === 'F02') {
            const usable = moves.filter(m => m.value > .2).length;
            value = usable < Math.floor(a.energy / designs[0].ap) ? 6 : .2;
            if (id === 'F02') value += 1 - Math.max(0, handValue(g, side, a.hand[action.discard!], policy));
            else {
                value -= opportunity(a.energy) - opportunity(a.energy - cardById[id].ap);
                if (a.energy - cardById[id].ap < designs[0].ap && !a.hand.includes('F03')) value = -1;
            }
        }
        else if (id === 'F03') {
            value = opportunity(Math.min(turnRules.maxEnergy, a.energy + 1)) - opportunity(a.energy) + (a.hand.some(x => x !== 'F03' && cardById[x].ap === 1) ? .5 : 0);
        }
        else if (id === 'F04') {
            const index = action.retain![0], retainedCard = a.hand[index];
            value = a.retained.length < turnRules.retain && a.energy < (cardById[retainedCard].ap || designs[0].ap) && !a.retained.includes(index) ? Math.max(0, handValue(g, side, retainedCard, policy)) * .5 : -1;
        }
        else if (id === 'F06' && policy === 'tactical') {
            const adjustment = interference(enemy.config, action.metric!, a.amplified ? 2 : 1);
            value = attackValue(adjustment);
        }
        else if (id === 'F07' && policy === 'tactical') {
            const options = [...a.hand.filter(x => canCounterDesign(designById[x])).map(x => designById[x]), ...(a.hand.includes('F06') ? (['D', 'E'] as const).map(metric => interference(enemy.config, metric, 2)).filter((c): c is DesignCard => !!c) : [])];
            const extraDamage = Math.max(0, ...options.map(c => attackValue(c, 2) - attackValue(c, 1)));
            value = extraDamage - (opportunity(a.energy) - opportunity(a.energy - cardById[id].ap));
        }
        else if (id === 'F08' && policy === 'tactical') {
            value = a.shield === action.factor ? -1 : (shieldRisk(action.factor!) - shieldRisk(a.shield)) * .55 - (opportunity(a.energy) - opportunity(a.energy - cardById[id].ap));
        }
        if (value > bestValue) {
            bestValue = value;
            best = action;
        }
    }
    return best;
}
export function autoTurn(g: Game, side: Side, policy: Policy = 'tactical'): Game {
    let n = g;
    // Every play consumes a card; extra draws are bounded. This naturally ends
    // even with zero-cost functions, without a hidden action-count limit.
    while (true) {
        const action = chooseAction(n, side, policy);
        if (!action)
            break;
        const next = playCard(n, side, action);
        if (next === n)
            break;
        n = next;
    }
    return n;
}
function prepareNpc(g: Game) {
    let simulated = clone(g);
    simulated.npc.shield = null;
    const plan: Action[] = [], messages: string[] = [];
    let visible = true;
    while (true) {
        const action = chooseAction(simulated, 'npc', 'opponent');
        if (!action)
            break;
        const id = simulated.npc.hand[action.index];
        plan.push(action);
        if (visible)
            messages.push(`${action.mode === 'counter' ? '反制你' : action.mode === 'self' ? '调整自身' : '策略'}：${cardById[id].name}`);
        if (visible && (id === 'F01' || id === 'F02')) {
            visible = false;
            messages.push('随后视抽牌继续调整');
        }
        simulated = playCard(simulated, 'npc', action);
    }
    g.npcPlan = plan;
    g.intent = messages.join(' → ') || '等待新的设计机会';
}
export function bidScore(g: Game, side: Side) { return score(performance(g[side].config), levels[g.level]); }
export function endTurn(g: Game): Game {
    if (g.phase !== 'battle')
        return g;
    let n = clone(g);
    n.npc.shield = null;
    // Commit before the player's turn: the NPC cannot react to the player's final move.
    for (const action of n.npcPlan)
        n = playCard(n, 'npc', action);
    const l = levels[n.level], p = performance(n.player.config), o = performance(n.npc.config);
    n.history.push({ round: n.round, player: p, npc: o });
    const pOK = qualified(p, l), nOK = qualified(o, l);
    if (pOK || nOK) {
        const diff = bidScore(n, 'player') - bidScore(n, 'npc');
        if (pOK && nOK && Math.abs(diff) < 1e-6 && p.C === o.C)
            n.phase = 'draw';
        else {
            const win = pOK && (!nOK || diff > 1e-6 || (Math.abs(diff) < 1e-6 && p.C < o.C));
            n.phase = win ? 'victory' : 'defeat';
            n.winner = win ? 'player' : 'npc';
        }
        return n;
    }
    if (n.round >= l.rounds) {
        n.phase = 'timeout';
        return n;
    }
    n.round++;
    for (const side of ['player', 'npc'] as Side[]) {
        const a = n[side], keep = a.hand.filter((_, i) => a.retained.includes(i));
        a.discard.push(...a.hand.filter((_, i) => !a.retained.includes(i)));
        a.hand = keep;
        Object.assign(a, { energy: turnRules.energy, extraDraw: 0, extraEnergy: 0, retained: [], amplified: false });
        if (side === 'player')
            a.shield = null;
        draw(n, side, turnRules.hand - a.hand.length);
    }
    prepareNpc(n);
    return n;
}
