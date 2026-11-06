import fit from './response-fit.json' with { type: 'json' };
export const factors = ['WWR', 'WD', 'GLZ', 'EW', 'R', 'Gnd', 'VR', 'HR'] as const;
export type Factor = typeof factors[number];
export type Config = Record<Factor, number>;
export type Values = {
    D: number;
    E: number;
};
export const factorNames: Record<Factor, string> = { WWR: '窗墙比', WD: '窗套深度', GLZ: '玻璃', EW: '外墙 U', R: '屋顶 U', Gnd: '地面 U', VR: '新风量', HR: '热回收' };
export const factorRanges: Record<Factor, string> = { WWR: '20–40%', WD: '0.50–1.00 m', GLZ: 'A ↔ B · 三参数联动', EW: '0.150–0.300', R: '0.10–0.20', Gnd: '0.13–0.25', VR: '4–7 L/s·人', HR: '0–60%' };
export const turnRules = { energy: 10, maxEnergy: 14, hand: 4, maxHand: 5, extraDraw: 2, extraEnergy: 4 };
// Integer cards cannot supply 27.5 points to each factor. 27 points per full
// range permits eight complete ranges (216 points) within the 220-point deck.
export const pointStep = 1 / 27;
export const suits = [{ id: 'S', symbol: '♠', name: '黑桃', red: false }, { id: 'H', symbol: '♥', name: '红桃', red: true }, { id: 'C', symbol: '♣', name: '梅花', red: false }, { id: 'D', symbol: '♦', name: '方块', red: true }] as const;
export type Suit = typeof suits[number]['id'];
export type PointCard = {
    id: string;
    name: string;
    rank: number;
    suit: Suit;
    ap: number;
};
export const pointCards: PointCard[] = suits.flatMap(s => Array.from({ length: 10 }, (_, i) => ({ id: s.id + (i + 1), name: s.name + ' ' + (i + 1), rank: i + 1, suit: s.id, ap: i + 1 })));
export const pointById = Object.fromEntries(pointCards.map(c => [c.id, c])) as Record<string, PointCard>;
export const functions = [
    { id: 'F01', name: '资料检索', ap: 1, cost: 1, text: '抽 2 张点数牌；本轮额外抽牌最多 2 张。' },
    { id: 'F02', name: '聚焦筛选', ap: 1, cost: 1, text: '将一张点数牌放到牌库底，再抽一张。' },
    { id: 'F03', name: '短时冲刺', ap: 1, cost: 2, text: '获得 4 体力；每轮最多获得 4 点额外体力。' },
    { id: 'F08', name: '方案防护', ap: 2, cost: 2, text: '暗置保护一个参数，抵挡下一次针对它的反制；不按轮数失效。' }
];
export const functionById = Object.fromEntries(functions.map(c => [c.id, c]));
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const fromVector = (v: number[]) => Object.fromEntries(factors.map((k, i) => [k, v[i]])) as Config;
export const keyOf = (c: Config) => factors.map(k => c[k].toFixed(8)).join(',');
export function change(c: Config, factor: Factor, direction: 1 | -1, points: number): Config {
    return { ...c, [factor]: clamp(c[factor] + direction * points * pointStep) };
}
export function glass(v: number) { return { U: .9 + .9 * v, SHGC: 50 + 10 * v, VT: 70 + 5 * v }; }
export function label(k: Factor, v: number) {
    if (k === 'WWR')
        return (20 + 20 * v).toFixed(1) + '%';
    if (k === 'WD')
        return (.5 + .5 * v).toFixed(2) + ' m';
    if (k === 'GLZ') {
        const g = glass(v);
        return 'U ' + g.U.toFixed(2) + ' · 得热 ' + g.SHGC.toFixed(1) + '% · 透光 ' + g.VT.toFixed(1) + '%';
    }
    if (k === 'VR')
        return (4 + 3 * v).toFixed(2) + ' L/s·人';
    if (k === 'HR')
        return (60 * v).toFixed(1) + '%';
    return 'U ' + (k === 'EW' ? .15 + .15 * v : k === 'R' ? .1 + .1 * v : .13 + .12 * v).toFixed(3);
}
function shape(x: number, p: number) { return p < 0 ? 1 - Math.pow(1 - x, -p) : Math.pow(x, p); }
export function performance(c: Config): Values {
    if (factors.some(k => !Number.isFinite(c[k]) || c[k] < 0 || c[k] > 1))
        throw Error('Invalid configuration');
    const result = { D: 0, E: 0 };
    for (const k of ['D', 'E'] as const) {
        const x = factors.map((f, i) => 2 * shape(c[f], fit.shapes[k][i]) - 1);
        result[k] = fit.models[k].reduce((s, t) => s + t.coefficient * t.axes.reduce((v, i) => v * x[i], 1), 0);
    }
    result.D = clamp(result.D, 0, 100);
    result.E = Math.max(0, result.E);
    return result;
}
export type Level = {
    id: string;
    name: string;
    focus: 'D' | 'E' | 'C';
    brief: string;
    initial: Config;
    limits: Values;
    weights: Values;
};
export const levels: Level[] = [
    { id: 'daylight', name: '让光进来', focus: 'D', brief: '改善采光，同时搭配节能措施。', initial: fromVector([.1, .35, .45, .5, .5, .5, .5, .4]), limits: { D: 54.5, E: 129 }, weights: { D: .75, E: .25 } },
    { id: 'energy', name: '温暖而节制', focus: 'E', brief: '组合节能措施，并兼顾采光。', initial: fromVector([.3, .35, .85, .85, .8, .6, .75, .65]), limits: { D: 55, E: 134 }, weights: { D: .25, E: .75 } },
    { id: 'efficiency', name: '恰到好处', focus: 'C', brief: '同时达到采光与能耗要求，减少往返调整。', initial: fromVector([.2, .45, .8, .75, .7, .6, .65, .55]), limits: { D: 53, E: 138 }, weights: { D: .5, E: .5 } }
];
export const gates = (v: Values, l: Level) => ({ D: v.D + 1e-8 >= l.limits.D, E: v.E <= l.limits.E + 1e-8 });
export const qualified = (v: Values, l: Level) => Object.values(gates(v, l)).every(Boolean);
export const gap = (v: Values, l: Level) => Math.max(0, l.limits.D - v.D) / 30 + Math.max(0, v.E - l.limits.E) / 50;
export const score = (v: Values, l: Level) => 100 * (l.weights.D * clamp((v.D - 20) / 60) + l.weights.E * clamp((200 - v.E) / 100));
export const provenance = fit;
