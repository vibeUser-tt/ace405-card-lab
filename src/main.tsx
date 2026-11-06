import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beginRun, initialGame, playCard, endTurn, blockReason, publicCost, visibleEvents, remainingPoints } from './game';
import type { Game, Action, Side, Event } from './game';
import { levels, performance, gates, factors, factorNames, factorRanges, label, pointById, pointCards, suits, functions, functionById, turnRules, pointStep, change } from './model';
import { BuildingView } from './BuildingView';
import { GameIcon } from './GameIcon';
import { ParameterPreview } from './ParameterPreview';
import type { Preview } from './ParameterPreview';
import { MetricCard } from './MetricCard';
import { PlayFlight, MetricParticles, usePlayFeedback, playTiming, parameterValue, metricValues, gateValues, feedbackStage } from './PlayFeedback';
import type { PlayAnimation } from './PlayFeedback';
import './style.css';
function Card({ id, selected, onClick, disabled }: {
    id: string;
    selected?: boolean;
    onClick?: () => void;
    disabled?: boolean;
}) {
    const c = pointById[id], f = functionById[id], s = c ? suits.find(s => s.id === c.suit)! : null;
    return <button className={'hand-card ' + (c ? 'point-card ' + (s!.red ? 'red-suit' : 'black-suit') : 'function-card') + (selected ? ' selected' : '')} data-card-id={id} disabled={disabled} aria-pressed={!!selected} onClick={onClick}>
 {c ? <><span className="poker-corner">{c.rank}<small>{s!.symbol}</small></span><span className="poker-suit">{s!.symbol}</span><strong>{c.rank}</strong><span className="card-copy">消耗 {c.rank} 体力</span></> : <><span className="card-ap">{f.ap}<small>体力</small></span><span className="card-art"><GameIcon kind={id}/></span><strong>{f.name}</strong><span className="card-copy">{f.text}</span><small>投入成本 {f.cost}</small></>}
 </button>;
}
function Changes({ event }: {
    event: Event;
}) {
    if (!event.beforeValues || !event.afterValues)
        return null;
    return <div className="performance-change">{(['D', 'E'] as const).map(k => <span className="change-item" key={k}>{k === 'D' ? '采光' : '能耗'} <b>{event.beforeValues![k].toFixed(1)} → {event.afterValues![k].toFixed(1)}</b></span>)}</div>;
}
function Stats({ game, side, animation }: { game: Game; side: Side; animation: PlayAnimation | null }) {
    const actual = performance(game[side].config), v = metricValues(animation, side, actual), l = levels[game.level], pass = gates(gateValues(animation, side, actual), l);
    const e = animation?.event.target === side ? animation.event : null;
    const showChange = animation && (animation.reduced || animation.elapsed >= playTiming.metricStart);
    return <div className="stats">{(['D', 'E'] as const).map(k => {
        const delta = e?.beforeValues && e.afterValues ? e.afterValues[k] - e.beforeValues[k] : 0;
        const changed = showChange && Math.abs(delta) > 1e-8;
        return <MetricCard key={k} metric={k} value={v[k]} actual={actual[k]} limit={l.limits[k]} passed={pass[k]} delta={changed ? delta : 0} injecting={!!changed && !animation.reduced && animation.elapsed < playTiming.particleEnd}
            rolling={!!animation && !!e && !animation.reduced && animation.elapsed >= playTiming.metricStart && animation.elapsed < playTiming.metricEnd && Math.abs(delta) > 1e-8}/>;
    })}<div className="stat cost-stat" data-metric="C"><GameIcon kind="C"/><div><span>{side === 'npc' && game.phase === 'battle' ? '已公开投入' : '累计投入'}</span><strong>{publicCost(game, side)}</strong><small>同轮达标时，投入少者优先</small></div></div></div>;
}
function App() {
    const [game, setGame] = useState<Game>(initialGame), [level, setLevel] = useState(0), [choice, setChoice] = useState<Action | null>(null), [modal, setModal] = useState<'rules' | 'deck' | 'history' | null>(null), [busy, setBusy] = useState(false);
    const [runSerial, setRunSerial] = useState(0);
    const { animation: feedback, start: startFeedback, clear: clearFeedback } = usePlayFeedback();
    const playing = game.phase === 'battle', intro = game.phase === 'intro', l = levels[game.level], events = visibleEvents(game), last = events.at(-1);
    const selected = choice ? (choice.kind === 'point' ? game.player.hand : game.player.functionHand)[choice.index] : null;
    const point = selected ? pointById[selected] : null;
    const bothPassed = (side: Side) => Object.values(gates(gateValues(feedback, side, performance(game[side].config)), l)).every(Boolean);
    const target: Side = choice?.mode === 'counter' ? 'npc' : 'player';
    const preview: Preview | null = playing && point && choice ? { target, factor: choice.factor, direction: choice.direction, before: choice.factor ? game[target].config[choice.factor] : undefined, after: choice.factor && choice.direction ? change(game[target].config, choice.factor, choice.direction, point.rank)[choice.factor] : undefined } : playing && !choice && feedback && !feedback.reduced && feedback.elapsed < playTiming.arrival ? { ...feedback.preview, complete: true } : null;
    const start = (index: number) => { setRunSerial(n => n + 1); const raw = new URLSearchParams(location.search).get('seed'); clearFeedback(); setGame(beginRun(index, raw === null ? Date.now() : Number(raw))); setChoice(null); setModal(null); };
    useEffect(() => { if (!busy)
        return; const id = setTimeout(() => { setGame(g => endTurn(g)); setBusy(false); }, 350); return () => clearTimeout(id); }, [busy]);
    useEffect(() => {
        if (!modal)
            return;
        const previous = document.activeElement as HTMLElement | null;
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        dialog?.querySelector<HTMLElement>('button')?.focus();
        const listener = (e: KeyboardEvent) => { if (e.key === 'Escape')
            setModal(null); if (e.key === 'Tab' && dialog) {
            const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]'));
            if (e.shiftKey && document.activeElement === items[0]) {
                e.preventDefault();
                items.at(-1)?.focus();
            }
            else if (!e.shiftKey && document.activeElement === items.at(-1)) {
                e.preventDefault();
                items[0]?.focus();
            }
        } };
        document.addEventListener('keydown', listener);
        return () => { document.removeEventListener('keydown', listener); previous?.focus(); };
    }, [modal]);
    const pickPoint = (index: number) => { if (busy || feedback)
        return; if (choice?.kind === 'function' && selected === 'F02') {
        setChoice({ ...choice, discard: index });
        return;
    } setChoice(choice?.kind === 'point' && choice.index === index ? null : { kind: 'point', index, mode: 'self' }); };
    const play = () => { if (feedback || !choice || blockReason(game, 'player', choice))
        return;
        const next = playCard(game, 'player', choice), event = next.events.at(-1);
        if (event?.kind === 'point' && preview) startFeedback(event, preview);
        else clearFeedback();
        setGame(next); setChoice(null); };
    const reason = choice ? blockReason(game, 'player', choice) : null;
    const result = game.phase === 'victory' ? '你的方案赢得委托' : game.phase === 'defeat' ? '对手赢得委托' : '本局平局';
    const settled = game.history.at(-1)?.round, opponentActions = events.filter(e => e.side === 'npc' && e.round === settled);
    return <div className={'app-shell' + (!intro ? ' in-game' : '') + (choice ? ' has-choice' : '')} data-play-stage={feedback ? feedbackStage(feedback) : undefined} data-play-target={feedback?.event.target}>
 <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); if (!playing || confirm('返回会结束当前对局，继续吗？')) {
        clearFeedback(); setGame(initialGame());
        setChoice(null);
    } }}><GameIcon kind="home"/><span>建筑竞标实验室<small>GOTHENBURG · POINTS LAB</small></span></a><div className="header-actions"><span className="edition">点数实验版</span><button onClick={() => setModal('rules')}>玩法说明</button></div></header>
 {intro ? <main className="intro"><div className="intro-copy"><span className="eyebrow">40 张牌 · 220 点资源 · 8 个设计变量</span><h1>把每一点，<br />用在值得的地方。</h1><p>同一张牌，可以改变任何一个参数。<br />探索采光与能耗，找到更省投入的方案。</p><div className="context-tags"><span>哥德堡</span><span>朝南 · 两层</span><span>手牌跨轮保留</span></div></div><div className="intro-art"><img src={import.meta.env.BASE_URL + 'assets/design-lab/hero.png'} alt="可调整的建筑"/><span className="art-note">先尝试，再理解建筑的回应</span></div><section className="level-section"><div className="section-label">选择设计挑战</div><div className="level-list">{levels.map((lv, i) => <button key={lv.id} className={i === level ? 'active' : ''} onClick={() => setLevel(i)}><span className="level-number">0{i + 1}</span><GameIcon kind={lv.focus}/><strong>{lv.name}</strong><p>{lv.brief}</p><small>采光 ≥{lv.limits.D}% · 能耗 ≤{lv.limits.E}</small></button>)}</div><button className="primary start" onClick={() => start(level)}>接受委托 →</button></section></main> : <main className="battle">
 <div className="roundbar"><span><strong>{l.name}</strong> · 第 {game.round} 轮</span><span>先达标 · 同轮比投入</span><button onClick={() => setModal('history')}>方案比较</button></div>
 <div className="arena">{(['npc', 'player'] as Side[]).map(side => <section className={'project ' + side} key={side}><div className="project-title"><strong>{side === 'player' ? '我的方案' : '入门对手'}</strong><span className={playing && bothPassed(side) ? 'qualification-note' : undefined} role={playing && bothPassed(side) ? 'status' : undefined}>{playing && bothPassed(side) ? <><span className="qualification-full">两项达标 · 本轮结束后评审</span><span className="qualification-compact">两项达标 · 待评审</span></> : side === 'player' ? '剩余 ' + remainingPoints(game.player) + ' 点资源' : '采光与能耗公开'}</span>{(side === 'player' || !playing) && game[side].shield && <small>防护：{factorNames[game[side].shield!.factor]}</small>}</div>
 <Stats key={runSerial} game={game} side={side} animation={feedback}/><BuildingView config={game[side].config} side={side}/>
 <div className="config-grid">{factors.map(f => { const selectable = playing && !!choice && ((choice.kind === 'point' && side === target) || (selected === 'F08' && side === 'player')); const v = parameterValue(feedback, side, f, game[side].config[f]); const impact = feedback && feedback.event.target === side && feedback.event.factor === f && (feedback.reduced || feedback.elapsed >= playTiming.arrival) ? (feedback.event.blocked ? 'blocked' : feedback.event.before === feedback.event.after ? 'unchanged' : 'changed') : undefined; return <button key={f} data-factor={f} data-impact={impact} data-final-value={label(f, game[side].config[f])} data-rolling={!!impact && impact === 'changed' && !feedback?.reduced && feedback!.elapsed < playTiming.parameterEnd} className={(selectable ? 'selectable ' : '') + (selectable && choice?.factor === f ? 'picked' : '')} aria-pressed={selectable && choice?.factor === f} onClick={() => { if (selectable)
                setChoice({ ...choice!, factor: f }); }}><span>{factorNames[f]}</span><strong>{label(f, v)}</strong>{impact && impact !== 'changed' && <span className="slot-notice">{impact === 'blocked' ? <><GameIcon kind="F08"/>已抵挡</> : '未改变'}</span>}<meter min="0" max="1" value={v} aria-label={factorNames[f] + '归一化值'}/><span className="normalized">位置 {(v * 100).toFixed(1)}%</span><small className="config-range">范围 {factorRanges[f]}</small></button>; })}</div></section>)}{preview && <ParameterPreview preview={preview} onDirection={choice?.kind === 'point' ? direction => setChoice({ ...choice, direction }) : undefined}/>}</div>
 <details className="opponent-review" key={settled ?? 0}><summary>{settled ? '第 ' + settled + ' 轮对手公开操作' : '双方独立行动，结束本轮后评审'}</summary><div className="opponent-actions">{opponentActions.map((e, i) => <div className="opponent-action" key={i}><p>{e.message}</p><Changes event={e}/></div>)}</div><small>暗置行动不提前公开，触发或最终评审时揭示。</small></details>
 <div className="event-line" role="status">{last ? <><span>{last.message}</span><Changes event={last}/></> : <span>选择点数牌，再选择建筑参数和增减方向。</span>}</div>
 {playing ? <section className="hand-zone"><div className="hand-header"><strong>你的手牌（{game.player.hand.length + game.player.functionHand.length}） <small>混合补至 {turnRules.hand} · 最多 {turnRules.maxHand}</small></strong><div><button onClick={() => setModal('deck')}>牌组</button><span className="stamina" data-energy={game.player.energy}><GameIcon kind="E"/>{game.player.energy}<small>体力 · 每轮 {turnRules.energy}</small></span></div></div>
 <div className="command-bar">{choice ? <><div className="selection-summary"><strong>{point ? point.name : functionById[selected!].name}</strong><small>{point ? (choice.factor ? factorNames[choice.factor] : '点击上方参数') : selected === 'F02' ? '点击一张点数牌换到牌库底' : selected === 'F08' ? '点击自己的参数，暗置防护' : functionById[selected!].text}</small></div><div className="command-controls">{point && <><div className="target-options"><button className={target === 'player' ? 'picked' : ''} onClick={() => setChoice({ ...choice, mode: 'self' })}>调整自己</button><button className={target === 'npc' ? 'picked' : ''} onClick={() => setChoice({ ...choice, mode: 'counter' })}>反制对手</button></div></>}<div className="play-actions"><button className="primary confirm-action" disabled={busy || !!reason} onClick={play}>{reason || '确认打出'}</button><button className="cancel" onClick={() => { setChoice(null); clearFeedback(); }}>取消</button></div></div></> : <p>{feedback ? '正在应用调整…' : '选择一张牌，再选择参数与增减方向。'}</p>}</div>
 <small className="hand-hint">左右滑动查看全部手牌</small><div className="hand">{game.player.hand.map((id, i) => <div key={id} className={choice?.discard === i ? 'discard-picked' : ''}><Card id={id} disabled={busy || !!feedback} selected={choice?.kind === 'point' && choice.index === i} onClick={() => pickPoint(i)}/></div>)}
 {game.player.functionHand.map((id, i) => <div key={id + i}><Card id={id} disabled={busy || !!feedback} selected={choice?.kind === 'function' && choice.index === i} onClick={() => { if (!busy && !feedback)
                setChoice(choice?.kind === 'function' && choice.index === i ? null : { kind: 'function', index: i }); }}/></div>)}</div>
 <div className="turn-footer"><span>待抽 {game.player.draw.length + game.player.functionDraw.length} 张<br />点数 {game.player.draw.length} · 功能 {game.player.functionDraw.length}</span><button className="primary end-turn" disabled={busy || !!feedback} onClick={() => { setChoice(null); clearFeedback(); setBusy(true); }}>{busy ? '对手正在行动…' : '结束本轮 →'}</button></div></section> : <section className={'result ' + game.phase}><GameIcon kind="trophy"/><div><h2>{result}</h2><p>{game.phase === 'draw' ? game.drawReason : '先满足两项门槛；同轮达标比累计投入，再比综合表现。'}</p><p>你的总投入 {game.player.spent} · 对手总投入 {game.npc.spent}（包括所有暗置支出）</p></div><button onClick={() => setModal('history')}>查看设计过程</button><button className="primary" onClick={() => start(game.level)}>重开一局</button><button onClick={() => setGame(initialGame())}>选择委托</button></section>}
 </main>}
 {feedback && <><PlayFlight animation={feedback}/><MetricParticles animation={feedback}/></>}
 {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className={'modal ' + (modal === 'deck' ? 'deck-modal' : '')} role="dialog" aria-modal="true" aria-label={modal === 'rules' ? '玩法说明' : modal === 'deck' ? '牌组' : '方案比较'} onClick={e => e.stopPropagation()}><button className="modal-close" aria-label="关闭弹窗" onClick={() => setModal(null)}>×</button>
 {modal === 'rules' ? <><h2>把资源用在值得的地方</h2><ol><li>每人 40 张点数牌，共 220 点。每轮恢复 {turnRules.energy} 体力，点数牌与功能牌混合随机补至 {turnRules.hand} 张，检索后总手牌最多 {turnRules.maxHand} 张。未用牌保留，已用牌不回收。牌库还有点数牌时，每轮补牌后至少有一张点数牌；全是功能牌时优先换回一张新补的功能牌，如果全部是保留牌则随机换回其中一张。点数牌耗尽后不再保底。</li><li>一张牌调整一个变量，点数等于体力与投入成本。选择自己或对手、参数、增加或减少；每点移动可调范围的 {(pointStep * 100).toFixed(2)}%。八个参数均可反制。</li><li>玻璃在 A（U0.90／得热50%／透光70%）与 B（U1.80／得热60%／透光75%）之间三参数联动。归一化位置越高，不代表表现越好。</li><li>防护消耗 2 体力、2 点投入。暗置保护一个参数，抵挡下一次对应攻击后消失，不按轮数失效。最多一层，新防护替换旧防护，投入不退。</li><li>被防护、边界截断或没有变化，仍支付整张牌的投入。功能牌另付牌面投入。对手只显示已公开投入，最终评审包含所有隐藏支出。</li><li>双方行动后评审：一方达标获胜；同轮双方达标比总投入，少者优先，再比综合表现。双方点数资源用尽仍未达标则平局重开。</li></ol><h3>从数据学习，允许探索</h3><p>曲线依据 Gothenburg 的 256 个仿真组合拟合。每个变量对采光、能耗的作用不同；中间区间曲率为教学近似，并非新运行的物理仿真。结果只在调整后揭晓。</p><p>四种花色不限制目标。另有 9 张功能牌，与点数牌混合补给，不固定数量，可抽到同名牌，不回收；换牌回到牌库底，保留资源。没有自动选择参数的干扰或翻倍牌。</p></> : modal === 'deck' ? <><h2>40 张点数牌 · 220 点资源</h2><p>每种花色 1–10。另有 9 张功能牌混合补给，支出按牌面累计。</p><div className="catalog">{pointCards.map(c => <Card key={c.id} id={c.id}/>)}{functions.map(c => <Card key={c.id} id={c.id}/>)}</div></> : <><h2>方案比较</h2><p>当前你的投入 {game.player.spent} · 对手{playing ? '已公开' : '总'}投入 {publicCost(game, 'npc')}</p><div className="table-scroll"><table><thead><tr><th>轮次</th><th>你的采光</th><th>能耗</th><th>对手采光</th><th>能耗</th></tr></thead><tbody>{[{ round: 0, player: performance(l.initial), npc: performance(l.initial) }, ...game.history].map(h => <tr key={h.round}><th>{h.round || '初始'}</th><td>{h.player.D.toFixed(1)}</td><td>{h.player.E.toFixed(1)}</td><td>{h.npc.D.toFixed(1)}</td><td>{h.npc.E.toFixed(1)}</td></tr>)}</tbody></table></div><div className="event-log">{[...events].reverse().map((e, i) => <div className="event-log-entry" key={i}><p>第 {e.round} 轮 · {e.message} · 投入 {e.cost}</p><Changes event={e}/></div>)}</div></>}
 </section></div>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
