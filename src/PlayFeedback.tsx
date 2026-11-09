import { t } from './locale.ts';
import { useEffect, useRef, useState } from 'react';
import type { Event, Side } from './game';
import type { Factor, Values } from './model';
import { pointById, suits } from './model';
import { previewRows } from './ParameterPreview';
import type { Preview } from './ParameterPreview';
import { playTiming, metricParticles, feedbackEnd, particleProgress } from './feedback';
export { playTiming } from './feedback';

export type PlayAnimation = {
    id: number; event: Event; preview: Preview; elapsed: number; reduced: boolean;
    origin: { x: number; y: number };
};
export function tweenProgress(elapsed: number, start: number, end: number) {
    const t = Math.max(0, Math.min(1, (elapsed - start) / (end - start)));
    return 1 - Math.pow(1 - t, 3);
}
export function parameterValue(animation: PlayAnimation | null, side: Side, factor: Factor, value: number) {
    if (!animation || animation.event.target !== side || animation.event.factor !== factor || animation.reduced) return value;
    const e = animation.event;
    return e.before! + (e.after! - e.before!) * tweenProgress(animation.elapsed, playTiming.arrival, playTiming.parameterEnd);
}
export function metricValues(animation: PlayAnimation | null, side: Side, values: Values): Values {
    if (!animation || animation.event.target !== side || animation.reduced) return values;
    const { beforeValues: a, afterValues: b } = animation.event;
    if (!a || !b) return values;
    const p = tweenProgress(animation.elapsed, playTiming.metricStart, playTiming.metricEnd);
    return { D: a.D + (b.D - a.D) * p, E: a.E + (b.E - a.E) * p };
}

export function gateValues(animation: PlayAnimation | null, side: Side, values: Values): Values {
    if (animation && animation.event.target === side && !animation.reduced && animation.elapsed < playTiming.metricEnd)
        return animation.event.beforeValues ?? values;
    return values;
}

export function feedbackStage(animation: PlayAnimation) {
    if (animation.reduced) return 'settled';
    const t = animation.elapsed;
    return t < playTiming.launch ? 'launch' : t < playTiming.arrival ? 'flight' : t < playTiming.parameterEnd ? 'parameter'
        : t < playTiming.metricStart ? 'particles' : t < playTiming.metricEnd ? 'metrics' : 'settled';
}

