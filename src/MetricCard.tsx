import { t } from './locale.ts';
import { useLayoutEffect, useRef, useState } from 'react';
import { GameIcon } from './GameIcon';
import { signed } from './ParameterPreview';

function displayMetric(metric: 'D' | 'E', value: number, limit: number) {
    const passes = (v: number) => metric === 'D' ? v + 1e-8 >= limit : v <= limit + 1e-8;
    // Preserve the gate when rounding: 54.48 must not look like it meets 54.5.
    for (let digits = 1; digits <= 8; digits++) {
        const text = value.toFixed(digits);
        if (passes(Number(text)) === passes(value)) return text;
    }
    return String(value);
}

export function MetricCard({ metric, value, actual, limit, passed, delta, rolling, injecting }: {
    metric: 'D' | 'E'; value: number; actual: number; limit: number;
    passed: boolean; delta: number; rolling: boolean; injecting: boolean;
}) {
    const previous = useRef(passed), serial = useRef(0);
    const [pulse, setPulse] = useState<{ id: number; kind: 'passed' | 'lost' } | null>(null);
    // The caller holds the previous gate until the metric roll finishes.
    // Further improvements while passing do not replay the light.
    useLayoutEffect(() => {
        if (previous.current === passed) return;
        previous.current = passed;
        setPulse({ id: ++serial.current, kind: passed ? 'passed' : 'lost' });
        const timer = setTimeout(() => setPulse(null), passed ? 1500 : 900);
        return () => clearTimeout(timer);
    }, [passed]);
    const changed = Math.abs(delta) > 1e-8;
    const trend = (metric === 'D' ? delta > 0 : delta < 0) ? 'improved' : 'tradeoff';
    return <div className={'stat ' + (passed ? 'pass' : 'fail') + (changed ? ' metric-impact ' + trend : '')}
        data-metric={metric} data-final-value={displayMetric(metric, actual, limit)} data-rolling={rolling}
        data-injecting={injecting} data-gate-transition={pulse?.kind} data-gate-pulse={pulse?.id}>
        {pulse && <div className={'gate-effect ' + pulse.kind} key={pulse.id} aria-hidden="true">
            <span className="gate-wash"/>
            {pulse.kind === 'passed' && <svg className="gate-sweep" viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="97" height="97" rx="4" pathLength="100" vectorEffect="non-scaling-stroke"/></svg>}
        </div>}
        {injecting && <span className={'metric-injection ' + trend} aria-hidden="true"/>}
        <GameIcon kind={metric}/><div className="metric-copy">
            <span className="metric-name">{metric === 'D' ? t("采光") : t("能耗")}<em className="gate-status" role="status">{passed ? t("✓ 已达标") : t("待优化")}</em></span>
            <strong>{displayMetric(metric, value, limit)}</strong><small>{metric === 'D' ? '% sDA · ≥' : t("kWh/㎡·年 · ≤")}{limit}</small>
        </div>
        {changed && <span className={'metric-delta ' + trend}>{signed(delta, 1)}</span>}
    </div>;
}
