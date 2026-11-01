import { useEffect } from 'react';
import type { CSSProperties } from 'react';
export type CardEffect = { serial: number; card: string; origin: { x: number; y: number }; targets: { x: number; y: number }[]; label: string; tone: string; symbol: string };
export function CardEffects({ effect, onDone }: { effect: CardEffect; onDone: () => void }) {
  useEffect(() => { const timer = setTimeout(onDone, 1300); return () => clearTimeout(timer); }, [effect.serial, onDone]);
  return <div className="card-fx-layer" data-effect-card={effect.card} aria-hidden="true" style={{ '--fx-color': effect.tone } as CSSProperties}>
    {effect.targets.map((target, i) => <div key={i}>
      {Array.from({ length: 7 }, (_, j) => <i className="card-fx-mote" key={j} style={{ left: effect.origin.x, top: effect.origin.y, '--dx': `${target.x - effect.origin.x}px`, '--dy': `${target.y - effect.origin.y}px`, animationDelay: `${j * 35}ms` } as CSSProperties}>{j === 0 ? effect.symbol : '✦'}</i>)}
      <span className="card-fx-ring" style={{ left: target.x, top: target.y }}>{effect.symbol}</span>
    </div>)}
    <div className="card-fx-label">{effect.symbol} {effect.label}</div>
  </div>;
}