export function usePlayFeedback() {
    const [animation, setAnimation] = useState<PlayAnimation | null>(null), serial = useRef(0);
    const id = animation?.id;
    useEffect(() => {
        if (!animation) return;
        const initial = animation, start = performance.now(), end = initial.reduced ? 700 : feedbackEnd(initial.event);
        let frame = 0;
        const tick = () => {
            const elapsed = performance.now() - start;
            if (elapsed >= end) { setAnimation(null); return; }
            setAnimation({ ...initial, elapsed }); frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        const settle = () => { cancelAnimationFrame(frame); setAnimation(null); };
        const motion = matchMedia('(prefers-reduced-motion: reduce)');
        window.addEventListener('resize', settle);
        motion.addEventListener('change', settle);
        return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', settle); motion.removeEventListener('change', settle); };
    }, [id]);
    const start = (event: Event, preview: Preview) => {
        const target = document.querySelector<HTMLElement>('.' + event.target + ' [data-factor="' + event.factor + '"]');
        const bounds = target?.getBoundingClientRect();
        if (bounds && (bounds.top < 50 || bounds.bottom > innerHeight)) target?.scrollIntoView({ block: 'center', behavior: 'instant' });
        const source = (event.side === 'npc' ? document.querySelector('.opponent-card') : null) ?? document.querySelector('.model-preview [data-direction="' + event.direction + '"] .preview-values') ?? document.querySelector('.model-preview .preview-values') ?? document.querySelector('.model-preview');
        const box = source?.getBoundingClientRect();
        setAnimation({ id: ++serial.current, event, preview, elapsed: 0, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
            origin: { x: (box ? box.left + box.width / 2 : innerWidth / 2) + scrollX, y: (box ? box.top + box.height / 2 : innerHeight / 3) + scrollY } });
    };
    return { animation, start, clear: () => setAnimation(null) };
}

export function MetricParticles({ animation }: { animation: PlayAnimation }) {
    const { event, elapsed, reduced } = animation;
    if (reduced || elapsed < playTiming.parameterEnd || elapsed >= playTiming.particleEnd) return null;
    const impacts = metricParticles(event);
    if (!impacts.length) return null;
    const source = document.querySelector('.' + event.target + ' [data-factor="' + event.factor + '"] strong')?.getBoundingClientRect();
    if (!source) return null;
    return <div className="metric-particles" aria-hidden="true" data-target={event.target}>{impacts.map(impact => {
        const target = document.querySelector('.' + event.target + ' [data-metric="' + impact.metric + '"] strong')?.getBoundingClientRect();
        if (!target) return null;
        const a = { x: source.left + source.width / 2, y: source.top + source.height / 2 };
        const b = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
        return <div key={impact.metric} className={'particle-stream ' + (impact.improved ? 'improved' : 'tradeoff')}
            data-metric={impact.metric} data-count={impact.count} data-relative={impact.relative}>
            {Array.from({ length: impact.count }, (_, index) => {
                const delay = impact.count === 1 ? 0 : index / (impact.count - 1) * playTiming.particleSpread;
                const time = (elapsed - playTiming.parameterEnd - delay) / playTiming.particleTravel;
                if (time < 0 || time >= 1) return null;
                const p = particleProgress(time);
                const spread = ((index * 7) % 11 - 5) * 7;
                const bend = { x: (a.x + b.x) / 2 + spread, y: a.y + (b.y - a.y) * .35 };
                const x = (1-p)*(1-p)*a.x + 2*(1-p)*p*bend.x + p*p*b.x;
                const y = (1-p)*(1-p)*a.y + 2*(1-p)*p*bend.y + p*p*b.y;
                const angle = Math.atan2((1-p)*(bend.y-a.y)+p*(b.y-bend.y), (1-p)*(bend.x-a.x)+p*(b.x-bend.x)) * 180 / Math.PI;
                return <i key={index} className="metric-particle" data-particle={index} data-progress={p.toFixed(3)} style={{ left:x, top:y,
                    opacity:Math.min(1,time*10,(1-time)*12), transform:'translate(-50%,-50%) rotate(' + angle + 'deg)' }}/>
            })}
        </div>;
    })}</div>;
}

export function PlayFlight({ animation }: { animation: PlayAnimation }) {
    if (animation.reduced || animation.elapsed >= playTiming.arrival) return null;
    const e = animation.event, rect = document.querySelector('.' + e.target + ' [data-factor="' + e.factor + '"] strong')?.getBoundingClientRect();
    if (!rect) return null;
    const p = Math.max(0, Math.min(1, (animation.elapsed - playTiming.launch) / (playTiming.arrival - playTiming.launch)));
    const a = { x: animation.origin.x - scrollX, y: animation.origin.y - scrollY }, b = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const bend = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 35 };
    const x = (1-p)*(1-p)*a.x + 2*(1-p)*p*bend.x + p*p*b.x;
    const y = (1-p)*(1-p)*a.y + 2*(1-p)*p*bend.y + p*p*b.y;
    const text = e.factor === 'GLZ' ? t("玻璃调整") : previewRows(e.factor!, animation.preview.before!, animation.preview.after!)[0].delta;
    return <div className={'play-flight' + (e.multiplier === 2 ? ' suit-flight' : '')} aria-hidden="true" data-target={e.target} data-factor={e.factor} data-progress={p.toFixed(3)}
        style={{ left: x, top: y, opacity: animation.elapsed < playTiming.launch ? 0 : 1, transform: 'translate(-50%,-50%) scale(' + (1 - .35*p) + ')' }}>{e.multiplier === 2 && <small>{suits.find(s => s.id === pointById[e.card].suit)?.symbol} ×2 </small>}{text}</div>;
}
