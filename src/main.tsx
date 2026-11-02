import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  beginRun, buildBlockReason, canBuild, canCounter, counterBlockReason, amplifyBlockReason, designById, endTurn, functionById, initialGame,
  levels, marginal, maxRounds, metricNames, playCard, review, score,
  slotNames, validTargets, boardAfterBuild, replacedCard, reachablePlans, physical, missingRequirements, canOptimizeMetric,
} from './game';
import type { Game, Metric } from './game';
import { metricChangeText, previewMetricChange } from './effect-display';
import './style.css';
import './guide.css';
import './compact.css';
import './battle.css';
import './adaptive.css';
import './card-controls.css';
import './game-skin.css';
import { GameIcon } from './GameIcon';
import { CardEffects } from './CardEffects';
import type { CardEffect } from './CardEffects';
import { BattleScene } from './BattleScene';
import { RenderReview } from './RenderReview';
import type { Cue } from './BattleScene';

type Choice = { index: number; mode: 'build' | 'counter' | 'function'; target: string; metric: Metric | ''; discard: number; retain: number[] };
const keys: Metric[] = ['E', 'D', 'H', 'C'];
const marks: Record<string, string> = { window: '▣', wall: '▥', shade: '◩', plan: '▦', material: '◇', system: '⌁' };
const functionMarks: Record<string, string> = { F01: '✧', F02: '⤾', F03: '⚡', F04: '⌁', F05: '↗', F06: '↘', F07: '✦', F08: '⬡' };
const effects: Record<string, string> = {
  F01: '抽 2 张牌', F02: '弃 1 张，再抽 2 张', F03: '消耗 1，获得 2 点体力', F04: '保留至多 2 张当前手牌',
  F05: '装置指标收益永久 +25%', F06: '选对手措施与指标，收益 −25%',
  F07: '本轮下一次反制强度 +25%', F08: '选己方措施，挡下一次压制',
};
const metricIsGood = (board: string[], id: string, metric: Metric) => {
  const m = marginal(board, id, metric); return metric === 'D' ? m > 0 : m < 0;
};
const emptyChoice = (index: number, id: string, game: Game): Choice => ({ index, mode: designById[id] ? !canBuild(game, id) && canCounter(game, id) ? 'counter' : 'build' : 'function', target: '', metric: '', discard: -1, retain: [] });

const compactReason = (reason: string) => {
  if (reason.includes('已安装相同')) return '已安装相同装置';
  if (reason.includes('预算')) return '预算不足';
  if (reason.includes('本轮已安装')) return '本轮已经安装';
  if (reason.includes('体力不足')) return '体力不足';
  if (reason.includes('反制次数已用完') || reason.includes('本轮已反制')) return '本轮已经反制';
  if (reason.includes('没有安装这张同名')) return '对方没有同名装置';
  if (reason.includes('没有可削减')) return '没有可削减收益';
  if (reason.includes('功能牌已用满')) return '功能次数已用完';
  if (reason.includes('额外抽牌')) return '本轮抽牌已达上限';
  if (reason.includes('额外体力')) return '本轮体力已达上限';
  if (reason.includes('没有其他牌可弃')) return '没有其他牌可弃';
  if (reason.includes('没有其他牌可保留')) return '没有其他牌可保留';
  if (reason.includes('己方尚无')) return '己方没有可选装置';
  if (reason.includes('对手尚无')) return '对方没有可选装置';
  return reason;
};

