import { useEffect } from 'react';
import type { CSSProperties } from 'react';
export type CardEffect = { serial: number; card: string; origin: { x: number; y: number }; targets: { x: number; y: number }[]; label: string; tone: string; symbol: string };
export function CardEffects({ effect, onDone }: { effect: CardEffect; onDone: () => void }) {
  useEffect(() => { const timer = setTimeout(onDone, 1300); return () => clearTimeout(timer); }, [effect.serial, onDone]);
  return <div className="card-fx-layer" data-effect-card={effect.card} aria-hidden="true" style={{ '--fx-color': effect.tone } as CSSProperties}>
    {effect.targets.map((target, i) => <div key={i}>
      {Array.from({ length: 7 }, (_, j) => <i className="card-fx-mote" key={j} style={{ left: effect.origin.x, top: effect.origin.y, '--dx': `${target.x - effect.origin.x}px`, '--dy': `${target.y - effect.origin.y}px`, animationDelay: `${j * 35}ms` } as CSSProperties}>{j === 0 ? effect.symbol : '✦'}</i>)}
      <span className="card-fx-ring" style={{ left: target.x, top: target.y }}>{effect.symbol}</span>
      {effect.card.startsWith('F')&&<span className={`function-fx function-fx-${effect.card}`} style={{left:target.x,top:target.y}}>
        {effect.card==='F01'&&[0,1,2].map(n=><i key={n} style={{'--n':n} as CSSProperties}>▤</i>)}
        {effect.card==='F02'&&<><i className="discard-sheet">▤</i><i className="filter-frame">⌕</i><i className="draw-sheet">▤</i></>}
        {effect.card==='F03'&&<><i>ϟ</i><i>ϟ</i><i>ϟ</i></>}
        {effect.card==='F04'&&<><i className="retention-card">▤</i><i className="bookmark">✓</i></>}
        {effect.card==='F05'&&[0,1,2].map(n=><i key={n} style={{'--n':n} as CSSProperties}>⌃</i>)}
        {effect.card==='F06'&&<><i className="challenge-ray"/><i className="challenge-ray"/><i className="challenge-hit">✧</i></>}
        {effect.card==='F07'&&<><i className="amplify-orbit"/><i className="amplify-orbit"/><i>↟</i></>}
        {effect.card==='F08'&&<><i className="shield-pane"/><i className="shield-pane"/><i className="shield-check">✓</i></>}
      </span>}
    </div>)}
    <div className="card-fx-label">{effect.symbol} {effect.label}</div>
  </div>;
}
