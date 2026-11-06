import type { Event } from './game';

export const playTiming = {
    launch: 240, arrival: 700, parameterEnd: 1360,
    particleTravel: 620, particleSpread: 400, metricStart: 1980,
    particleEnd: 2380, metricEnd: 2780, end: 2940,
};

export function particleProgress(time: number) {
    const t = Math.max(0, Math.min(1, time));
    return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Compare relative changes, not the incompatible sDA and energy units.
export function metricParticles(event: Event) {
    const a = event.beforeValues, b = event.afterValues;
    if (!a || !b || event.blocked || event.before === event.after) return [];
    const impacts = (['D', 'E'] as const).map(metric => {
        const delta = b[metric] - a[metric];
        return { metric, delta, relative: Math.abs(delta) / Math.max(Math.abs(a[metric]), 1e-8),
            improved: metric === 'D' ? delta > 0 : delta < 0 };
    }).filter(impact => Math.abs(impact.delta) > 1e-8);
    const total = impacts.reduce((sum, impact) => sum + impact.relative, 0);
    // A finite shared budget keeps small and large changes readable. Preserve
    // one particle for a nonzero minority contribution; zero gets none.
    const first = impacts.length === 2 ? Math.max(1, Math.min(35, Math.round(36 * impacts[0].relative / total))) : 36;
    return impacts.map((impact, index) => ({ ...impact, count: index === 0 ? first : 36 - first }));
}

export function feedbackEnd(event: Event) {
    return metricParticles(event).length ? playTiming.end : 1800;
}