function HandCard({ id, selected, onClick, unavailable, retained, targetState, targetLabel }: { id: string; selected: boolean; onClick: () => void; unavailable: string | null; retained: boolean; targetState?: 'eligible' | 'picked' | 'locked'; targetLabel?: string }) {
  const design = designById[id], fn = functionById[id];
  return <button className={`hand-card ${design ? 'design-card' : 'function-card'} ${selected ? 'selected' : ''} ${unavailable ? 'muted' : ''} ${retained ? 'retained' : ''} ${targetState ? `target-${targetState}` : ''}`} data-card-id={id} onClick={onClick} aria-pressed={selected || targetState === 'picked'} aria-label={`${design ? design.name : fn.name}${targetLabel ? `，${targetLabel}` : unavailable ? `，暂不可打：${unavailable}` : ''}`}>
    {targetLabel && <span className="target-mark">{targetLabel}</span>}
    {retained && <span className="retained-mark">已保留</span>}
    <span className="hand-cost">{design ? design.ap : fn.cost}</span>
    <span className={`card-art ${design?'':'strategy-art'}`}>
      {design?<img src={`${import.meta.env.BASE_URL}assets/modern-v2/cards/${id}.png`} alt="" draggable="false"/>:<GameIcon kind={id}/>}
    </span>
    <span className="card-type-flag">{design?slotNames[design.slot]:'策略'}</span>
    <strong>{design ? design.name : fn.name}</strong>
    <small>{design ? `${slotNames[design.slot]} · 预算 ${design.budget}` : '功能牌'}</small>
    <span className="card-description">{design ? keys.map(k => <span className={(k==='D'?design[k]>0:design[k]<0)?'delta-good':design[k]===0?'delta-neutral':'delta-tradeoff'} key={k}>{k} {design[k] >= 0 ? '+' : ''}{design[k]}</span>) : effects[id] || fn.effect}</span>
  </button>;
}

