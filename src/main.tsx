import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  beginRun, buildBlockReason, canBuild, canCounter, counterBlockReason, designById, endTurn, functionById, initialGame,
  levels, marginal, maxRounds, metricNames, playCard, review, score,
  slotNames, validTargets,
} from './game';
import type { Game, Metric } from './game';
import './style.css';
import './guide.css';
import './compact.css';
import './battle.css';
import './adaptive.css';
import { CardEffects } from './CardEffects';
import type { CardEffect } from './CardEffects';
import { BattleScene } from './BattleScene';
import type { Cue } from './BattleScene';

type Choice = { index: number; mode: 'build' | 'counter' | 'function'; target: string; metric: Metric | ''; discard: number; retain: number[] };
const keys: Metric[] = ['E', 'D', 'H', 'C'];
const marks: Record<string, string> = { window: '▣', wall: '▥', shade: '◩', plan: '▦', material: '◇', system: '⌁' };
const functionMarks: Record<string, string> = { F01: '✧', F02: '⤾', F03: '⚡', F04: '⌁', F05: '↗', F06: '↘', F07: '✦', F08: '⬡' };
const effects: Record<string, string> = {
  F01: '抽 2 张牌', F02: '弃 1 张，再抽 2 张', F03: '消耗 1，获得 2 点体力', F04: '保留至多 2 张当前手牌',
  F05: '选己方措施与指标，收益 +25%', F06: '选对手措施与指标，收益 −25%',
  F07: '本轮下一次反制强度 +25%', F08: '选己方措施，挡下一次压制',
};
const metricIsGood = (board: string[], id: string, metric: Metric) => {
  const m = marginal(board, id, metric); return metric === 'D' ? m > 0 : m < 0;
};
const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
const emptyChoice = (index: number, id: string, game: Game): Choice => ({ index, mode: designById[id] ? !canBuild(game, id) && canCounter(game, id) ? 'counter' : 'build' : 'function', target: '', metric: '', discard: -1, retain: [] });

function HandCard({ id, selected, onClick, unavailable, retained, targetState, targetLabel }: { id: string; selected: boolean; onClick: () => void; unavailable: string | null; retained: boolean; targetState?: 'eligible' | 'picked' | 'locked'; targetLabel?: string }) {
  const design = designById[id], fn = functionById[id];
  return <button className={`hand-card ${design ? 'design-card' : 'function-card'} ${selected ? 'selected' : ''} ${unavailable ? 'muted' : ''} ${retained ? 'retained' : ''} ${targetState ? `target-${targetState}` : ''}`} data-card-id={id} onClick={onClick} aria-pressed={selected || targetState === 'picked'} aria-label={`${design ? design.name : fn.name}${targetLabel ? `，${targetLabel}` : unavailable ? `，暂不可打：${unavailable}` : ''}`}>
    {targetLabel && <span className="target-mark">{targetLabel}</span>}
    {retained && <span className="retained-mark">已保留</span>}
    <span className="hand-cost">{design ? design.ap : fn.cost}</span>
    {unavailable && <span className="card-status">暂不可打</span>}
    <span className="hand-symbol">{design ? marks[design.slot] : functionMarks[id]}</span>
    <strong>{design ? design.name : fn.name}</strong>
    <small>{design ? `${slotNames[design.slot]} · 预算 ${design.budget}` : '功能牌'}</small>
    <span className="card-description">{design ? `E ${design.E >= 0 ? '+' : ''}${design.E} · D ${design.D >= 0 ? '+' : ''}${design.D} · H ${design.H >= 0 ? '+' : ''}${design.H} · C ${design.C >= 0 ? '+' : ''}${design.C}` : effects[id] || fn.effect}</span>
  </button>;
}

