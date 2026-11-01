import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  beginRun, buildBlockReason, canBuild, canCounter, counterBlockReason, designById, endTurn, functionById, gates, initialGame,
  levels, marginal, maxRounds, metricNames, metricUnits, physical, playCard, review, score,
  slotNames, validTargets,
} from './game';
import type { Game, Metric } from './game';
import './style.css';
import './guide.css';
import './compact.css';

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

function MetricGrid({ game, side }: { game: Game; side: 'player' | 'npc' }) {
  const board = side === 'player' ? game.playerBoard : game.npcBoard;
  const base = physical(board), value = review(board, game.effects, side), level = levels[game.level], pass = gates(value, level);
  return <div className="metrics">
    {keys.map(k => <div key={k} className={`metric ${pass[k] ? 'pass' : 'fail'}`}>
      <div><span>{metricNames[k]}</span><b>{k === 'D' ? '≥' : '≤'} {level.limits[k]}</b></div>
      <strong>{fmt(value[k])}<small>{metricUnits[k]}</small></strong>
      {Math.abs(base[k] - value[k]) > .01 && <em>原始 {fmt(base[k])} · 本轮评审修正 {fmt(value[k] - base[k])}</em>}
    </div>)}
  </div>;
}
function Board({ game, side }: { game: Game; side: 'player' | 'npc' }) {
  const board = side === 'player' ? game.playerBoard : game.npcBoard;
  return <div className="installed">
    {board.length ? board.map(id => <div key={id} className="installed-card">
      <span className="mini-icon">{marks[designById[id].slot]}</span>
      <div><strong>{designById[id].name}</strong><small>{slotNames[designById[id].slot]} · {id}</small></div>
      <span className="cost-mini">{designById[id].budget}预算</span>
    </div>) : <div className="empty-board">尚未安装措施</div>}
  </div>;
}
function HandCard({ id, selected, onClick, unavailable }: { id: string; selected: boolean; onClick: () => void; unavailable: string | null }) {
  const design = designById[id], fn = functionById[id];
  return <button className={`hand-card ${design ? 'design-card' : 'function-card'} ${selected ? 'selected' : ''} ${unavailable ? 'muted' : ''}`} onClick={onClick} aria-label={`${design ? design.name : fn.name}${unavailable ? `，暂不可打：${unavailable}` : ''}`}>
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
  const [levelPick, setLevelPick] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
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
  const selectionReason = !functionReason && chosen && choice && fn
    ? ['F05', 'F06', 'F08'].includes(chosen) && !choice.target ? '先选择一项已安装措施'
      : ['F05', 'F06'].includes(chosen) && !choice.metric ? '先选择要影响的指标'
      : chosen === 'F05' && game.effects.some(effect => effect.side === 'player' && effect.target === choice.target && effect.metric === choice.metric && effect.fraction > 0) ? '这项措施的这个指标本轮已增益过'
      : chosen === 'F02' && choice.discard < 0 ? '先选择一张要弃掉的手牌'
      : chosen === 'F04' && !choice.retain.length ? '先选择 1–2 张要保留的手牌'
      : null : null;
  const playReason = design ? choice?.mode === 'counter' ? counterReason || (!choice.metric ? '先选择要削减的指标' : null) : buildReason : functionReason || selectionReason;
  const confirm = () => {
    if (!choice) return;
    setGame(g => playCard(g, choice.index, choice.mode, choice.target || undefined, choice.metric || undefined, choice.discard >= 0 ? choice.discard : undefined, choice.retain));
    setChoice(null);
  };
  const pick = (index: number) => setChoice(c => c?.index === index ? null : emptyChoice(index, game.hand[index], game));
  const start = (idx: number) => { setGame(g => beginRun(g, idx)); setChoice(null); };
  const playerValue = review(game.playerBoard, game.effects, 'player'), npcValue = review(game.npcBoard, game.effects, 'npc');
  const playerGates = gates(playerValue, level), npcGates = gates(npcValue, level);
  const available = new Set([...game.playerBoard, ...game.hand, ...game.drawPile, ...game.discard]);
  const viablePaths = game.npcPlans.filter(plan =>
    game.playerBoard.every(id => plan.ids.includes(id)) && plan.ids.every(id => available.has(id)));
  const routesAfterCard = design && canBuild(game, design.id)
    ? viablePaths.filter(plan => plan.ids.includes(design.id)).length : 0;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span>◈</span><div><strong>建筑竞标实验室</strong><small>ACE405 · 单人卡牌肉鸽原型</small></div></div>
      <div className="top-actions"><span className="floor-tag">{level.curriculum} · {level.name}</span><button onClick={() => setRulesOpen(true)}>玩法说明</button></div>
    </header>
    <main className="workspace">
      <aside className="left-rail">
        <div className="section-heading"><span>01 / 委托</span><strong>{level.name}</strong></div>
        <p className="rail-copy">先满足全部性能门槛与预算，就能赢得委托。对手是状态机，只使用自己的手牌与公开方案。</p>
        <div className="round-indicator"><b>{battle ? game.round : '—'}</b><span>/ {game.maxRounds} 轮上限</span></div>
        {battle && <div className="route-advice"><strong>{viablePaths.length}</strong> 条当前牌组可行路线<small>按已安装措施、剩余卡牌和硬门槛枚举；临时增益未计入。</small></div>}
        {battle && <button className="deck-button" onClick={() => setDeckOpen(true)}>查看本局完整牌组 ↗</button>}
        <div className="rail-divider" />
        <div className="section-heading"><span>02 / 权重</span><strong>当前目标函数</strong></div>
        {keys.map(k => <div className="weight-row" key={k}><span>{metricNames[k]}</span><div><i style={{ width: `${level.weights[k] * 100}%` }} /></div><strong>{Math.round(level.weights[k] * 100)}%</strong></div>)}
        <p className="hint">硬门槛决定能否中标；权重只在双方同轮达标时决定胜负。</p>
        <div className="rail-divider" />
        <div className="section-heading"><span>03 / 状态机</span><strong>{game.intent.state}</strong></div>
        <p className="intent-copy">{battle ? game.intent.label : level.opponent_style}</p>
        <div className="rail-divider" />
        <div className="section-heading"><span>04 / 回合规则</span><strong>3 点基础体力</strong></div>
        <p className="hint">每轮最多安装 1 张措施、反制 1 次、使用 2 张功能牌。牌组循环；同槽位只能有一种措施。</p>
      </aside>
      <section className="arena">
        <div className="arena-topline"><span>课程设计竞标 · 教学代理数值</span><span>第 {game.round || 1} / {game.maxRounds} 轮</span></div>
        <div className="arena-columns">
          <article className="competitor opponent">
            <div className="competitor-header"><div><span className="eyebrow">状态机对手</span><h2>竞标方案 B</h2></div><div className="score">{score(npcValue, level).toFixed(1)}<small>综合分</small></div></div>
            <div className="board-summary"><span>预算 {physical(game.npcBoard).budget} / 100</span><span>{Object.values(npcGates).filter(Boolean).length} / 5 项达标</span></div>
            <MetricGrid game={game} side="npc" />
            <Board game={game} side="npc" />
          </article>
          <div className="vs-mark">VS<span>公开比较</span></div>
          <article className="competitor student">
            <div className="competitor-header"><div><span className="eyebrow">你的方案</span><h2>竞标方案 A</h2></div><div className="score">{score(playerValue, level).toFixed(1)}<small>综合分</small></div></div>
            <div className="board-summary"><span>预算 {physical(game.playerBoard).budget} / 100</span><span>{Object.values(playerGates).filter(Boolean).length} / 5 项达标</span></div>
            <MetricGrid game={game} side="player" />
            <Board game={game} side="player" />
          </article>
        </div>
        <div className="event-strip">✦ {game.action || '先看委托门槛与权重，再选择一张牌。'}</div>
      </section>
      <aside className="right-rail">
        <div className="section-heading"><span>决策反馈</span><strong>为什么这张牌重要</strong></div>
        {design ? <>
          <p className="rail-copy">「{design.name}」对应{slotNames[design.slot]}。{choice?.mode === 'counter' ? '反制会削减对手该措施对所选指标的正向边际贡献。' : '安装后比较自己的指标变化与硬门槛。'}</p>
          {keys.map(k => <div className="impact-row" key={k}><span>{metricNames[k]}</span><strong>{design[k] >= 0 ? '+' : ''}{design[k]}</strong><small>{k === 'D' ? '越高越好' : '越低越好'}</small></div>)}
          {choice?.mode === 'build' && canBuild(game, design.id) && <p className={`route-hint ${routesAfterCard ? 'safe' : 'risk'}`}>{routesAfterCard ? `安装后仍有 ${routesAfterCard} 条可行路线；继续比较还缺哪些指标。` : '安装后当前牌组将没有可达标组合。可换牌、改用同名反制，或重开此局。'}</p>}
          {choice?.mode === 'counter' && chosen && <p className="hint">当前对手方案的实际边际收益：{keys.filter(k => metricIsGood(game.npcBoard, chosen, k)).map(k => `${metricNames[k]} ${fmt(Math.abs(marginal(game.npcBoard, chosen, k)))}`).join('、') || '无正向收益'}。交互效应已计入。</p>}
        </> : fn ? <p className="rail-copy">{effects[chosen!] || fn.effect}</p> : <p className="rail-copy">点选手牌，查看措施带来的指标变化；有同名牌时可以安装到自己方案，也可以针对对手的同名措施反制。</p>}
        <div className="rail-divider" />
        <div className="section-heading"><span>最近发生</span><strong>竞标日志</strong></div>
        <div className="log">{game.log.length ? game.log.map((entry, i) => <p key={i}>{entry}</p>) : <p>尚无操作。</p>}</div>
      </aside>
    </main>
    <section className="action-area">
      <div className="hand-topline"><div><strong>手牌</strong><span>{battle ? `第 ${game.round} 轮 · 灰牌可点开看原因` : '等待开始'}</span></div><div className="energy-display">⚡ 体力 <b>{game.energy}</b> / 5 <small>抽牌堆 {game.drawPile.length} · 弃牌堆 {game.discard.length}</small></div></div>
      {battle ? <>
        <div className="hand-cards">{game.hand.map((id, i) => {
          const unavailable = designById[id] ? !canBuild(game, id) && !canCounter(game, id) ? '安装与反制条件均不满足；点击查看原因' : null : functionBlockReason(id, i);
          return <HandCard key={`${i}-${id}-${game.round}`} id={id} selected={choice?.index === i} unavailable={unavailable} onClick={() => pick(i)} />;
        })}</div>
        {chosen && choice && <div className="action-panel">
          <div className="action-title"><strong>{design ? design.name : fn?.name}</strong><button className="close" onClick={() => setChoice(null)}>×</button></div>
          {design && <div className="availability-list"><div className={buildReason ? 'blocked' : 'ready'}><strong>安装</strong><span>{buildReason || '当前可安装'}</span></div><div className={counterReason ? 'blocked' : 'ready'}><strong>反制</strong><span>{counterReason || '当前可反制对手同名措施'}</span></div></div>}
          {fn && functionReason && <p className="block-reason">暂不可打：{functionReason}</p>}
          {design && <div className="mode-switch"><button className={choice.mode === 'build' ? 'active' : ''} disabled={!canBuild(game, chosen)} onClick={() => setChoice({ ...choice, mode: 'build', target: '', metric: '' })}>安装到我的方案</button><button className={choice.mode === 'counter' ? 'active' : ''} disabled={!canCounter(game, chosen)} onClick={() => setChoice({ ...choice, mode: 'counter', target: chosen, metric: '' })}>同名反制对手</button></div>}
          {design && choice.mode === 'build' && canBuild(game, design.id) && <p className={`route-hint ${routesAfterCard ? 'safe' : 'risk'}`}>安装后{routesAfterCard ? `还有 ${routesAfterCard} 条可行路线` : '当前牌组将无可行路线'}</p>}
          {fn && <p>{effects[chosen] || fn.effect}</p>}
          {fn && ['F05', 'F06', 'F08'].includes(chosen) && <label>选择措施<select value={choice.target} onChange={e => setChoice({ ...choice, mode: 'function', target: e.target.value, metric: '' })}><option value="">请选择</option>{targets.map(id => <option key={id} value={id}>{designById[id].name}</option>)}</select></label>}
          {(choice.mode === 'counter' || (fn && ['F05', 'F06'].includes(chosen))) && <label>选择要影响的指标<select value={choice.metric} onChange={e => setChoice({ ...choice, mode: choice.mode === 'counter' ? 'counter' : 'function', metric: e.target.value as Metric })}><option value="">请选择</option>{targetMetrics.map(k => <option key={k} value={k}>{metricNames[k]} · 边际收益 {fmt(Math.abs(marginal(currentBoard, target!, k)))}</option>)}</select></label>}
          {chosen === 'F02' && <label>弃掉一张手牌<select value={choice.discard} onChange={e => setChoice({ ...choice, mode: 'function', discard: Number(e.target.value) })}><option value={-1}>请选择</option>{game.hand.map((id, i) => i !== choice.index && <option key={i} value={i}>{designById[id]?.name || functionById[id]?.name}</option>)}</select></label>}
          {chosen === 'F04' && <div className="retain-picker"><span>选 1–2 张留到下轮</span>{game.hand.map((id, index) => index !== choice.index && <label key={index}><input type="checkbox" checked={choice.retain.includes(index)} disabled={!choice.retain.includes(index) && choice.retain.length >= 2} onChange={() => setChoice({ ...choice, retain: choice.retain.includes(index) ? choice.retain.filter(i => i !== index) : [...choice.retain, index] })} />{designById[id]?.name || functionById[id]?.name}</label>)}</div>}
          {!functionReason && selectionReason && <p className="selection-reason">{selectionReason}</p>}
          <button className="play-button" disabled={!!playReason} onClick={confirm}>打出这张牌 →</button>
        </div>}
        <div className="turn-actions"><span>本轮：措施 {game.built ? '✓' : '0/1'} · 反制 {game.attacked ? '✓' : '0/1'} · 功能 {game.functions}/2</span><button onClick={() => { setGame(endTurn); setChoice(null); }}>结束本轮 · 结算双方 →</button></div>
      </> : <div className="waiting">选择关卡，开始竞标。</div>}
    </section>
    {game.phase === 'intro' && <div className="overlay"><div className="modal intro-modal"><div className="eyebrow">ACE405 · 学期制课程原型</div><h1>建筑竞标实验室</h1><p>你与状态机对手各自构筑一个建筑方案。不同关卡改变委托门槛与指标权重；读懂对手为何领先，再决定安装、反制或使用功能牌。</p><div className="level-list">{levels.map((item, idx) => <button key={item.id} className={levelPick === idx ? 'chosen' : ''} onClick={() => setLevelPick(idx)}><span>{item.curriculum}</span><strong>{item.name}</strong><small>{maxRounds(idx)} 轮上限{record[item.id] ? ` · 最快 ${record[item.id]} 轮达标` : ''}</small></button>)}</div><p className="disclaimer">数值为可试玩的教学代理模型，不是实际建筑仿真；游戏结果不替代课程评价。</p><button className="primary" onClick={() => start(levelPick)}>进入{levels[levelPick].name} →</button></div></div>}
    {(game.phase === 'victory' || game.phase === 'defeat' || game.phase === 'draw') && <div className="overlay"><div className="modal result-modal"><div className="eyebrow">第 {game.round} 轮 · 竞标结算</div><h1>{game.phase === 'victory' ? '你赢得了委托' : game.phase === 'draw' ? '你的设计达标 · 双方打平' : '本次未中标'}</h1><p>{game.result}</p><div className="result-scores"><div>你的方案<strong>{score(playerValue, level).toFixed(1)}</strong><small>{Object.values(playerGates).filter(Boolean).length}/5 项达标</small></div><div>状态机方案<strong>{score(npcValue, level).toFixed(1)}</strong><small>{Object.values(npcGates).filter(Boolean).length}/5 项达标</small></div></div><div className="result-history">{game.history.map((h, i) => <p key={i}>{h}</p>)}</div><p className="disclaimer">复盘重点：哪些因素改变了当前目标函数？被压制的是物理参数，还是本轮竞标收益？</p><div className="result-actions"><button onClick={() => start(game.level)}>同关再试</button><button onClick={() => start(Math.min(game.level + 1, levels.length - 1))}>下一关 →</button><button onClick={() => { setLevelPick(game.level); setGame(initialGame()); }}>返回关卡</button></div></div></div>}
    {rulesOpen && <div className="overlay top-overlay" onClick={() => setRulesOpen(false)}><div className="modal rules-modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setRulesOpen(false)}>×</button><div className="eyebrow">规则说明</div><h2>读目标、选因素、看结果</h2><p>每轮抽 5 张牌并获得 3 点体力。最多安装 1 张措施、反制 1 次、使用 2 张功能牌。已安装措施持续存在，同一槽位不能再安装第二张；预算不得超过 100。</p><p>打出与对手已安装措施同名的牌，可将该措施对所选指标的正向边际收益削减 50%。通用反制牌削减 25%。功能牌还能抽牌、补体力、增益或保护方案。</p><p>双方行动在结束回合时一起评审。先满足四项性能门槛及预算门槛者中标；同轮都达标则按公开权重分、再按预算裁定。回合上限：采光、前期碳 5，能耗 6，其余 8。</p><p className="disclaimer">反制与增益只影响本轮游戏评审值，界面同时保留原始物理代理值。所有数值均为教学假设。</p></div></div>}
    {deckOpen && <div className="overlay top-overlay" onClick={() => setDeckOpen(false)}><div className="modal deck-modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setDeckOpen(false)}>×</button><div className="eyebrow">你的本局牌组</div><h2>已知的设计选择</h2><p>你与对手的牌组构成相同，洗牌顺序独立。已安装或用于同名反制的措施牌不会再被抽到。</p><div className="deck-grid">{level.slots.map(slot => <div key={slot}><h3>{slotNames[slot]}</h3>{game.deck.filter(id => designById[id]?.slot === slot).map(id => <p key={id}><strong>{designById[id].name}</strong><small>E {designById[id].E >= 0 ? '+' : ''}{designById[id].E} · D {designById[id].D >= 0 ? '+' : ''}{designById[id].D} · H {designById[id].H >= 0 ? '+' : ''}{designById[id].H} · C {designById[id].C >= 0 ? '+' : ''}{designById[id].C}</small></p>)}</div>)}</div><h3>功能牌</h3><p>{Object.entries(game.deck.reduce<Record<string, number>>((acc, id) => { if (functionById[id]) acc[id] = (acc[id] || 0) + 1; return acc; }, {})).map(([id, count]) => `${functionById[id].name} ×${count}`).join(' · ')}</p></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