function ResultPlans({ game }: { game: Game }) {
  const level = levels[game.level];
  return <section className="result-plan-section">
    <h2>双方最终安装方案</h2>
    <table className="result-plans">
      <thead><tr><th scope="col">槽位</th><th scope="col">你的方案</th><th scope="col">对手方案</th></tr></thead>
      <tbody>{level.slots.map(slot => <tr key={slot}>
        <th scope="row">{slotNames[slot]}</th>
        {(['player', 'npc'] as const).map(side => {
          const board = side === 'player' ? game.playerBoard : game.npcBoard;
          const id = board.find(id => designById[id].slot === slot);
          const effects = game.effects.filter(e => e.side === side && e.target === id);
          return <td key={side} data-side={side} data-slot={slot} data-card-id={id}>
            <strong className={id ? '' : 'empty-slot'}>{id ? designById[id].name : '未安装'}</strong>
            {effects.map((e, i) => <small className={e.fraction > 0 ? 'permanent-bonus' : 'round-penalty'} key={i}>
              {e.fraction > 0 ? '永久优化' : '本轮压制'}：{metricChangeText(e.metric, marginal(board, e.target, e.metric) * e.fraction)}
            </small>)}
          </td>;
        })}
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">预算</th><td>{physical(game.playerBoard).budget} / 100</td><td>{physical(game.npcBoard).budget} / 100</td></tr></tfoot>
    </table>
  </section>;
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
  const currentBoard = design || chosen === 'F06' ? game.npcBoard : game.playerBoard;
  const canOptimize = (id: string, metric: Metric) => canOptimizeMetric(game.playerBoard, game.effects, 'player', id, metric);
  const targets = chosen && fn ? validTargets(game, chosen).filter(id => chosen !== 'F05' || keys.some(k => canOptimize(id, k))) : [];
  const target = design ? chosen : choice?.target;
  const targetMetrics = target ? keys.filter(k => metricIsGood(currentBoard, target, k) && (chosen !== 'F05' || canOptimize(target, k))) : [];
  const metricPreview = (metric: Metric) => {
    if (!choice || !target) return '';
    const delta = previewMetricChange(game, choice.index, design ? 'counter' : 'function', target, metric);
    return delta === null ? `${metricNames[metric]} · 当前不可打出` : metricChangeText(metric, delta);
  };
  const functionBlockReason = (id: string, index: number): string | null => {
    const card = functionById[id];
    if (!card) return null;
    if (id === 'F07') return amplifyBlockReason(game, index);
    if (game.functions >= 2) return '本轮功能牌已用满 2 张；下轮可再用';
    if (game.energy < card.cost) return `体力不足：需要 ${card.cost} 点，当前 ${game.energy} 点`;
    if (id === 'F01' && game.extraDraw >= 4) return '本轮额外抽牌已达 4 张上限';
    if (id === 'F03' && game.extraEnergy >= 2) return '本轮额外体力已达 2 点上限';
    if (id === 'F02' && game.hand.length < 2) return '手里没有其他牌可弃';
    if (id === 'F04' && game.hand.length < 2) return '手里没有其他牌可保留';
    if (id === 'F05' && !game.playerBoard.length) return '己方尚无可增益的已安装措施';
    if (id === 'F05' && !validTargets(game, id).some(t => keys.some(k => canOptimize(t, k)))) return '现有装置的有利指标均已永久优化';
    if (id === 'F06' && game.attacked) return '本轮已反制 1 次；下轮可再反制';
    if (id === 'F06' && !validTargets(game, id).length) return '对手尚无可压制的已安装措施';
    if (id === 'F08' && !validTargets(game, id).length) return '己方尚无已安装措施可保护';
    return null;
  };
  const buildReason = chosen && design ? buildBlockReason(game, chosen) : null;
  const counterReason = chosen && design ? counterBlockReason(game, chosen) : null;
  const functionReason = chosen && fn && choice ? functionBlockReason(chosen, choice.index) : null;
  const slotSelection = chosen && ['F05', 'F06', 'F08'].includes(chosen) ? { side: chosen === 'F06' ? 'npc' as const : 'player' as const, targets: functionReason ? [] : targets, selected: choice?.target || '' } : undefined;
  const handSelection = chosen === 'F02' || chosen === 'F04';
  const selectionReason = !functionReason && chosen && choice && fn
    ? ['F05', 'F06', 'F08'].includes(chosen) && !choice.target ? chosen === 'F06' ? '点击对手呼吸高亮槽位' : '点击己方呼吸高亮槽位'
      : ['F05', 'F06'].includes(chosen) && !choice.metric ? `已选 ${designById[choice.target].name} · 选择指标`
      : chosen === 'F05' && game.effects.some(effect => effect.side === 'player' && effect.target === choice.target && effect.metric === choice.metric && effect.fraction > 0) ? '这个装置的该指标已永久优化，不能叠加'
      : chosen === 'F02' && choice.discard < 0 ? '先选择一张要弃掉的手牌'
      : chosen === 'F04' && !choice.retain.length ? '先选择 1–2 张要保留的手牌'
      : null : null;
  const playReason = design ? choice?.mode === 'counter' ? counterReason || (!choice.metric ? '先选择要削减的指标' : null) : buildReason : functionReason || selectionReason;
  const confirm = (mode: Choice['mode']) => {
    if (!choice || (mode === 'build' ? buildReason : mode === 'counter' ? counterReason || !choice.metric : playReason)) return;
    const action = { ...choice, mode };
    const next = playCard(game, action.index, action.mode, action.target || undefined, action.metric || undefined, action.discard >= 0 ? action.discard : undefined, action.retain);
    if (next === game) return;
    const rect = document.querySelector('.hand-card.selected')?.getBoundingClientRect();
    const attack = action.mode === 'counter' || chosen === 'F06';
    const effectTarget = action.mode === 'counter' || action.mode === 'build' ? chosen : action.target;
    if (effectTarget) setCue({ serial: performance.now(), side: attack ? 'npc' : 'player', target: effectTarget, kind: attack ? 'attack' : chosen === 'F08' ? 'shield' : action.mode === 'build' ? 'build' : 'buff', origin: rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : undefined });
    const point = (selector: string) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: r.x+r.width/2, y:r.y+r.height/2 } : { x:viewport.width/2, y:viewport.height/2 }; };
    const cardId = chosen!;
    const affectedSide = attack ? 'npc' : 'player';
    const affectedBoard = attack ? game.npcBoard : game.playerBoard;
    const changeLabel = action.metric ? metricChangeText(action.metric, review(affectedBoard, next.effects, affectedSide)[action.metric] - review(affectedBoard, game.effects, affectedSide)[action.metric]) : '';
    const label = cardId === 'F01' ? `抽到 ${next.hand.length-game.hand.length+1} 张牌` : cardId === 'F02' ? `弃 1 张 · 抽到 ${next.hand.length-game.hand.length+2} 张` : cardId === 'F03' ? `体力净增 +${next.energy-game.energy}` : cardId === 'F04' ? `保留 ${action.retain.length} 张` : cardId === 'F07' ? '下一次反制强化' : action.mode === 'build' ? `${design!.name} · 安装完成` : cardId === 'F08' ? '护盾就绪' : `${attack ? '对手' : '己方'}${changeLabel} · ${attack ? '本轮' : '永久'}`;
    const colors: Record<string,string> = {F01:'#8edcff',F02:'#c5a3ff',F03:'#ffe077',F04:'#c9afff',F05:'#7ff4bd',F06:'#ffac85',F07:'#ffa860',F08:'#8abbff'};
    const slotColors: Record<string,string> = {window:'#96e5ff',wall:'#e7c18d',shade:'#eec97c',plan:'#a5e5d6',material:'#c0d893',system:'#84dce5'};
    const origin = rect ? {x:rect.x+rect.width/2,y:rect.y+rect.height/2} : point('.hand-cards');
    // Resolve destinations after closing the inspector and consuming the card.
    requestAnimationFrame(() => {
      let destinations = [point(attack ? '.battle-hud.npc' : '.battle-hud.player')];
      if (['F01','F02'].includes(cardId)) destinations = [point('.hand-cards')];
      if (['F03','F07'].includes(cardId)) destinations = [point('.energy-display')];
      if (cardId === 'F04') destinations = action.retain.map(i => point(`.hand-card:nth-child(${i > action.index ? i : i+1})`));
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

  const viablePaths = reachablePlans(game);
  const oldDevice = design ? replacedCard(game.playerBoard, design.id) : undefined;
  const replacing = !!oldDevice && oldDevice !== chosen;
  const replacementPreview = replacing && design ? `${designById[oldDevice!].name} → ${design.name} · 预算 ${physical(game.playerBoard).budget}→${physical(boardAfterBuild(game.playerBoard, design.id)).budget}` : '';
  const routesAfterCard = design && canBuild(game, design.id)
    ? reachablePlans(game, 'player', design.id).length : 0;
  const previewValue = design ? review(boardAfterBuild(game.playerBoard, design.id), game.effects.filter(e => e.side !== 'player' || e.target !== oldDevice), 'player') : playerValue;
  const tutorialHint = `${missingRequirements(playerValue, level) || '已全部达标，结束本轮评审'}${game.round === 1 ? game.built ? ' · 用保留备选留下下一张装置' : ' · 先安装，再保留；四项都要达标' : ' · 先过门槛，再比综合分'}`;
  const previewHint = level.tutorial && design && !buildReason ? `安装后${missingRequirements(previewValue, level) ? `仍差：${missingRequirements(previewValue, level)}` : '全部达标'} · ` : '';

  const handHint = !chosen ? level.tutorial ? tutorialHint : '灰牌可点开看原因'
    : functionReason ? compactReason(functionReason)
    : handSelection ? `${chosen === 'F02' ? choice!.discard < 0 ? '点选 1 张弃牌' : '已选 1 张，确认弃 1 抽 2' : `保留 ${choice!.retain.length}/2 张`} · 再点取消`
    : design ? `${previewHint}${!buildReason ? `${routesAfterCard ? `安装后 ${routesAfterCard} 条路线` : '安装后无可行路线'}${replacing ? ` · ${replacementPreview} · 旧装置及其附加效果移除` : ''}` : compactReason(buildReason)}${!counterReason ? choice?.metric ? ` · 反制：对手${metricPreview(choice.metric)}` : ' · 请选择反制指标' : ''}`
    : selectionReason || (choice?.metric && ['F05', 'F06'].includes(chosen) ? `${chosen === 'F06' ? '对手' : '己方'}${metricPreview(choice.metric)} · ${chosen === 'F05' ? '永久' : '本轮'}` : slotSelection?.selected ? `已选 ${designById[slotSelection.selected].name} · ${effects[chosen]}` : effects[chosen]);

  return <div className={`app-shell ${chosen ? 'card-selected' : ''} ${handSelection ? 'hand-targeting' : ''}`} data-layout={viewport.width > viewport.height ? 'wide' : 'tall'} style={{ '--viewport-height': `${viewport.height}px` } as React.CSSProperties}>
    {cardEffect && <CardEffects key={cardEffect.serial} effect={cardEffect} onDone={clearCardEffect} />}
    <div className="rotate-note">↻ 横屏体验更佳 · 旋转手机可同时查看双方建筑</div>
    <header className="topbar">
      <div className="brand"><GameIcon kind="building"/><div><strong>建筑竞标实验室</strong><small>BUILD · PLAY · WIN</small></div></div>
      <div className="top-actions"><span className="floor-tag"><GameIcon kind="trophy"/>{level.name} · {game.round || 1}/{game.maxRounds} 轮</span><button onClick={() => setRulesOpen(true)}><GameIcon kind="menu"/>玩法说明</button></div>
    </header>
    <main className="game-workspace">
      <BattleScene game={game} cue={cue} slotSelection={slotSelection} onInspect={setInfo} onTarget={(side, id) => {
        if (slotSelection) {
          if (choice && slotSelection.side === side && slotSelection.targets.includes(id) && choice.target !== id) setChoice({ ...choice, target: id, metric: '' });
          return;
        }
        if (choice && chosen && side === 'npc' && (chosen === 'F06' || chosen === id && canCounter(game, id))) setChoice({ ...choice, mode: chosen === 'F06' ? 'function' : 'counter', target: id, metric: '' });
        else if (choice && chosen && side === 'player' && ['F05', 'F08'].includes(chosen)) setChoice({ ...choice, target: id, metric: '' });
        else setInfo(`${side === 'npc' ? '对手' : '己方'} · ${designById[id].name}：${keys.map(k => metricNames[k] + ' ' + (designById[id][k] > 0 ? '+' : '') + designById[id][k]).join(' · ')}`);
      }} />
      <div className="battle-status" aria-live="polite">{info || game.action || '选择一张牌开始构筑'}<button onClick={() => setDeckOpen(true)}>牌组 · {viablePaths.length} 条路线</button></div>
    </main>
    <section className="action-area" aria-label="手牌与行动区">
      <div className="hand-topline"><div className="hand-heading"><strong>手牌</strong><span className="round-label">第 {game.round || 1} 轮</span><span className="selection-hint" role="status" title={handHint}>{handHint}</span></div><div className="energy-display">{game.boostedAttack && <span className="boost-mark">✦ 反制强化</span>}⚡ <b>{game.energy}</b> / 5 <small>抽牌 {game.drawPile.length} · 弃牌 {game.discard.length}</small></div></div>
      {battle ? <>
        <div className="card-command" aria-label="出牌操作">
          {chosen && choice ? <>
            <div className="command-actions">
              {design ? <>
                <button className="install-button" disabled={!!buildReason} title={buildReason || replacementPreview || '安装到自己的建筑'} onClick={() => confirm('build')}><strong>{buildReason ? compactReason(buildReason) : replacing ? '替换现有装置' : '装到自己'}</strong><small>{buildReason ? '装到自己' : `消耗 ${design.ap} 体力`}</small></button>
                <button className="counter-button" disabled={!!counterReason || !choice.metric} title={counterReason || (!choice.metric ? '先选择要削减的指标' : '削减对手同名措施的指标收益')} onClick={() => confirm('counter')}><strong>{counterReason ? compactReason(counterReason) : !choice.metric ? '先选反制指标' : '反制对手'}</strong><small>{counterReason || !choice.metric ? '反制对手' : '消耗 1 体力'}</small></button>
              </> : <button className="play-button" disabled={!!playReason} title={playReason || effects[chosen]} onClick={() => confirm('function')}><strong>打出这张牌</strong></button>}
              <button className="target-cancel" aria-label="取消选牌" onClick={() => setChoice(null)}>×</button>
            </div>
            <div className="command-options">
              {((design && !counterReason) || (fn && ['F05', 'F06'].includes(chosen) && !!choice.target)) && <select className="metric-select" aria-label="选择要影响的指标" value={choice.metric} onChange={e => setChoice({ ...choice, metric: e.target.value as Metric })}><option value="">{design || chosen === 'F06' ? '选择反制指标' : '选择增益指标'}</option>{targetMetrics.map(k => <option key={k} value={k}>{metricPreview(k)}</option>)}</select>}

            </div>
          </> : <div className="command-idle"><GameIcon kind="cards"/><span>选择一张牌，构筑你的方案</span></div>}
        </div>
        <div className="hand-cards">{game.hand.map((id, i) => {
          const unavailable = designById[id] ? !canBuild(game, id) && !canCounter(game, id) ? '安装与反制条件均不满足；点击查看原因' : null : functionBlockReason(id, i);
          const picking = handSelection && !functionReason && choice?.index !== i;
          const picked = picking && (chosen === 'F02' ? choice?.discard === i : choice?.retain.includes(i));
          const locked = picking && !picked && chosen === 'F04' && choice!.retain.length >= 2;
          const targetState = picking ? picked ? 'picked' : locked ? 'locked' : 'eligible' : undefined;
          const targetLabel = handSelection && choice?.index === i ? '发动中' : picking ? picked ? chosen === 'F02' ? '✓ 待弃置' : '✓ 待保留' : locked ? '已选满 2 张' : chosen === 'F02' ? '点击弃置' : '点击保留' : undefined;
          return <HandCard key={`${i}-${id}-${game.round}`} id={id} selected={choice?.index === i} unavailable={picking ? null : unavailable} targetState={targetState} targetLabel={targetLabel} retained={game.retained.filter(x => x === id).length > game.hand.slice(0,i).filter(x=>x===id).length} onClick={() => pick(i)} />;
        })}</div>
        <div className="turn-actions"><span>本轮：措施 {game.built ? '✓' : '0/1'} · 反制 {game.attacked ? '✓' : '0/1'} · 功能 {game.functions}/2</span><button disabled={settling || handSelection} onClick={() => { setSettling(true); setGame(endTurn); setChoice(null); setInfo(''); }}>结束本轮 →</button></div>
      </> : <div className="waiting">选择关卡，开始竞标。</div>}
    </section>
    {game.phase === 'intro' && <div className="overlay"><div className="modal intro-modal"><div className="intro-heading"><div><div className="eyebrow">BUILD & BATTLE · 建筑卡牌挑战</div><h1>好设计，<br/><em>打出来。</em></h1><p>选择委托，用手中的措施牌构筑建筑。读懂目标，组合装置，赢下这场设计竞标。</p></div><img className="intro-hero" src={`${import.meta.env.BASE_URL}assets/modern-v2/reference-cards-2.png`} alt="由卡牌构筑的现代中庭建筑"/></div><div className="mission-heading"><span>选择你的委托</span><small>六种挑战 · 不同制胜思路</small></div><div className="level-list">{levels.map((item, idx) => <button key={item.id} className={levelPick === idx ? 'chosen' : ''} onClick={() => setLevelPick(idx)}><span className="level-number">{String(idx+1).padStart(2,'0')}</span><GameIcon kind={['D','E','C','H','building','trophy'][idx]}/><span className="level-curriculum">{item.curriculum}{item.tutorial ? " · 教学关" : ""}</span><strong>{item.name}</strong><small>{maxRounds(idx)} 轮上限{record[item.id] ? ` · 最快 ${record[item.id]} 轮达标` : ''}</small></button>)}</div>{levels[levelPick].tutorial && <p className="tutorial-intro">教学关：起手有 2 张配套装置和「保留备选」。每轮装 1 张，留好下一张；对手首轮勘察，第 2 轮开工。四项指标与预算必须全部达标。</p>}<p className="disclaimer">数值为可试玩的教学代理模型，不是实际建筑仿真；游戏结果不替代课程评价。</p><button className="primary" onClick={() => start(levelPick)}>进入{levels[levelPick].name} →</button></div></div>}
    {!settling && (game.phase === 'victory' || game.phase === 'defeat' || game.phase === 'draw') && <div className="overlay"><div className="modal result-modal" data-result={game.phase}><GameIcon className="result-emblem" kind={game.phase==='victory'?'trophy':'building'}/><div className="eyebrow">第 {game.round} 轮 · 竞标结算</div><h1>{game.phase === 'victory' ? '你赢得了委托' : game.phase === 'draw' ? '你的设计达标 · 双方打平' : '本次未中标'}</h1><p>{game.result}</p><div className="result-scores"><div>你的方案<strong>{score(playerValue, level).toFixed(1)}</strong><small>{Object.values({ E: playerValue.E <= level.limits.E, D: playerValue.D >= level.limits.D, H: playerValue.H <= level.limits.H, C: playerValue.C <= level.limits.C, budget: playerValue.budget <= 100 }).filter(Boolean).length}/5 项达标</small></div><div>对手方案<strong>{score(npcValue, level).toFixed(1)}</strong><small>{Object.values({ E: npcValue.E <= level.limits.E, D: npcValue.D >= level.limits.D, H: npcValue.H <= level.limits.H, C: npcValue.C <= level.limits.C, budget: npcValue.budget <= 100 }).filter(Boolean).length}/5 项达标</small></div></div><ResultPlans game={game} /><p className="disclaimer">复盘重点：哪些因素改变了当前目标函数？被压制的是物理参数，还是本轮竞标收益？</p><div className="result-actions"><button onClick={() => start(game.level)}>同关再试</button><button onClick={() => start(Math.min(game.level + 1, levels.length - 1))}>下一关 →</button><button onClick={() => { setLevelPick(game.level); setGame(initialGame()); }}>返回关卡</button></div></div></div>}
    {rulesOpen && <div className="overlay top-overlay" onClick={() => setRulesOpen(false)}><div className="modal rules-modal" onClick={e => e.stopPropagation()}><button className="close" aria-label="关闭玩法说明" onClick={() => setRulesOpen(false)}>×</button><div className="eyebrow">规则说明</div><h2>读目标、选因素、看结果</h2>{level.tutorial && <p>采光教学关使用固定的六张装置卡池。你的起手保证两张可配合达标的不同槽位装置与一张保留备选；对手第一轮只勘察，从第二轮正常安装和出牌。先让四项指标与预算全部达标，再比较综合分。</p>}<p>每轮抽 5 张牌并获得 3 点体力。最多安装 1 张措施、反制 1 次、使用 2 张功能牌。已安装措施持续存在，同一槽位可以用不同装置替换，每轮仍只安装一次，消耗新牌的体力。旧装置从本局移除，其增益、压制和护盾一并清除；相同装置不能重复安装。预算按替换后的方案计算，不得超过 100。</p><p>打出与对手已安装措施同名的牌，可将该措施对所选指标的正向边际收益削减 50%。通用反制牌削减 25%。功能牌还能抽牌、补体力、增益或保护方案。</p><p>双方行动在结束回合时一起评审。先满足四项性能门槛及预算门槛者中标；同轮都达标则按公开权重分、再按预算裁定。回合上限：采光、前期碳 5，能耗 6，其余 8。</p><p className="disclaimer">聚焦优化在本局持续生效，每个装置的每个有利指标最多永久 +25%，拆除装置后失效；反制仅持续当轮。界面同时保留原始物理代理值。所有数值均为教学假设。</p></div></div>}
    {deckOpen && <div className="overlay top-overlay" onClick={() => setDeckOpen(false)}><div className="modal deck-modal" onClick={e => e.stopPropagation()}><button className="close" aria-label="关闭牌组" onClick={() => setDeckOpen(false)}>×</button><div className="eyebrow">你的本局牌组</div><h2>已知的设计选择</h2><p>你与对手的牌组构成相同，洗牌顺序独立。已安装或用于同名反制的措施牌不会再被抽到。</p><div className="deck-grid">{level.slots.map(slot => <div key={slot}><h3>{slotNames[slot]}</h3>{game.deck.filter(id => designById[id]?.slot === slot).map(id => <p className="deck-item" key={id}><img src={`${import.meta.env.BASE_URL}assets/modern-v2/cards/${id}.png`} alt=""/><strong>{designById[id].name}</strong><small>E {designById[id].E >= 0 ? '+' : ''}{designById[id].E} · D {designById[id].D >= 0 ? '+' : ''}{designById[id].D} · H {designById[id].H >= 0 ? '+' : ''}{designById[id].H} · C {designById[id].C >= 0 ? '+' : ''}{designById[id].C}</small></p>)}</div>)}</div><h3>功能牌</h3><p>{Object.entries(game.deck.reduce<Record<string, number>>((acc, id) => { if (functionById[id]) acc[id] = (acc[id] || 0) + 1; return acc; }, {})).map(([id, count]) => `${functionById[id].name} ×${count}`).join(' · ')}</p></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('renderReview') ? <RenderReview /> : <App />);