function App() {
  const [game, setGame] = useState<Game>(initialGame);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => { const resize = () => setViewport({ width: window.visualViewport?.width || window.innerWidth, height: window.visualViewport?.height || window.innerHeight }); resize(); window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); }; }, []);
  const [cardEffect, setCardEffect] = useState<CardEffect | null>(null);
  const clearCardEffect = useCallback(() => setCardEffect(null), []);
  const [levelPick, setLevelPick] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [cue, setCue] = useState<Cue | null>(null);
  const [info, setInfo] = useState('');
  const [settling, setSettling] = useState(false);
  useEffect(() => { if (!settling) return; const timer = setTimeout(() => setSettling(false), 1450); return () => clearTimeout(timer); }, [settling]);
  const [record, setRecord] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('ace405-game-record') || '{}') as Record<string, number>; } catch { return {}; }
  });
  useEffect(() => {
    if (game.phase !== 'victory' && game.phase !== 'draw') return;
    const id = levels[game.level].id, updated = { ...record, [id]: Math.min(record[id] ?? 99, game.round) };
    setRecord(updated); localStorage.setItem('ace405-game-record', JSON.stringify(updated));
  // Save only when the run ends; a new result has a new sequence.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.sequence]);
  const level = levels[game.level], battle = game.phase === 'battle';
  const chosen = choice && game.hand[choice.index] ? game.hand[choice.index] : null;
  const design = chosen ? designById[chosen] : undefined, fn = chosen ? functionById[chosen] : undefined;
  const currentBoard = choice?.mode === 'counter' || chosen === 'F06' ? game.npcBoard : game.playerBoard;
  const targets = chosen && fn ? validTargets(game, chosen) : [];
  const target = choice?.mode === 'counter' ? chosen : choice?.target;
  const targetMetrics = target ? keys.filter(k => metricIsGood(currentBoard, target, k)) : [];
  const functionBlockReason = (id: string, index: number): string | null => {
    const card = functionById[id];
    if (!card) return null;
    if (game.functions >= 2) return '本轮功能牌已用满 2 张；下轮可再用';
    if (game.energy < card.cost) return `体力不足：需要 ${card.cost} 点，当前 ${game.energy} 点`;
    if (id === 'F01' && game.extraDraw >= 4) return '本轮额外抽牌已达 4 张上限';
    if (id === 'F03' && game.extraEnergy >= 2) return '本轮额外体力已达 2 点上限';
    if (id === 'F02' && game.hand.length < 2) return '手里没有其他牌可弃';
    if (id === 'F04' && game.hand.length < 2) return '手里没有其他牌可保留';
    if (id === 'F05' && !validTargets(game, id).length) return '己方尚无可增益的已安装措施';
    if (id === 'F06' && game.attacked) return '本轮已反制 1 次；下轮可再反制';
    if (id === 'F06' && !validTargets(game, id).length) return '对手尚无可压制的已安装措施';
    if (id === 'F07' && game.attacked) return '本轮反制次数已用完，无法追加反制强化';
    if (id === 'F07' && !game.hand.some((cardId, cardIndex) => cardIndex !== index && ((cardId === 'F06' && game.energy >= 2 && validTargets(game, cardId).length > 0) || (canCounter(game, cardId) && game.energy >= 2)))) return '手里没有本轮能接着打出的反制牌，或体力不足 2 点';
    if (id === 'F08' && !validTargets(game, id).length) return '己方尚无已安装措施可保护';
    return null;
  };
  const buildReason = chosen && design ? buildBlockReason(game, chosen) : null;
  const counterReason = chosen && design ? counterBlockReason(game, chosen) : null;
  const functionReason = chosen && fn && choice ? functionBlockReason(chosen, choice.index) : null;
  const handSelection = chosen === 'F02' || chosen === 'F04';
  const selectionReason = !functionReason && chosen && choice && fn
    ? ['F05', 'F06', 'F08'].includes(chosen) && !choice.target ? '先选择一项已安装措施'
      : ['F05', 'F06'].includes(chosen) && !choice.metric ? '先选择要影响的指标'
      : chosen === 'F05' && game.effects.some(effect => effect.side === 'player' && effect.target === choice.target && effect.metric === choice.metric && effect.fraction > 0) ? '这项措施的这个指标本轮已增益过'
      : chosen === 'F02' && choice.discard < 0 ? '先选择一张要弃掉的手牌'
      : chosen === 'F04' && !choice.retain.length ? '先选择 1–2 张要保留的手牌'
      : null : null;
  const playReason = design ? choice?.mode === 'counter' ? counterReason || (!choice.metric ? '先选择要削减的指标' : null) : buildReason : functionReason || selectionReason;
  const confirm = () => {
    if (!choice || playReason) return;
    const next = playCard(game, choice.index, choice.mode, choice.target || undefined, choice.metric || undefined, choice.discard >= 0 ? choice.discard : undefined, choice.retain);
    if (next === game) return;
    const rect = document.querySelector('.hand-card.selected')?.getBoundingClientRect();
    const attack = choice.mode === 'counter' || chosen === 'F06';
    const effectTarget = choice.mode === 'counter' || choice.mode === 'build' ? chosen : choice.target;
    if (effectTarget) setCue({ serial: performance.now(), side: attack ? 'npc' : 'player', target: effectTarget, kind: attack ? 'attack' : chosen === 'F08' ? 'shield' : choice.mode === 'build' ? 'build' : 'buff', origin: rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : undefined });
    const point = (selector: string) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: r.x+r.width/2, y:r.y+r.height/2 } : { x:viewport.width/2, y:viewport.height/2 }; };
    const cardId = chosen!;
    const label = cardId === 'F01' ? `抽到 ${next.hand.length-game.hand.length+1} 张牌` : cardId === 'F02' ? `弃 1 张 · 抽到 ${next.hand.length-game.hand.length+2} 张` : cardId === 'F03' ? `体力净增 +${next.energy-game.energy}` : cardId === 'F04' ? `保留 ${choice.retain.length} 张` : cardId === 'F07' ? '下一次反制强化' : choice.mode === 'build' ? `${design!.name} · 安装完成` : cardId === 'F08' ? '护盾就绪' : attack ? '反制命中 · 本轮收益削减' : '本轮收益提升';
    const colors: Record<string,string> = {F01:'#8edcff',F02:'#c5a3ff',F03:'#ffe077',F04:'#c9afff',F05:'#7ff4bd',F06:'#ffac85',F07:'#ffa860',F08:'#8abbff'};
    const slotColors: Record<string,string> = {window:'#96e5ff',wall:'#e7c18d',shade:'#eec97c',plan:'#a5e5d6',material:'#c0d893',system:'#84dce5'};
    const origin = rect ? {x:rect.x+rect.width/2,y:rect.y+rect.height/2} : point('.hand-cards');
    // Resolve destinations after closing the inspector and consuming the card.
    requestAnimationFrame(() => {
      let destinations = [point(attack ? '.battle-hud.npc' : '.battle-hud.player')];
      if (['F01','F02'].includes(cardId)) destinations = [point('.hand-cards')];
      if (['F03','F07'].includes(cardId)) destinations = [point('.energy-display')];
      if (cardId === 'F04') destinations = choice.retain.map(i => point(`.hand-card:nth-child(${i > choice.index ? i : i+1})`));
      setCardEffect({serial:performance.now(),card:cardId,origin,targets:destinations,label,tone:colors[cardId] || slotColors[design!.slot],symbol:attack?'✦':functionMarks[cardId] || marks[design!.slot]});
    });
    setGame(next);
    setInfo('');
    setChoice(null);
  };
  const pick = (index: number) => setChoice(c => {
    if (c?.index === index) return null;
    if (c && handSelection && !functionReason) {
      if (chosen === 'F02') return { ...c, discard: c.discard === index ? -1 : index };
      return { ...c, retain: c.retain.includes(index) ? c.retain.filter(i => i !== index) : c.retain.length < 2 ? [...c.retain, index] : c.retain };
    }
    return emptyChoice(index, game.hand[index], game);
  });
  const start = (idx: number) => { setGame(g => beginRun(g, idx)); setChoice(null); setCue(null); setInfo(''); };
  const playerValue = review(game.playerBoard, game.effects, 'player'), npcValue = review(game.npcBoard, game.effects, 'npc');

  const available = new Set([...game.playerBoard, ...game.hand, ...game.drawPile, ...game.discard]);
  const viablePaths = game.npcPlans.filter(plan =>
    game.playerBoard.every(id => plan.ids.includes(id)) && plan.ids.every(id => available.has(id)));
  const routesAfterCard = design && canBuild(game, design.id)
    ? viablePaths.filter(plan => plan.ids.includes(design.id)).length : 0;

  return <div className={`app-shell ${chosen && !handSelection ? 'has-choice' : ''} ${handSelection ? 'hand-targeting' : ''}`} data-layout={viewport.width > viewport.height ? 'wide' : 'tall'} style={{ '--viewport-height': `${viewport.height}px` } as React.CSSProperties}>
    {cardEffect && <CardEffects key={cardEffect.serial} effect={cardEffect} onDone={clearCardEffect} />}
    <div className="rotate-note">↻ 横屏体验更佳 · 旋转手机可同时查看双方建筑</div>
    <header className="topbar">
      <div className="brand"><span>◈</span><div><strong>建筑竞标实验室</strong><small>ACE405 · 单人卡牌肉鸽原型</small></div></div>
      <div className="top-actions"><span className="floor-tag">{level.name} · {game.round || 1}/{game.maxRounds} 轮</span><button onClick={() => setRulesOpen(true)}>玩法说明</button></div>
    </header>
    <main className="game-workspace">
      <BattleScene game={game} cue={cue} onInspect={setInfo} onTarget={(side, id) => {
        if (choice && chosen && side === 'npc' && (chosen === 'F06' || chosen === id && canCounter(game, id))) setChoice({ ...choice, mode: chosen === 'F06' ? 'function' : 'counter', target: id, metric: '' });
        else if (choice && chosen && side === 'player' && ['F05', 'F08'].includes(chosen)) setChoice({ ...choice, target: id, metric: '' });
        else setInfo(`${side === 'npc' ? '对手' : '己方'} · ${designById[id].name}：${keys.map(k => metricNames[k] + ' ' + (designById[id][k] > 0 ? '+' : '') + designById[id][k]).join(' · ')}`);
      }} />
      <div className="battle-status" aria-live="polite">{info || game.action || '选择一张牌开始构筑'}<button onClick={() => setDeckOpen(true)}>牌组 · {viablePaths.length} 条路线</button></div>
    </main>
    <section className="action-area">
      <div className="hand-topline"><div><strong>{handSelection ? fn?.name : '手牌'}</strong><span>{handSelection ? '再点发动牌取消' : battle ? `第 ${game.round} 轮 · 灰牌可点开看原因` : '等待开始'}</span></div><div className="energy-display">{game.boostedAttack && <span className="boost-mark">✦ 反制强化</span>}⚡ 体力 <b>{game.energy}</b> / 5 <small>抽牌堆 {game.drawPile.length} · 弃牌堆 {game.discard.length}</small></div></div>
      {battle ? <>
        <div className="hand-cards">{game.hand.map((id, i) => {
          const unavailable = designById[id] ? !canBuild(game, id) && !canCounter(game, id) ? '安装与反制条件均不满足；点击查看原因' : null : functionBlockReason(id, i);
          const picking = handSelection && !functionReason && choice?.index !== i;
          const picked = picking && (chosen === 'F02' ? choice?.discard === i : choice?.retain.includes(i));
          const locked = picking && !picked && chosen === 'F04' && choice!.retain.length >= 2;
          const targetState = picking ? picked ? 'picked' : locked ? 'locked' : 'eligible' : undefined;
          const targetLabel = handSelection && choice?.index === i ? '再次点击取消' : picking ? picked ? chosen === 'F02' ? '✓ 待弃置' : '✓ 待保留' : locked ? '已选满 2 张' : chosen === 'F02' ? '点击弃置' : '点击保留' : undefined;
          return <HandCard key={`${i}-${id}-${game.round}`} id={id} selected={choice?.index === i} unavailable={picking ? null : unavailable} targetState={targetState} targetLabel={targetLabel} retained={game.retained.filter(x => x === id).length > game.hand.slice(0,i).filter(x=>x===id).length} onClick={() => pick(i)} />;
        })}</div>
        {chosen && choice && !handSelection && <div className="action-panel">
          <div className="action-title"><strong>{design ? design.name : fn?.name}</strong><button className="close" onClick={() => setChoice(null)}>×</button></div>
          <div className="action-body">
          {fn && functionReason && <p className="block-reason">暂不可打：{functionReason}</p>}
          {design && <div className="mode-switch"><button className={choice.mode === 'build' ? 'active' : ''} disabled={!canBuild(game, chosen)} onClick={() => setChoice({ ...choice, mode: 'build', target: '', metric: '' })}>安装到我的方案</button><button className={choice.mode === 'counter' ? 'active' : ''} disabled={!canCounter(game, chosen)} onClick={() => setChoice({ ...choice, mode: 'counter', target: chosen, metric: '' })}>同名反制对手</button></div>}
          {design && <div className="availability-list"><div className={buildReason ? 'blocked' : 'ready'}><strong>安装</strong><span>{buildReason || '当前可安装'}</span></div><div className={counterReason ? 'blocked' : 'ready'}><strong>反制</strong><span>{counterReason || '当前可反制对手同名措施'}</span></div></div>}
          {design && choice.mode === 'build' && canBuild(game, design.id) && <p className={`route-hint ${routesAfterCard ? 'safe' : 'risk'}`}>安装后{routesAfterCard ? `还有 ${routesAfterCard} 条可行路线` : '当前牌组将无可行路线'}</p>}
          {design && <p>{keys.map(k => `${metricNames[k]} ${design[k] > 0 ? '+' : ''}${design[k]}`).join(' · ')}</p>}
          {fn && <p>{effects[chosen] || fn.effect}</p>}
          {fn && ['F05', 'F06', 'F08'].includes(chosen) && <label>选择措施<select value={choice.target} onChange={e => setChoice({ ...choice, mode: 'function', target: e.target.value, metric: '' })}><option value="">请选择</option>{targets.map(id => <option key={id} value={id}>{designById[id].name}</option>)}</select></label>}
          {(choice.mode === 'counter' || (fn && ['F05', 'F06'].includes(chosen))) && <label>选择要影响的指标<select value={choice.metric} onChange={e => setChoice({ ...choice, mode: choice.mode === 'counter' ? 'counter' : 'function', metric: e.target.value as Metric })}><option value="">请选择</option>{targetMetrics.map(k => <option key={k} value={k}>{metricNames[k]} · 边际收益 {fmt(Math.abs(marginal(currentBoard, target!, k)))}</option>)}</select></label>}
          {!functionReason && selectionReason && <p className="selection-reason">{selectionReason}</p>}
          </div>
          <button className="play-button" disabled={!!playReason} onClick={confirm}>打出这张牌 →</button>
        </div>}
        {handSelection && choice ? <div className="turn-actions hand-selection-actions">
          <span role="status">{functionReason || (chosen === 'F02' ? choice.discard < 0 ? '点选 1 张手牌弃置' : '已选 1 张 · 弃 1 抽 2' : `点选保留 1–2 张 · 已选 ${choice.retain.length}/2`)}</span>
          <button className="target-cancel" onClick={() => setChoice(null)}>取消</button>
          <button className="play-button" disabled={!!playReason} onClick={confirm}>打出这张牌 →</button>
        </div> : <div className="turn-actions"><span>本轮：措施 {game.built ? '✓' : '0/1'} · 反制 {game.attacked ? '✓' : '0/1'} · 功能 {game.functions}/2</span><button disabled={settling} onClick={() => { setSettling(true); setGame(endTurn); setChoice(null); setInfo(''); }}>结束本轮 · 结算双方 →</button></div>}
      </> : <div className="waiting">选择关卡，开始竞标。</div>}
    </section>
    {game.phase === 'intro' && <div className="overlay"><div className="modal intro-modal"><div className="eyebrow">ACE405 · 学期制课程原型</div><h1>建筑竞标实验室</h1><p>你与状态机对手各自构筑一个建筑方案。不同关卡改变委托门槛与指标权重；读懂对手为何领先，再决定安装、反制或使用功能牌。</p><div className="level-list">{levels.map((item, idx) => <button key={item.id} className={levelPick === idx ? 'chosen' : ''} onClick={() => setLevelPick(idx)}><span>{item.curriculum}</span><strong>{item.name}</strong><small>{maxRounds(idx)} 轮上限{record[item.id] ? ` · 最快 ${record[item.id]} 轮达标` : ''}</small></button>)}</div><p className="disclaimer">数值为可试玩的教学代理模型，不是实际建筑仿真；游戏结果不替代课程评价。</p><button className="primary" onClick={() => start(levelPick)}>进入{levels[levelPick].name} →</button></div></div>}
    {!settling && (game.phase === 'victory' || game.phase === 'defeat' || game.phase === 'draw') && <div className="overlay"><div className="modal result-modal"><div className="eyebrow">第 {game.round} 轮 · 竞标结算</div><h1>{game.phase === 'victory' ? '你赢得了委托' : game.phase === 'draw' ? '你的设计达标 · 双方打平' : '本次未中标'}</h1><p>{game.result}</p><div className="result-scores"><div>你的方案<strong>{score(playerValue, level).toFixed(1)}</strong><small>{Object.values({ E: playerValue.E <= level.limits.E, D: playerValue.D >= level.limits.D, H: playerValue.H <= level.limits.H, C: playerValue.C <= level.limits.C, budget: playerValue.budget <= 100 }).filter(Boolean).length}/5 项达标</small></div><div>状态机方案<strong>{score(npcValue, level).toFixed(1)}</strong><small>{Object.values({ E: npcValue.E <= level.limits.E, D: npcValue.D >= level.limits.D, H: npcValue.H <= level.limits.H, C: npcValue.C <= level.limits.C, budget: npcValue.budget <= 100 }).filter(Boolean).length}/5 项达标</small></div></div><div className="result-history">{game.history.map((h, i) => <p key={i}>{h}</p>)}</div><p className="disclaimer">复盘重点：哪些因素改变了当前目标函数？被压制的是物理参数，还是本轮竞标收益？</p><div className="result-actions"><button onClick={() => start(game.level)}>同关再试</button><button onClick={() => start(Math.min(game.level + 1, levels.length - 1))}>下一关 →</button><button onClick={() => { setLevelPick(game.level); setGame(initialGame()); }}>返回关卡</button></div></div></div>}
    {rulesOpen && <div className="overlay top-overlay" onClick={() => setRulesOpen(false)}><div className="modal rules-modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setRulesOpen(false)}>×</button><div className="eyebrow">规则说明</div><h2>读目标、选因素、看结果</h2><p>每轮抽 5 张牌并获得 3 点体力。最多安装 1 张措施、反制 1 次、使用 2 张功能牌。已安装措施持续存在，同一槽位不能再安装第二张；预算不得超过 100。</p><p>打出与对手已安装措施同名的牌，可将该措施对所选指标的正向边际收益削减 50%。通用反制牌削减 25%。功能牌还能抽牌、补体力、增益或保护方案。</p><p>双方行动在结束回合时一起评审。先满足四项性能门槛及预算门槛者中标；同轮都达标则按公开权重分、再按预算裁定。回合上限：采光、前期碳 5，能耗 6，其余 8。</p><p className="disclaimer">反制与增益只影响本轮游戏评审值，界面同时保留原始物理代理值。所有数值均为教学假设。</p></div></div>}
    {deckOpen && <div className="overlay top-overlay" onClick={() => setDeckOpen(false)}><div className="modal deck-modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setDeckOpen(false)}>×</button><div className="eyebrow">你的本局牌组</div><h2>已知的设计选择</h2><p>你与对手的牌组构成相同，洗牌顺序独立。已安装或用于同名反制的措施牌不会再被抽到。</p><div className="deck-grid">{level.slots.map(slot => <div key={slot}><h3>{slotNames[slot]}</h3>{game.deck.filter(id => designById[id]?.slot === slot).map(id => <p key={id}><strong>{designById[id].name}</strong><small>E {designById[id].E >= 0 ? '+' : ''}{designById[id].E} · D {designById[id].D >= 0 ? '+' : ''}{designById[id].D} · H {designById[id].H >= 0 ? '+' : ''}{designById[id].H} · C {designById[id].C >= 0 ? '+' : ''}{designById[id].C}</small></p>)}</div>)}</div><h3>功能牌</h3><p>{Object.entries(game.deck.reduce<Record<string, number>>((acc, id) => { if (functionById[id]) acc[id] = (acc[id] || 0) + 1; return acc; }, {})).map(([id, count]) => `${functionById[id].name} ×${count}`).join(' · ')}</p></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
