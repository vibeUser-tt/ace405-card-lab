import raw from './gothenburg.json' with { type: 'json' };
export type Factor = 'WWR' | 'WD' | 'GLZ' | 'EW' | 'R' | 'Gnd' | 'VR' | 'HR';
export type Config = Record<Factor, number>;
export type Values = {
    D: number;
    E: number;
    C: number;
};
export const factors: Factor[] = ['WWR', 'WD', 'GLZ', 'EW', 'R', 'Gnd', 'VR', 'HR'];
export const factorNames: Record<Factor, string> = { WWR: '窗墙比', WD: '窗套深度', GLZ: '玻璃', EW: '外墙', R: '屋顶', Gnd: '地面', VR: '新风量', HR: '热回收' };
export const factorRanges: Record<Factor, string> = {
    WWR: '范围 20–40%', WD: '范围 0.50–1.00 m', GLZ: '保温 / 通透',
    EW: '范围 0.150–0.300', R: '范围 0.10–0.20', Gnd: '范围 0.13–0.25',
    VR: '仅 4 / 7 L/s·人', HR: '范围 0–60%',
};
export const turnRules = { energy: 4, maxEnergy: 5, hand: 5, maxHand: 8, extraDraw: 4, extraEnergy: 2, retain: 2 };
export type DesignCard = {
    id: string;
    name: string;
    factor: Factor;
    step?: number;
    set?: number;
    text: string;
    ap: number;
};
export const designs: DesignCard[] = [
    { id: 'W+', name: '加大窗户', factor: 'WWR', step: .5, text: '正面窗墙比 +10%', ap: 2 },
    { id: 'W-', name: '收敛窗面', factor: 'WWR', step: -.5, text: '正面窗墙比 −10%', ap: 2 },
    { id: 'D+', name: '加深窗套', factor: 'WD', step: .5, text: '窗套深度 +0.25 m', ap: 2 },
    { id: 'D-', name: '减浅窗套', factor: 'WD', step: -.5, text: '窗套深度 −0.25 m', ap: 2 },
    { id: 'G+', name: '保温玻璃', factor: 'GLZ', set: 0, text: 'U 0.90 · 太阳得热 50% · 透光率 70%', ap: 2 },
    { id: 'G-', name: '通透玻璃', factor: 'GLZ', set: 1, text: 'U 1.80 · 太阳得热 60% · 透光率 75%', ap: 2 },
    { id: 'E+', name: '保温外墙', factor: 'EW', step: -.5, text: '外墙 U −0.075 W/(m²·K)', ap: 2 },
    { id: 'E-', name: '精简外墙', factor: 'EW', step: .5, text: '外墙 U +0.075 W/(m²·K)', ap: 2 },
    { id: 'R+', name: '保温屋面', factor: 'R', step: -.5, text: '屋顶 U −0.05 W/(m²·K)', ap: 2 },
    { id: 'R-', name: '精简屋面', factor: 'R', step: .5, text: '屋顶 U +0.05 W/(m²·K)', ap: 2 },
    { id: 'B+', name: '保温地面', factor: 'Gnd', step: -.5, text: '地面 U −0.06 W/(m²·K)', ap: 2 },
    { id: 'B-', name: '精简地面', factor: 'Gnd', step: .5, text: '地面 U +0.06 W/(m²·K)', ap: 2 },
    { id: 'V+', name: '调高新风', factor: 'VR', step: -1, text: '每人新风量 +3 L/s', ap: 2 },
    { id: 'V-', name: '调低新风', factor: 'VR', step: 1, text: '每人新风量 −3 L/s', ap: 2 },
    { id: 'H+', name: '增强热回收', factor: 'HR', step: .5, text: '热回收率 +30%', ap: 2 },
    { id: 'H-', name: '减弱热回收', factor: 'HR', step: -.5, text: '热回收率 −30%', ap: 2 },
];
export const canCounterDesign = (card: DesignCard | undefined): boolean => !!card && card.set === undefined && card.step !== undefined;
export const counterDesigns = designs.filter(canCounterDesign);
export const counterFactors = factors.filter(factor => counterDesigns.some(card => card.factor === factor));
export const designById = Object.fromEntries(designs.map(c => [c.id, c])) as Record<string, DesignCard>;
export const functions = [
    { id: 'F01', name: '资料检索', ap: 1, text: '抽 2 张牌。每回合额外抽牌上限 4 张。' },
    { id: 'F02', name: '聚焦筛选', ap: 0, text: '弃 1 张其他手牌，再抽 2 张。' },
    { id: 'F03', name: '短时冲刺', ap: 1, text: '获得 2 点体力。本回合额外体力上限 2 点。' },
    { id: 'F04', name: '保留备选', ap: 0, text: '保留至多 2 张其他手牌到下一回合。' },
    { id: 'F06', name: '针对性干扰', ap: 2, text: '选择削减采光或增加能耗，调整对手可反制参数一档，成本随方案重算。' },
    { id: 'F07', name: '二次施压', ap: 1, text: '本轮下一次参数反制重复作用一次。' },
    { id: 'F08', name: '方案防护', ap: 1, text: '保护一个设计变量，抵挡下一次针对它的反制，持续至下轮开始。' },
];
export const functionById = Object.fromEntries(functions.map(c => [c.id, c]));
export const cards = [...designs, ...functions];
export const cardById = Object.fromEntries(cards.map(c => [c.id, c]));
export const fromVector = (v: number[]) => Object.fromEntries(factors.map((k, i) => [k, v[i]])) as Config;
export const keyOf = (c: Config) => factors.map(k => c[k]).join(',');
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function change(config: Config, card: DesignCard, repeat = 1): Config {
    const value = card.set ?? config[card.factor] + (card.step ?? 0) * repeat;
    return { ...config, [card.factor]: clamp(value) };
}
export function label(k: Factor, v: number): string {
    if (k === 'WWR')
        return `${Number((20 + v * 20).toFixed(1))}%`;
    if (k === 'WD')
        return `${Number((.5 + v * .5).toFixed(2))} m`;
    if (k === 'GLZ')
        return v === 0 ? 'U 0.90 · SHGC 50% · 透光 70%' : 'U 1.80 · SHGC 60% · 透光 75%';
    if (k === 'EW')
        return `U ${(.15 + .15 * v).toFixed(3)}`;
    if (k === 'R')
        return `U ${(.10 + .10 * v).toFixed(2)}`;
    if (k === 'Gnd')
        return `U ${(.13 + .12 * v).toFixed(2)}`;
    if (k === 'VR')
        return `${7 - v * 3} L/s·人`;
    return `${v * 60}%`;
}
export function cost(c: Config): number {
    // Current design cost, not spending history. Glazing scales with window area.
    return Math.round((38 + 12 * c.WWR + (1 - c.GLZ) * (10 + 8 * c.WWR) + 6 * c.WD +
        13 * (1 - c.EW) + 10 * (1 - c.R) + 8 * (1 - c.Gnd) + 5 * (1 - c.VR) + 18 * c.HR) * 10) / 10;
}
const performanceCache = new Map<string, Values>();
export function performance(c: Config): Values {
    const key = keyOf(c), cached = performanceCache.get(key);
    if (cached) return { ...cached };
    if (factors.some(k => !Number.isFinite(c[k]) || c[k] < 0 || c[k] > 1))
        throw Error('Configuration is outside the supported simulation grid');
    // Multilinear interpolation preserves every measured corner and its interactions.
    // Intermediate sDA is an estimate, not a new daylight simulation.
    let D = 0, E = 0;
    function visit(axis: number, index: number, weight: number) {
        if (weight === 0) return;
        if (axis === factors.length) {
            D += raw.rows[index].D * weight;
            E += raw.rows[index].E * weight;
            return;
        }
        const t = c[factors[axis]];
        visit(axis + 1, index * 2, weight * (1 - t));
        visit(axis + 1, index * 2 + 1, weight * t);
    }
    visit(0, 0, 1);
    const result = { D, E, C: cost(c) };
    performanceCache.set(key, result);
    return { ...result };
}
export type Level = {
    id: string;
    name: string;
    focus: keyof Values;
    brief: string;
    initial: Config;
    limits: Values;
    weights: Values;
    rounds: number;
};
export const levels: Level[] = [
    { id: 'daylight', name: '让光进来', focus: 'D', brief: '改善采光，同时守住能耗与预算。', initial: fromVector([0, .5, 0, 1, 1, 1, 0, .5]), limits: { D: 50, E: 155, C: 95 }, weights: { D: .65, E: .20, C: .15 }, rounds: 40 },
    { id: 'energy', name: '温暖而节制', focus: 'E', brief: '减少运行能耗，保留舒适的自然采光。', initial: fromVector([1, 0, 1, 1, 1, 1, 0, .5]), limits: { D: 50, E: 140, C: 105 }, weights: { D: .15, E: .65, C: .20 }, rounds: 32 },
    { id: 'cost', name: '恰到好处', focus: 'C', brief: '优化昂贵的初始方案，在性能底线之上节省成本。', initial: fromVector([1, 0, 0, .5, 0, 0, 0, .5]), limits: { D: 50, E: 145, C: 90 }, weights: { D: .15, E: .25, C: .60 }, rounds: 40 },
];
export function gates(v: Values, l: Level) { return { D: v.D + 1e-6 >= l.limits.D, E: v.E <= l.limits.E + 1e-6, C: v.C <= l.limits.C + 1e-6 }; }
export function qualified(v: Values, l: Level) { return Object.values(gates(v, l)).every(Boolean); }
export function score(v: Values, l: Level) {
    return 100 * (l.weights.D * clamp((v.D - 20) / 50) + l.weights.E * clamp((200 - v.E) / 100) + l.weights.C * clamp((130 - v.C) / 92));
}
export function gap(v: Values, l: Level) { return Math.max(0, l.limits.D - v.D) / 25 + Math.max(0, v.E - l.limits.E) / 45 + Math.max(0, v.C - l.limits.C) / 30; }
export const options = (factor: Factor) => factor === 'GLZ' || factor === 'VR' ? [0, 1] : [0, .5, 1];
export const allConfigs: Config[] = factors.reduce<number[][]>((rows, factor) => rows.flatMap(row => options(factor).map(v => [...row, v])), [[]]).map(fromVector);
export const distance = (a: Config, b: Config) => factors.reduce((s, k) => s + Math.abs(a[k] - b[k]) * (options(k).length - 1), 0);
export const feasible = levels.map(l => allConfigs.filter(c => qualified(performance(c), l)));
export const provenance = raw;
