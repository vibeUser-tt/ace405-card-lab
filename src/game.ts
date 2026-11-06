import { pointById, pointCards, functionById, factors, change, performance, levels, qualified, gap, score, turnRules, factorNames, label, pointStep, clamp } from './model.ts';
import type { Config, Factor, Values } from './model.ts';
export type Side = 'player' | 'npc';
export type Policy = 'random' | 'learner' | 'tactical' | 'opponent' | 'idle';
export const opponentTuning = { guidedChance: .015, attackChance: .12, quietRounds: 2 };
export type Action = {
    kind: 'point' | 'function';
    index: number;
    mode?: 'self' | 'counter';
    factor?: Factor;
    direction?: 1 | -1;
    discard?: number;
};
export type Agent = {
    config: Config;
    hand: string[];
    draw: string[];
    used: string[];
    functionHand: string[];
    functionDraw: string[];
    functionUsed: string[];
    energy: number;
    extraDraw: number;
    extraEnergy: number;
    spent: number;
    hiddenCost: number;
    shield: {
        factor: Factor;
        event: number;
    } | null;
    rng: number;
};
export type Event = {
    round: number;
    side: Side;
    target: Side;
    card: string;
    kind: Action['kind'];
    mode: 'self' | 'counter' | 'function';
    factor?: Factor;
    direction?: 1 | -1;
    points: number;
    cost: number;
    before?: number;
    after?: number;
    beforeValues?: Values;
    afterValues?: Values;
    blocked?: boolean;
    hidden?: boolean;
    revealed?: boolean;
    message: string;
};
export type Game = {
    phase: 'intro' | 'battle' | 'victory' | 'defeat' | 'draw';
    level: number;
    round: number;
    seed: number;
    first: Side;
    npcPolicy: Policy;
    player: Agent;
    npc: Agent;
    events: Event[];
    history: {
        round: number;
        player: Values;
        npc: Values;
        playerCost: number;
        npcCost: number;
    }[];
    npcPlan: Action[];
    winner: Side | null;
    drawReason: string;
};
export const other = (s: Side): Side => s === 'player' ? 'npc' : 'player';
export const deckList = () => pointCards.map(c => c.id);
export const functionDeck = () => ['F08', 'F01', 'F02', 'F03', 'F08', 'F01', 'F02', 'F03', 'F08'];
function random(a: Agent) { a.rng = (Math.imul(a.rng, 1664525) + 1013904223) >>> 0; return a.rng / 4294967296; }
function shuffle(a: Agent, items: string[]) { const result = [...items]; for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(a) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
} return result; }
function fresh(config: Config): Agent { return { config: { ...config }, hand: [], draw: [], used: [], functionHand: [], functionDraw: [], functionUsed: [], energy: turnRules.energy, extraDraw: 0, extraEnergy: 0, spent: 0, hiddenCost: 0, shield: null, rng: 1 }; }
export function initialGame(): Game { return { phase: 'intro', level: 0, round: 1, seed: 1, first: 'player', npcPolicy: 'opponent', player: fresh(levels[0].initial), npc: fresh(levels[0].initial), events: [], history: [], npcPlan: [], winner: null, drawReason: '' }; }
function cloneAgent(a: Agent): Agent { return { ...a, config: { ...a.config }, hand: [...a.hand], draw: [...a.draw], used: [...a.used], functionHand: [...a.functionHand], functionDraw: [...a.functionDraw], functionUsed: [...a.functionUsed], shield: a.shield ? { ...a.shield } : null }; }
function clone(g: Game): Game { return { ...g, player: cloneAgent(g.player), npc: cloneAgent(g.npc), events: [...g.events], history: [...g.history] }; }
export const handSize = (a: Agent) => a.hand.length + a.functionHand.length;
function draw(a: Agent, n: number) { let count = 0; while (n-- > 0 && handSize(a) < turnRules.maxHand && a.draw.length) {
    a.hand.push(a.draw.pop()!);
    count++;
} return count; }
function refill(a: Agent) {
    const retainedFunctions = a.functionHand.length;
    // Separate arrays preserve action indices and targeted search/swap. Sampling
    // by remaining card counts is a uniform mixed draw, not a 50/50 type coin.
    while (handSize(a) < turnRules.hand && a.draw.length + a.functionDraw.length > 0) {
        if (random(a) * (a.draw.length + a.functionDraw.length) < a.draw.length)
            a.hand.push(a.draw.pop()!);
        else
            a.functionHand.push(a.functionDraw.pop()!);
    }
    if (!a.hand.length && a.draw.length) {
        // Prefer a newly drawn function. A retained all-function hand is the
        // only exception to retention: replace one at random, without spending it.
        const start = a.functionHand.length > retainedFunctions ? retainedFunctions : 0;
        const index = start + Math.floor(random(a) * (a.functionHand.length - start));
        const [returned] = a.functionHand.splice(index, 1);
        a.functionDraw.splice(Math.floor(random(a) * (a.functionDraw.length + 1)), 0, returned);
        a.hand.push(a.draw.pop()!);
    }
}
export function publicCost(g: Game, side: Side, viewer: Side = 'player') { return g[side].spent - (g.phase === 'battle' && side !== viewer ? g[side].hiddenCost : 0); }
export function visibleEvents(g: Game, viewer: Side = 'player') { return g.events.filter(e => g.phase !== 'battle' || e.side === viewer || !e.hidden || e.revealed); }
export const remainingPoints = (a: Agent) => [...a.hand, ...a.draw].reduce((s, id) => s + pointById[id].rank, 0);
export function blockReason(g: Game, side: Side, action: Action): string | null {
    if (g.phase !== 'battle')
        return '当前不在对局中';
    const a = g[side];
    if (action.kind === 'point') {
        const c = pointById[a.hand[action.index]];
        if (!c)
            return '请选择点数牌';
        if (!action.factor || !factors.includes(action.factor))
            return '选择一个参数';
        if (action.direction !== 1 && action.direction !== -1)
            return '选择增加或减少';
        if (action.mode !== 'self' && action.mode !== 'counter')
            return '选择自己或对手';
        return a.energy < c.ap ? '体力不足' : null;
    }
    const id = a.functionHand[action.index], c = functionById[id];
    if (!c)
        return '请选择功能牌';
    if (a.energy < c.ap)
        return '体力不足';
    if (id === 'F01' && (!a.draw.length || handSize(a) - 1 >= turnRules.maxHand || a.extraDraw >= turnRules.extraDraw))
        return '无法继续抽牌';
    if (id === 'F02' && (action.discard === undefined || !a.hand[action.discard] || !a.draw.length))
        return '选择一张手牌换到牌库底';
    if (id === 'F03' && (a.extraEnergy >= turnRules.extraEnergy || a.energy >= turnRules.maxEnergy))
        return '本轮无需或无法再补充体力';
    if (id === 'F08' && (!action.factor || !factors.includes(action.factor)))
        return '选择要暗置保护的参数';
    return null;
}
export function playCard(g: Game, side: Side, action: Action): Game {
    if (blockReason(g, side, action))
        return g;
    const n = clone(g), a = n[side], who = side === 'player' ? '你' : '对手';
    const target = action.kind === 'point' && action.mode === 'counter' ? other(side) : side;
    const event: Event = { round: n.round, side, target, card: '', kind: action.kind, mode: action.kind === 'point' ? action.mode! : 'function', points: 0, cost: 0, message: '' };
    if (action.kind === 'point') {
        const [id] = a.hand.splice(action.index, 1), c = pointById[id], v = n[target], factor = action.factor!;
        a.used.push(id);
        a.energy -= c.ap;
        a.spent += c.rank;
        Object.assign(event, { card: id, factor, direction: action.direction, points: c.rank, cost: c.rank, before: v.config[factor], beforeValues: performance(v.config) });
        if (action.mode === 'counter' && v.shield?.factor === factor) {
            event.blocked = true;
            const shieldEvent = v.shield.event;
            n.events[shieldEvent] = { ...n.events[shieldEvent], revealed: true };
            v.hiddenCost -= n.events[shieldEvent].cost;
            v.shield = null;
        }
        else
            v.config = change(v.config, factor, action.direction!, c.rank);
        event.after = v.config[factor];
        event.afterValues = performance(v.config);
        event.message = who + '用 ' + c.rank + ' 点' + (action.mode === 'counter' ? '反制对方' : '调整自身') + factorNames[factor] + '：' + (event.blocked ? '对方在此参数暗置了防护，攻击被抵挡' : label(factor, event.before!) + ' → ' + label(factor, event.after) + (event.before === event.after ? '（已到边界）' : ''));
    }
    else {
        const [id] = a.functionHand.splice(action.index, 1), c = functionById[id];
        a.functionUsed.push(id);
        a.energy -= c.ap;
        a.spent += c.cost;
        Object.assign(event, { card: id, cost: c.cost, message: who + '使用「' + c.name + '」' });
        if (id === 'F01')
            a.extraDraw += draw(a, Math.min(2, turnRules.extraDraw - a.extraDraw));
        if (id === 'F02') {
            const [card] = a.hand.splice(action.discard!, 1);
            a.draw.unshift(card);
            draw(a, 1);
        }
        if (id === 'F03') {
            a.energy = Math.min(turnRules.maxEnergy, a.energy + 4);
            a.extraEnergy += 4;
        }
        if (id === 'F08') {
            a.shield = { factor: action.factor!, event: n.events.length };
            a.hiddenCost += c.cost;
            event.hidden = true;
            event.factor = action.factor;
            event.message = who + '暗置防护：' + factorNames[action.factor!];
        }
    }
    n.events.push(event);
    return n;
}
export function legalActions(g: Game, side: Side): Action[] {
    const a = g[side], actions: Action[] = [];
    a.hand.forEach((id, index) => { if (pointById[id].rank <= a.energy)
        for (const factor of factors)
            for (const direction of [1, -1] as const)
                for (const mode of ['self', 'counter'] as const)
                    actions.push({ kind: 'point', index, mode, factor, direction }); });
    a.functionHand.forEach((id, index) => {
        if (id === 'F08')
            for (const factor of factors)
                actions.push({ kind: 'function', index, factor });
        else if (id === 'F02')
            a.hand.forEach((_, discard) => actions.push({ kind: 'function', index, discard }));
        else
            actions.push({ kind: 'function', index });
    });
    return actions.filter(action => !blockReason(g, side, action));
}
function decisionRandom(g: Game, side: Side) {
    let n = (g.seed ^ Math.imul(g.round, 0x9e3779b9) ^ Math.imul(g.events.filter(e => e.side === side).length + 1, 0x85ebca6b) ^ (side === 'npc' ? 0x51ed270b : 0x165667b1)) >>> 0;
    return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
function utility(v: Values, level: number) { const l = levels[level]; return -gap(v, l) * 100 + (qualified(v, l) ? 20 : 0) + score(v, l) * .025; }
function exploratory(actions: Action[], rand: () => number, attackChance: number) {
    const keys = [...new Set(actions.map(a => a.kind + ':' + a.index))], key = keys[Math.floor(rand() * keys.length)];
    let list = actions.filter(a => a.kind + ':' + a.index === key);
    if (list[0].kind === 'point') {
        const mode = rand() < attackChance ? 'counter' : 'self';
        const preferred = list.filter(a => a.mode === mode);
        list = preferred.length ? preferred : list.filter(a => a.mode === 'self');
    }
    return list[Math.floor(rand() * list.length)] ?? null;
}
export function chooseAction(g: Game, side: Side, policy: Policy = 'opponent'): Action | null {
    if (policy === 'idle')
        return null;
    let actions = legalActions(g, side);
    if (!actions.length)
        return null;
    const a = g[side], enemy = g[other(side)], rand = decisionRandom(g, side);
    const before = performance(a.config), enemyBefore = performance(enemy.config);
    if (qualified(before, levels[g.level]) && policy !== 'tactical')
        return null;
    if (policy === 'random')
        return exploratory(actions, rand, .25);
    if (policy === 'opponent') {
        const attacks = g.round > opponentTuning.quietRounds && rand() < opponentTuning.attackChance;
        actions = actions.filter(x => x.mode !== 'counter' || (attacks && utility(performance(change(enemy.config, x.factor!, x.direction!, pointById[a.hand[x.index]].rank)), g.level) < utility(enemyBefore, g.level) - 1e-8));
        if (rand() >= opponentTuning.guidedChance)
            return exploratory(actions, rand, attacks ? .2 : 0);
    }
    if (policy === 'learner') {
        if (g.round <= 2 || rand() < .45)
            return exploratory(actions, rand, .2);
        // This learner uses only its own observed outcomes, never prospective model output.
        const memory = new Map<Factor, {
            D: number;
            E: number;
        }>();
        for (const e of g.events)
            if (e.side === side && e.kind === 'point' && !e.blocked && e.factor && e.before !== undefined && e.after !== undefined && e.beforeValues && e.afterValues && Math.abs(e.after - e.before) > 1e-9) {
                const dx = e.after - e.before, old = memory.get(e.factor), slope = { D: (e.afterValues.D - e.beforeValues.D) / dx, E: (e.afterValues.E - e.beforeValues.E) / dx };
                memory.set(e.factor, old ? { D: .4 * old.D + .6 * slope.D, E: .4 * old.E + .6 * slope.E } : slope);
            }
        let best: Action | null = null, value = 0;
        for (const x of actions)
            if (x.kind === 'point' && x.mode === 'self') {
                const slope = memory.get(x.factor!);
                if (!slope)
                    continue;
                const owner = x.mode === 'self' ? a : enemy, v = x.mode === 'self' ? before : enemyBefore, p = pointById[a.hand[x.index]].rank;
                const delta = clamp(owner.config[x.factor!] + x.direction! * p * pointStep) - owner.config[x.factor!];
                const predicted = { D: clamp(v.D + slope.D * delta, 0, 100), E: Math.max(0, v.E + slope.E * delta) };
                const gain = (utility(predicted, g.level) - utility(v, g.level)) * (x.mode === 'self' ? 1 : -.55) / p;
                if (gain > value) {
                    value = gain;
                    best = x;
                }
            }
        return best ?? exploratory(actions, rand, .2);
    }
    const alreadyQualified = qualified(before, levels[g.level]);
    let best: Action | null = null, bestValue = .001;
    for (const x of actions) {
        let value = -1;
        if (x.kind === 'point') {
            if (alreadyQualified && x.mode === 'self')
                continue;
            if (x.mode === 'counter' && (enemy.used.length === 40 || gap(enemyBefore, levels[g.level]) > .12 || (alreadyQualified && a.spent <= publicCost(g, other(side), side))))
                continue;
            const p = pointById[a.hand[x.index]].rank, owner = x.mode === 'self' ? a : enemy, v = x.mode === 'self' ? before : enemyBefore;
            const after = performance(change(owner.config, x.factor!, x.direction!, p));
            value = (utility(after, g.level) - utility(v, g.level)) * (x.mode === 'self' ? 1 : -.6) / p;
            // Do not inspect the enemy shield, hand, draw order or hidden expenditure.
            if (x.mode === 'self' && qualified(after, levels[g.level]))
                value += 5 / p;
        }
        else {
            const id = a.functionHand[x.index];
            if (alreadyQualified && (id !== 'F08' || g.round <= 2))
                continue;
            if (id === 'F01')
                value = a.hand.filter(id => pointById[id].rank <= a.energy - 1).length < 2 && a.energy >= 3 ? .15 : -1;
            if (id === 'F02')
                value = pointById[a.hand[x.discard!]].rank > a.energy && a.energy >= 2 ? .12 : -1;
            if (id === 'F03')
                value = a.hand.some(id => pointById[id].rank > a.energy && pointById[id].rank <= a.energy + 3) ? .5 : -1;
            if (id === 'F08' && !a.shield && qualified(before, levels[g.level])) {
                const harmed = performance(change(a.config, x.factor!, a.config[x.factor!] > .5 ? -1 : 1, 6));
                value = Math.max(0, utility(before, g.level) - utility(harmed, g.level)) * .015;
            }
        }
        if (value > bestValue) {
            bestValue = value;
            best = x;
        }
    }
    return best;
}
export function autoTurn(g: Game, side: Side, policy: Policy = 'tactical') {
    let n = g;
    for (let steps = 0; steps < 32; steps++) {
        const x = chooseAction(n, side, policy);
        if (!x)
            return n;
        const next = playCard(n, side, x);
        if (next === n)
            throw Error('Illegal policy action');
        n = next;
    }
    throw Error('Turn did not terminate');
}
function prepareNpc(g: Game) {
    let simulated = clone(g);
    const plan: Action[] = [];
    for (let i = 0; i < 32; i++) {
        const x = chooseAction(simulated, 'npc', g.npcPolicy);
        if (!x)
            break;
        plan.push(x);
        simulated = playCard(simulated, 'npc', x);
        if (i === 31)
            throw Error('NPC planning loop');
    }
    g.npcPlan = plan;
}
function executeNpc(g: Game) { let n = g; for (const x of n.npcPlan)
    n = playCard(n, 'npc', x); return n; }
export function beginRun(level = 0, seed = Date.now(), first: Side = 'player', npcPolicy: Policy = 'opponent') {
    let g = initialGame();
    g.level = level;
    g.seed = seed >>> 0;
    g.phase = 'battle';
    g.first = first;
    g.npcPolicy = npcPolicy;
    for (const side of ['player', 'npc'] as Side[]) {
        const a = fresh(levels[level].initial);
        a.rng = (Math.imul(seed >>> 0, 2654435761) ^ (side === 'npc' ? 0x9e3779b9 : 0x12345678)) >>> 0;
        a.draw = shuffle(a, deckList());
        a.functionDraw = shuffle(a, functionDeck());
        refill(a);
        g[side] = a;
    }
    prepareNpc(g);
    if (first === 'npc')
        g = executeNpc(g);
    return g;
}
export function endTurn(g: Game): Game {
    if (g.phase !== 'battle')
        return g;
    let n = clone(g);
    if (n.first === 'player')
        n = executeNpc(n);
    const l = levels[n.level], p = performance(n.player.config), o = performance(n.npc.config);
    n.history.push({ round: n.round, player: p, npc: o, playerCost: n.player.spent, npcCost: publicCost(n, 'npc') });
    const pOK = qualified(p, l), nOK = qualified(o, l);
    if (pOK || nOK) {
        const difference = n.npc.spent - n.player.spent;
        const tie = score(p, l) - score(o, l);
        if (pOK && nOK && difference === 0 && Math.abs(tie) < 1e-8) {
            n.phase = 'draw';
            n.drawReason = '双方达标，投入和综合表现相同';
        }
        else {
            const win = pOK && (!nOK || difference > 0 || (difference === 0 && tie > 0));
            n.phase = win ? 'victory' : 'defeat';
            n.winner = win ? 'player' : 'npc';
        }
        return n;
    }
    if (remainingPoints(n.player) === 0 && remainingPoints(n.npc) === 0) {
        n.phase = 'draw';
        n.drawReason = '双方点数资源耗尽，均未达标';
        return n;
    }
    n.round++;
    for (const side of ['player', 'npc'] as Side[]) {
        const a = n[side];
        a.energy = turnRules.energy;
        a.extraDraw = 0;
        a.extraEnergy = 0;
        refill(a);
    }
    prepareNpc(n);
    if (n.first === 'npc')
        n = executeNpc(n);
    return n;
}
