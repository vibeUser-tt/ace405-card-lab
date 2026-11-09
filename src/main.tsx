import { Rules } from './Rules';
import { t, isEnglish } from './locale.ts';
import { releaseBase } from './site';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beginRun, initialGame, playCard, blockReason, publicCost, visibleEvents, remainingPoints, slotMultiplier, effectivePoints } from './game';
import { opponentPlayback, newlyQualifiedMetric } from './opponentPlayback';
import type { OpponentPlayback } from './opponentPlayback';
import type { Game, Action, Side, Event } from './game';
import { levels, performance, gates, factors, factorNames, factorRanges, label, pointById, pointCards, suits, functions, functionById, turnRules, change } from './model';
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
 {c ? <><span className="poker-corner">{c.rank}<small>{s!.symbol}</small></span><span className="poker-suit">{s!.symbol}</span><strong>{c.rank}</strong><span className="card-copy">{t('消耗 {rank} 体力', { rank: c.rank })}</span></> : <><span className="card-ap">{f.ap}<small>{t("体力")}</small></span><span className="card-art"><GameIcon kind={id}/></span><strong>{f.name}</strong><span className="card-copy">{f.text}</span><small>{t("投入成本 ")}{f.cost}</small></>}
 </button>;
}
function Changes({ event }: {
    event: Event;
}) {
    if (!event.beforeValues || !event.afterValues)
        return null;
    return <div className="performance-change">{(['D', 'E'] as const).map(k => <span className="change-item" key={k}>{k === 'D' ? t("采光") : t("能耗")} <b>{event.beforeValues![k].toFixed(1)} → {event.afterValues![k].toFixed(1)}</b></span>)}</div>;
}
function OpponentMove({ playback }: { playback: OpponentPlayback }) {
    const step = playback.steps[playback.index];
    if (!step) return null;
    const e = step.event, card = pointById[e.card], suit = suits.find(s => s.id === card?.suit);
    const title = e.kind === 'point' ? (e.target === 'player' ? t("反制你的") : t("调整自身的")) + factorNames[e.factor!] : functionById[e.card].name;
    return <div className={'opponent-move ' + playback.stage} data-card={e.card} data-target={e.target} data-factor={e.factor} data-step={playback.index} role="status" aria-live="polite">
        <div className="opponent-move-content">
            <span className="opponent-move-label">{t("对手出牌")}</span>
            {playback.stage === 'reveal' && <div className={'opponent-card ' + (suit?.red ? 'red-suit' : 'black-suit')} aria-label={card?.name ?? functionById[e.card].name}>
                {card ? <><span>{suit!.symbol}</span><strong>{card.rank}</strong></> : <GameIcon kind={e.card}/>}
            </div>}
            <div className="opponent-move-description"><strong>{playback.stage === 'effect' && card && <span className={suit?.red ? 'red-suit' : 'black-suit'}>{suit!.symbol} {card.rank} · </span>}{title}</strong>
                <span>{e.kind === 'point' ? (e.direction === 1 ? t("增加") : t("减少")) + (e.multiplier === 2 ? t(" · 同花 ×2") : '') : functionById[e.card].text}</span>
            </div>
        </div>
    </div>;
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
    })}<div className="stat cost-stat" data-metric="C"><GameIcon kind="C"/><div><span>{side === 'npc' && game.phase === 'battle' ? t("已公开投入") : t("累计投入")}</span><strong>{publicCost(game, side)}</strong><small>{t("同轮达标时，投入少者优先")}</small></div></div></div>;
}
function App() {
    const [game, setGame] = useState<Game>(initialGame), [level, setLevel] = useState(0), [choice, setChoice] = useState<Action | null>(null), [modal, setModal] = useState<'rules' | 'deck' | 'history' | null>(null);
    const [playback, setPlayback] = useState<OpponentPlayback | null>(null);
    const busy = !!playback;
    const playedState = useRef<Game | null>(null);
    const [runSerial, setRunSerial] = useState(0);
    const { animation: feedback, start: startFeedback, clear: clearFeedback } = usePlayFeedback();
    const playing = game.phase === 'battle', intro = game.phase === 'intro', l = levels[game.level], events = visibleEvents(game), last = events.at(-1);
    const selected = choice ? (choice.kind === 'point' ? game.player.hand : game.player.functionHand)[choice.index] : null;
    const point = selected ? pointById[selected] : null;
    const bothPassed = (side: Side) => Object.values(gates(gateValues(feedback, side, performance(game[side].config)), l)).every(Boolean);
    const target: Side = choice?.mode === 'counter' ? 'npc' : 'player';
    const preview: Preview | null = playing && point && choice ? { target, factor: choice.factor, direction: choice.direction, suit: point.suit, multiplier: choice.factor ? slotMultiplier(game, point.id, choice.factor, target) : 1, before: choice.factor ? game[target].config[choice.factor] : undefined, options: choice.factor ? ([1, -1] as const).map(direction => ({ direction, after: change(game[target].config, choice.factor!, direction, effectivePoints(game, point.id, choice.factor!, target))[choice.factor!] })) : undefined } : playing && !busy && !choice && feedback && !feedback.reduced && feedback.elapsed < playTiming.arrival ? { ...feedback.preview, complete: true } : null;
    const start = (index: number) => { setPlayback(null); setRunSerial(n => n + 1); const raw = new URLSearchParams(location.search).get('seed'); clearFeedback(); setGame(beginRun(index, raw === null ? Date.now() : Number(raw))); setChoice(null); setModal(null); };
    useEffect(() => {
        if (!playback) return;
        const step = playback.steps[playback.index];
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (playback.stage === 'effect' && feedback) return;
        const delay = !step ? 500 : playback.stage === 'reveal' ? (reduced ? 800 : 1200)
            : step.event.kind === 'function' ? 700 : newlyQualifiedMetric(step.event, game.level) ? 1500 : 200;
        const timer = setTimeout(() => {
            if (!step) { setGame(playback.final); setPlayback(null); return; }
            if (playback.stage === 'reveal') {
                const e = step.event;
                if (e.kind === 'point') startFeedback(e, { target: e.target, factor: e.factor, direction: e.direction,
                    before: e.before, after: e.after, suit: pointById[e.card].suit, multiplier: e.multiplier });
                setGame(step.state);
                setPlayback({ ...playback, stage: 'effect' });
            } else {
                setPlayback({ ...playback, index: playback.index + 1, stage: 'reveal' });
            }
        }, delay);
        return () => clearTimeout(timer);
    }, [playback, !!feedback]);
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
    const revealPreview = () => requestAnimationFrame(() => {
        const panel = document.querySelector('.model-preview'), box = panel?.getBoundingClientRect();
        if (box && (box.top < 50 || box.bottom > innerHeight)) panel?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    const pickPoint = (index: number) => { if (busy || feedback)
        return; if (choice?.kind === 'function' && selected === 'F02') {
        setChoice({ ...choice, discard: index });
        return;
    } const deselect = choice?.kind === 'point' && choice.index === index;
      setChoice(deselect ? null : { kind: 'point', index });
      if (!deselect) revealPreview(); };
    const play = (action: Action | null = choice) => {
        if (busy || feedback || playedState.current === game || !action || blockReason(game, 'player', action)) return;
        // Submit the clicked direction as one complete action, without waiting for state updates.
        const next = playCard(game, 'player', action), event = next.events.at(-1);
        playedState.current = game;
        if (event?.kind === 'point' && preview) {
            const after = preview.options?.find(option => option.direction === action.direction)?.after;
            startFeedback(event, { ...preview, direction: action.direction, after, options: undefined });
        } else clearFeedback();
        setGame(next); setChoice(null);
    };
    const reason = choice ? blockReason(game, 'player', choice) : null;
    const result = game.phase === 'victory' ? t("你的方案赢得委托") : game.phase === 'defeat' ? t("对手赢得委托") : t("本局平局");
    const settled = game.history.at(-1)?.round, opponentActions = events.filter(e => e.side === 'npc' && e.round === settled);
    return <div className={'app-shell' + (!intro ? ' in-game' : '') + (choice ? ' has-choice' : '')} data-play-stage={feedback ? feedbackStage(feedback) : undefined} data-play-target={feedback?.event.target} data-opponent-stage={playback?.stage}>
 <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); if (!playing || confirm(t("返回会结束当前对局，继续吗？"))) {
        setPlayback(null); clearFeedback(); setGame(initialGame());
        setChoice(null);
    } }}><GameIcon kind="home"/><span>{t("建筑竞标实验室")}<small>GOTHENBURG · POINTS LAB</small></span></a><div className="header-actions">{intro && <a className="language-link" href={releaseBase + (isEnglish ? 'cn/' : 'en/') + location.search + location.hash} hrefLang={isEnglish ? 'zh-CN' : 'en'}>{isEnglish ? '中文' : 'English'}</a>}<span className="edition">{t("点数实验版")}</span><button onClick={() => setModal('rules')}>{t("玩法说明")}</button></div></header>
 {intro ? <main className="intro"><div className="intro-copy"><span className="eyebrow">{t("40 张牌 · 220 点资源 · 8 个设计变量")}</span><h1>{t("把每一点，")}<br />{t("用在值得的地方。")}</h1><p>{t("同一张牌，可以改变任何一个参数。")}<br />{t("探索采光与能耗，找到更省投入的方案。")}</p><div className="context-tags"><span>{t("哥德堡")}</span><span>{t("朝南 · 两层")}</span><span>{t("手牌跨轮保留")}</span></div></div><div className="intro-art"><img src={releaseBase + 'assets/design-lab/hero.png'} alt={t("可调整的建筑")}/><span className="art-note">{t("先尝试，再理解建筑的回应")}</span></div><section className="level-section"><div className="section-label">{t("选择设计挑战")}</div><div className="level-list">{levels.map((lv, i) => <button key={lv.id} className={i === level ? 'active' : ''} onClick={() => setLevel(i)}><span className="level-number">0{i + 1}</span><GameIcon kind={lv.focus}/><strong>{lv.name}</strong><p>{lv.brief}</p><small>{t("采光 ≥")}{lv.limits.D}{t("% · 能耗 ≤")}{lv.limits.E}</small></button>)}</div><button className="primary start" onClick={() => start(level)}>{t("接受委托 →")}</button></section></main> : <main className="battle">
 <div className="roundbar"><span><strong>{l.name}</strong> · {t('第 {round} 轮', { round: game.round })}</span><span>{t("先达标 · 同轮比投入")}</span><button onClick={() => setModal('history')}>{t("方案比较")}</button></div>
 <div className="arena">{(['npc', 'player'] as Side[]).map(side => <section className={'project ' + side} key={side}><div className="project-title"><strong>{side === 'player' ? t("我的方案") : t("竞标对手")}</strong><span className={playing && bothPassed(side) ? 'qualification-note' : undefined} role={playing && bothPassed(side) ? 'status' : undefined}>{playing && bothPassed(side) ? <><span className="qualification-full">{t("两项达标 · 本轮结束后评审")}</span><span className="qualification-compact">{t("两项达标 · 待评审")}</span></> : side === 'player' ? t('剩余 {points} 点资源', { points: remainingPoints(game.player) }) : t("采光与能耗公开")}</span>{(side === 'player' || !playing) && game[side].shield && <small>{t("防护：")}{factorNames[game[side].shield!.factor]}</small>}</div>
 <Stats key={runSerial} game={game} side={side} animation={feedback}/><BuildingView config={game[side].config} side={side}/>
 <div className="config-grid">{factors.map(f => { const selectable = playing && !busy && !feedback && !!choice && ((choice.kind === 'point') || (selected === 'F08' && side === 'player')); const suit = suits.find(s => s.id === game.slotSuits[side][f])!; const matched = selectable && !!point && point.suit === suit.id; const v = parameterValue(feedback, side, f, game[side].config[f]); const impact = feedback && feedback.event.target === side && feedback.event.factor === f && (feedback.reduced || feedback.elapsed >= playTiming.arrival) ? (feedback.event.blocked ? 'blocked' : feedback.event.before === feedback.event.after ? 'unchanged' : 'changed') : undefined; return <button key={f} data-factor={f} data-suit={suit.id} data-suit-match={matched} data-match-impact={impact === 'changed' && feedback?.event.multiplier === 2} data-impact={impact} data-final-value={label(f, game[side].config[f])} data-rolling={!!impact && impact === 'changed' && !feedback?.reduced && feedback!.elapsed < playTiming.parameterEnd} className={(selectable ? 'selectable ' : '') + (selectable && side === target && choice?.factor === f ? 'picked' : '')} aria-pressed={selectable && side === target && choice?.factor === f} onClick={() => { if (selectable)
                { setChoice({ ...choice!, factor: f, mode: side === 'npc' ? 'counter' : 'self' }); if (choice?.kind === 'point') revealPreview(); } }}><span className="slot-heading"><span className={'slot-suit ' + (suit.red ? 'red-suit' : 'black-suit')} title={suit.name + t("匹配时调整量翻倍")} aria-label={suit.name + t("同花加成")}>{suit.symbol}</span>{factorNames[f]}</span><strong>{label(f, v)}</strong>{impact === 'changed' && feedback?.event.multiplier === 2 && <span className="suit-burst" aria-hidden="true">{suit.symbol} ×2</span>}{impact && impact !== 'changed' && <span className="slot-notice">{impact === 'blocked' ? <><GameIcon kind="F08"/>{t("已抵挡")}</> : t("未改变")}</span>}<meter min="0" max="1" value={v} aria-label={factorNames[f] + t("归一化值")}/><span className="normalized">{t("位置 ")}{(v * 100).toFixed(1)}%</span><small className="config-range">{t("范围 ")}{factorRanges[f]}</small></button>; })}</div></section>)}{preview && <ParameterPreview preview={preview} disabledReason={choice?.kind === 'point' && choice.factor ? blockReason(game, 'player', { ...choice, direction: 1 }) : null} onDirection={choice?.kind === 'point' ? direction => play({ ...choice, direction }) : undefined}/>} {playback && <OpponentMove playback={playback}/>}</div>
 <details className="opponent-review" key={settled ?? 0}><summary>{settled ? t('第 {round} 轮对手公开操作', { round: settled }) : t("双方独立行动，结束本轮后评审")}</summary><div className="opponent-actions">{opponentActions.map((e, i) => <div className="opponent-action" key={i}><p>{e.message}</p><Changes event={e}/></div>)}</div><small>{t("暗置行动不提前公开，触发或最终评审时揭示。")}</small></details>
 <div className="event-line" role="status">{last ? <><span>{last.message}</span><Changes event={last}/></> : <span>{t("选择点数牌，再选择建筑参数和增减方向。")}</span>}</div>
 {playing ? <section className="hand-zone"><div className="hand-header"><strong>{t('你的手牌（{count}）', { count: game.player.hand.length + game.player.functionHand.length })} <small>{t("混合补至 ")}{turnRules.hand}{t(" · 最多 ")}{turnRules.maxHand}</small></strong><div><button onClick={() => setModal('deck')}>{t("牌组")}</button><span className="stamina" data-energy={game.player.energy}><GameIcon kind="E"/>{game.player.energy}<small>{t("体力 · 每轮 ")}{turnRules.energy}</small></span></div></div>
 <div className="command-bar">{choice ? <><div className="selection-summary"><strong>{point ? point.name : functionById[selected!].name}</strong><small>{point ? (choice.factor ? factorNames[choice.factor] : t("点击上方参数")) : selected === 'F02' ? t("点击一张点数牌换到牌库底") : selected === 'F08' ? t("点击自己的参数，暗置防护") : functionById[selected!].text}</small>{point && <small className="point-rule-hint">{t("点数牌可用于任意槽位，点数越大，调整幅度越大；与目标槽位同花色，调整量 ×2。")}</small>}</div><div className="command-controls"><div className="play-actions">{!point && <button className="primary confirm-action" disabled={busy || !!reason} onClick={() => play()}>{reason || t("确认打出")}</button>}<button className="cancel" onClick={() => { setChoice(null); clearFeedback(); }}>{t("取消")}</button></div></div></> : <p>{busy ? (playback.steps[playback.index] ? t("观看对手出牌 · 参数与指标依次结算") : t("对手行动结束，正在评审…")) : feedback ? t("正在应用调整…") : t("选择一张牌，再选择参数与增减方向。")}</p>}</div>
 <small className="hand-hint">{t("左右滑动查看全部手牌")}</small><div className="hand">{game.player.hand.map((id, i) => <div key={id} className={choice?.discard === i ? 'discard-picked' : ''}><Card id={id} disabled={busy || !!feedback} selected={choice?.kind === 'point' && choice.index === i} onClick={() => pickPoint(i)}/></div>)}
 {game.player.functionHand.map((id, i) => <div key={id + i}><Card id={id} disabled={busy || !!feedback} selected={choice?.kind === 'function' && choice.index === i} onClick={() => { if (!busy && !feedback)
                setChoice(choice?.kind === 'function' && choice.index === i ? null : { kind: 'function', index: i }); }}/></div>)}</div>
 <div className="turn-footer"><span>{t('待抽 {count} 张', { count: game.player.draw.length + game.player.functionDraw.length })}<br />{t("点数 ")}{game.player.draw.length}{t(" · 功能 ")}{game.player.functionDraw.length}</span><button className="primary end-turn" disabled={busy || !!feedback} onClick={() => { setChoice(null); clearFeedback(); setPlayback(opponentPlayback(game)); }}>{busy ? t("对手正在行动…") : t("结束本轮 →")}</button></div></section> : <section className={'result ' + game.phase}><GameIcon kind="trophy"/><div><h2>{result}</h2><p>{game.phase === 'draw' ? game.drawReason : t("先满足两项门槛；同轮达标比累计投入，再比综合表现。")}</p><p>{t("你的总投入 ")}{game.player.spent}{t(" · 对手总投入 ")}{game.npc.spent}{t("（包括所有暗置支出）")}</p></div><button onClick={() => setModal('history')}>{t("查看设计过程")}</button><button className="primary" onClick={() => start(game.level)}>{t("重开一局")}</button><button onClick={() => setGame(initialGame())}>{t("选择委托")}</button></section>}
 </main>}
 {feedback && <><PlayFlight animation={feedback}/><MetricParticles animation={feedback}/></>}
 {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className={'modal ' + (modal === 'deck' ? 'deck-modal' : '')} role="dialog" aria-modal="true" aria-label={modal === 'rules' ? t("玩法说明") : modal === 'deck' ? t("牌组") : t("方案比较")} onClick={e => e.stopPropagation()}><button className="modal-close" aria-label={t("关闭弹窗")} onClick={() => setModal(null)}>×</button>
 {modal === 'rules' ? <Rules/> : modal === 'deck' ? <><h2>{t("40 张点数牌 · 220 点资源")}</h2><p>{t("每种花色 1–10。另有 9 张功能牌混合补给，支出按牌面累计。")}</p><div className="catalog">{pointCards.map(c => <Card key={c.id} id={c.id}/>)}{functions.map(c => <Card key={c.id} id={c.id}/>)}</div></> : <><h2>{t("方案比较")}</h2><p>{t('当前你的投入 {cost}', { cost: game.player.spent })} · {playing ? t("对手已公开投入") : t("对手总投入")} {publicCost(game, 'npc')}</p><div className="table-scroll"><table><thead><tr><th>{t("轮次")}</th><th>{t("你的采光")}</th><th>{t("能耗")}</th><th>{t("对手采光")}</th><th>{t("能耗")}</th></tr></thead><tbody>{[{ round: 0, player: performance(l.initial), npc: performance(l.initial) }, ...game.history].map(h => <tr key={h.round}><th>{h.round || t("初始")}</th><td>{h.player.D.toFixed(1)}</td><td>{h.player.E.toFixed(1)}</td><td>{h.npc.D.toFixed(1)}</td><td>{h.npc.E.toFixed(1)}</td></tr>)}</tbody></table></div><div className="event-log">{[...events].reverse().map((e, i) => <div className="event-log-entry" key={i}><p>{t('第 {round} 轮', { round: e.round })} · {e.message}{t(" · 投入 ")}{e.cost}</p><Changes event={e}/></div>)}</div></>}
 </section></div>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
