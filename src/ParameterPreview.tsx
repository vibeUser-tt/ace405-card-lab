import { factorNames, glass, label, suits } from './model';
import type { Factor, Suit } from './model';
import type { Side } from './game';

export type Preview = { target: Side; suit?: Suit; multiplier?: 1 | 2; factor?: Factor; before?: number; after?: number; direction?: 1 | -1; complete?: boolean };

export function signed(value: number, digits: number, unit = '') {
    if (Math.abs(value) < 1e-9) return '0' + unit;
    const magnitude = Math.abs(value);
    const places = Number(magnitude.toFixed(digits)) === 0 ? digits + 2 : digits;
    return (value > 0 ? '＋' : '−') + magnitude.toFixed(places) + unit;
}

export function previewRows(factor: Factor, before: number, after: number) {
    const delta = after - before;
    let rows: { name: string; delta: string; transition: string }[] = [];
    {
        if (factor === 'GLZ') {
            const a = glass(before), b = glass(after);
            rows = [
                { name: '玻璃 U', delta: signed(b.U - a.U, 2), transition: a.U.toFixed(2) + ' → ' + b.U.toFixed(2) },
                { name: '得热率', delta: signed(b.SHGC - a.SHGC, 1, '%'), transition: a.SHGC.toFixed(1) + '% → ' + b.SHGC.toFixed(1) + '%' },
                { name: '透光率', delta: signed(b.VT - a.VT, 1, '%'), transition: a.VT.toFixed(1) + '% → ' + b.VT.toFixed(1) + '%' }
            ];
        } else {
            // Convert the clipped normalized delta to the displayed physical unit.
            const ranges = { WWR: [20, 1, '%'], WD: [.5, 2, ' m'], EW: [.15, 3, ''], R: [.1, 3, ''], Gnd: [.12, 3, ''], VR: [3, 2, ' L/s·人'], HR: [60, 1, '%'] } as const;
            const [scale, digits, unit] = ranges[factor];
            rows = [{ name: factorNames[factor], delta: signed(delta * scale, digits, unit), transition: label(factor, before) + ' → ' + label(factor, after) }];
        }
    }
    return rows;
}

export function ParameterPreview({ preview, onDirection }: { preview: Preview; onDirection?: (direction: 1 | -1) => void }) {
    const { target, factor, before, after, direction, complete, suit, multiplier } = preview;
    const ready = factor !== undefined && before !== undefined && after !== undefined;
    const delta = ready ? after - before : 0;
    const unchanged = ready && Math.abs(delta) < 1e-9;
    const rows = ready ? previewRows(factor, before, after) : [];
    const status = complete ? '正在调整' : unchanged ? ('已达' + (direction === 1 ? '上限' : '下限') + ' · 本次不改变') : ready ? '待确认' : factor ? '选择增加或减少' : '点击下方参数';
    return <div className={'model-preview' + (complete ? ' complete' : '') + (ready ? ' ready' : '') + (unchanged ? ' unchanged' : '') + (multiplier === 2 ? ' suit-match' : '')} data-target={target} data-factor={factor} data-preview-direction={direction} data-stage={complete ? 'complete' : 'preview'} role="status" aria-live="polite" aria-atomic="true">
        <div className="preview-content">
            <div className="preview-target"><span>{target === 'player' ? '我的方案' : '对手方案'}</span><strong>{factor ? factorNames[factor] : '选择调整参数'}</strong>{multiplier === 2 && <em className="suit-bonus">{suits.find(s => s.id === suit)?.symbol} 同花 ×2</em>}</div>
            {ready && <div className={'preview-values' + (rows.length > 1 ? ' multiple' : '')}>{rows.map(row => <div className="preview-value" key={row.name}>
                {rows.length > 1 && <span>{row.name}</span>}<b className="preview-delta">{row.delta}</b><span className="preview-transition">{row.transition}</span>
            </div>)}</div>}
            <div className="preview-decision">
                <span className="preview-status">{status}</span>
                {factor && !complete && onDirection && <div className="direction-options" role="group" aria-label="选择增加或减少">
                    <button data-direction="1" aria-pressed={direction === 1} className={direction === 1 ? 'picked' : ''} onClick={() => onDirection(1)}>＋ 增加</button>
                    <button data-direction="-1" aria-pressed={direction === -1} className={direction === -1 ? 'picked' : ''} onClick={() => onDirection(-1)}>− 减少</button>
                </div>}
            </div>
        </div>
    </div>;
}
