import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beginRun, initialGame, playCard, endTurn, blockReason, bidScore } from './game';
import type { Game, Action, Side, Event } from './game';
import { levels, performance, gates, factors, factorNames, factorRanges, label, designById, cardById, cards, provenance, turnRules, canCounterDesign, counterFactors } from './model';
import type { Values } from './model';
import { BuildingView } from './BuildingView';
import { GameIcon } from './GameIcon';
import './style.css';
const metrics: (keyof Values)[] = ['D', 'E', 'C'];
const metricNames = { D: '采光', E: '能耗', C: '方案成本' }, units = { D: '% sDA', E: 'kWh/㎡·年', C: '成本点' };
const lastUpdate = (game: Game, side: Side): Event | undefined => [...game.events].reverse().find(event => event.target === side && ('beforeValues' in event || event.factor));
const deltaText = (value: number) => { const rounded = Math.round(value * 10) / 10; return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded).toFixed(1)}`; };
const improvement = (metric: keyof Values, delta: number) => Math.abs(delta) < .05 ? 'unchanged' : (metric === 'D' ? delta > 0 : delta < 0) ? 'improved' : 'tradeoff';
function PerformanceChange({ event }: { event: Event }) {
    if (!event.beforeValues || !event.afterValues) return null;
    const before = event.beforeValues, after = event.afterValues;
    return <div className="performance-change" aria-label="出牌后的实际指标变化">
        <span className="change-owner">{event.target === 'player' ? '你的建筑' : '对手建筑'}</span>
        {metrics.map(metric => {
            const delta = Number(after[metric].toFixed(1)) - Number(before[metric].toFixed(1));
            return <span className={`change-item ${improvement(metric, delta)}`} key={metric}>
                <span>{metricNames[metric]}</span><b>{before[metric].toFixed(1)} → {after[metric].toFixed(1)}</b>
                <small>{deltaText(delta)}{metric === 'D' ? ' 个百分点' : metric === 'C' ? ' 点' : ' kWh/㎡·年'}</small>
            </span>;
        })}
    </div>;
}
function OpponentReview({ game }: { game: Game }) {
    const settledRound = game.history.at(-1)?.round;
    if (!settledRound) return <div className="opponent-review initial-review">对手还未行动。出牌后观察变化；结束本轮时，会展示对手的实际操作。</div>;
    const actions = game.events.filter(event => event.side === 'npc' && event.round === settledRound);
    return <details className="opponent-review" key={settledRound} open>
        <summary><strong>第 {settledRound} 轮对手已行动</strong><span>{actions.length ? `${actions.length} 次操作 · 查看实际变化` : '本轮保持原方案'}</span></summary>
        <div className="opponent-actions">{actions.length ? actions.map((event, index) => <div className="opponent-action" key={index}><p>{event.message}</p><PerformanceChange event={event}/></div>) : <p>对手这轮没有修改参数，指标保持不变。</p>}</div>
    </details>;
}
function Card({ id, selected, onClick, retained = false }: {
    id: string;
    selected?: boolean;
    onClick?: () => void;
    retained?: boolean;
}) {
    const c = cardById[id], d = designById[id];
    return <button className={`hand-card ${d ? 'design-card' : 'function-card'} ${selected ? 'selected' : ''}`} data-card-id={id} data-counterable={d ? canCounterDesign(d) : undefined} onClick={onClick} aria-pressed={!!selected}>
   <span className="card-ap">{c.ap}<small>体力</small></span>{retained && <span className="keep-mark">保留</span>}
   <span className="card-art">{d ? <img src={`${import.meta.env.BASE_URL}assets/design-lab/cards/${id[0]}-${id.endsWith('+') ? 'up' : 'down'}.png`} alt=""/> : <GameIcon kind={id}/>}</span>
   <span className="card-category">{d ? `${factorNames[d.factor]} · ${canCounterDesign(d) ? '可反制' : '仅自身'}` : '功能牌'}</span><strong>{c.name}</strong><span className="card-copy">{c.text}</span>
 </button>;
}
function Stats({ game, side }: {
    game: Game;
    side: Side;
}) {
    const v = performance(game[side].config), l = levels[game.level], pass = gates(v, l);
    const update = lastUpdate(game, side);
    return <div className="stats" data-updated-round={update?.round ?? 0}>{metrics.map(k => <div key={`${k}-${update ? game.events.indexOf(update) : 'initial'}`} className={`stat ${pass[k] ? 'pass' : 'fail'} ${update ? 'stat-updated' : ''}`} data-metric={k}>
  <GameIcon kind={k}/><div><span>{metricNames[k]}</span><strong>{v[k].toFixed(1)}</strong><small>{units[k]} · {k === 'D' ? '≥' : '≤'}{l.limits[k]}</small></div><i>{pass[k] ? '✓' : '待优化'}</i>
 </div>)}</div>;
}
function App() {
    const [game, setGame] = useState<Game>(initialGame), [level, setLevel] = useState(0), [choice, setChoice] = useState<Action | null>(null), [modal, setModal] = useState<'rules' | 'deck' | 'history' | null>(null), [busy, setBusy] = useState(false);
    const l = levels[game.level], playing = game.phase === 'battle', intro = game.phase === 'intro';
    const selected = choice ? game.player.hand[choice.index] : null, c = selected ? cardById[selected] : null, design = selected ? designById[selected] : null;
    const reason = choice ? blockReason(game, 'player', choice) : null;
    useEffect(() => { if (!busy)
        return; const t = setTimeout(() => { setGame(g => endTurn(g)); setBusy(false); }, 500); return () => clearTimeout(t); }, [busy]);
    const start = (index: number) => { const seed = new URLSearchParams(location.search).get('seed'); setGame(beginRun(index, seed === null ? Date.now() : Number(seed))); setChoice(null); setModal(null); };
    useEffect(() => {
        if (!modal)
            return;
        const previous = document.activeElement as HTMLElement | null;
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        dialog?.querySelector<HTMLElement>('button')?.focus();
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') {
            setModal(null);
            return;
        } if (e.key === 'Tab' && dialog) {
            const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]'));
            const first = buttons[0], last = buttons.at(-1);
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        } };
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('keydown', key); previous?.focus(); };
    }, [modal]);
    const pick = (index: number) => {
        if (busy)
            return;
        if (choice && selected === 'F02' && index !== choice.index) {
            setChoice({ ...choice, discard: index });
            return;
        }
        if (choice && selected === 'F04' && index !== choice.index) {
            const retained = choice.retain || [];
            setChoice({ ...choice, retain: retained.includes(index) ? retained.filter(i => i !== index) : [...retained, index].slice(-turnRules.retain) });
            return;
        }
        setChoice(choice?.index === index ? null : { index, mode: designById[game.player.hand[index]] ? 'self' : 'function' });
    };
    const play = (mode: Action['mode']) => { if (!choice)
        return; const action = { ...choice, mode }; if (blockReason(game, 'player', action))
        return; setGame(g => playCard(g, 'player', action)); setChoice(null); };
    const resultTitle = { victory: '你的方案赢得委托', defeat: '对手率先赢得委托', draw: '双方方案并列达标', timeout: '本次委托尚未完成', battle: '', intro: '' }[game.phase];
    return <div className="app-shell">
  <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); if (!playing || confirm('返回关卡会结束当前对局，继续吗？')) {
        setGame(initialGame());
        setChoice(null);
    } }}><GameIcon kind="home"/><span>建筑竞标实验室<small>GOTHENBURG · DESIGN LAB</small></span></a><div className="header-actions"><span className="edition">POC / 03</span><button onClick={() => setModal('rules')}><GameIcon kind="menu"/>玩法说明</button></div></header>
  {intro ? <main className="intro">
    <div className="intro-copy"><span className="eyebrow">一栋建筑，三种设计挑战</span><h1>每一次出牌，<br />都是一次设计。</h1><p>调整建筑，观察采光与能耗。<br />在有限预算里，找到你的取舍。</p><div className="context-tags"><span>哥德堡</span><span>朝南</span><span>两层建筑</span><span>8 个设计变量</span></div></div>
    <div className="intro-art"><img src={`${import.meta.env.BASE_URL}assets/design-lab/hero.png`} alt="可调整窗户、保温构造和通风设备的两层建筑"/><span className="art-note">从真实仿真出发 · 通过卡牌探索</span></div>
    <section className="level-section"><div className="section-label">选择你的委托 <small>三个关卡均可直接开始</small></div><div className="level-list">{levels.map((lv, i) => <button key={lv.id} className={i === level ? 'active' : ''} onClick={() => setLevel(i)}><span className="level-number">0{i + 1}</span><GameIcon kind={lv.focus}/><strong>{lv.name}</strong><p>{lv.brief}</p><small>采光 ≥{lv.limits.D}% · 能耗 ≤{lv.limits.E} · 成本 ≤{lv.limits.C}</small></button>)}</div><button className="primary start" onClick={() => start(level)}>接受委托 · {levels[level].name} <span>→</span></button></section>
  </main> : <main className="battle">
    <div className="roundbar"><span><strong>{l.name}</strong> · 第 {game.round} / {l.rounds} 轮</span><span>哥德堡 · 朝南 · 2 层</span><button onClick={() => setModal('history')}>方案比较</button></div>
    <div className="arena">{(['npc', 'player'] as Side[]).map(side => <section className={`project ${side}`} key={side}>
      <div className="project-title"><strong>{side === 'player' ? '我的方案' : '入门对手'}</strong><span>竞标分 {bidScore(game, side).toFixed(1)}</span>{game[side].shield && <small>防护：{factorNames[game[side].shield!]}</small>}</div>
      <div className="update-stamp" aria-live="polite">{lastUpdate(game, side) ? `第 ${lastUpdate(game, side)!.round} 轮已更新 · ${cardById[lastUpdate(game, side)!.card].name}` : '初始方案 · 尚未调整'}</div>
      <Stats game={game} side={side}/><BuildingView config={game[side].config} side={side}/>
      <div className="config-grid">{factors.map(f => <button key={f} className={`${game[side].shield === f ? 'protected' : ''} ${choice?.factor === f && side === 'player' ? 'picked' : ''} ${selected === 'F08' && side === 'player' && counterFactors.includes(f) ? 'selectable' : ''}`} onClick={() => { if (selected === 'F08' && side === 'player' && counterFactors.includes(f) && choice)
                setChoice({ ...choice, factor: f }); }}><span>{factorNames[f]}</span><strong>{label(f, game[side].config[f])}</strong><small className="config-range">{factorRanges[f]}</small></button>)}</div>
    </section>)}</div>
    <div className="intent" key={game.round}><span>第 {game.round} 轮对手意图</span>{game.intent}</div>
    <OpponentReview game={game}/>
    <div className="event-line" role="status" aria-live="polite"><span>{game.events.at(-1)?.message || '选择一张牌，开始调整建筑。方案可暂时超预算，达标才能获胜。'}</span>{game.events.at(-1) && <PerformanceChange event={game.events.at(-1)!}/>}</div>
    {playing ? <section className="hand-zone"><div className="hand-header"><strong>你的手牌 <small>自由出牌 · 自调与反制同费</small></strong><div><button onClick={() => setModal('deck')}>牌组</button><span className="stamina" data-energy={game.player.energy}><GameIcon kind="E"/>{game.player.energy}<small>体力 · 每轮 {turnRules.energy}</small></span></div></div>
      <div className="command-bar">{c && choice ? <><div><strong>{c.name}</strong><span>{c.text}</span>{design && !canCounterDesign(design) && <small>成套方案仅可用于自己的建筑</small>}{selected === 'F02' && <small>点击另一张手牌作为弃牌</small>}{selected === 'F04' && <small>点击 1–2 张其他手牌保留</small>}{selected === 'F08' && <small>点击上方自己的建筑参数选择防护目标</small>}{selected === 'F06' && <small>选择要干扰的性能，使用后观察对手的实际变化</small>}</div><div className="play-actions">{selected === 'F06' && choice && <div className="interference-target" role="group" aria-label="选择干扰目标"><button className={choice.metric === 'D' ? 'picked' : ''} aria-pressed={choice.metric === 'D'} onClick={() => setChoice({ ...choice, metric: 'D' })}>削减采光</button><button className={choice.metric === 'E' ? 'picked' : ''} aria-pressed={choice.metric === 'E'} onClick={() => setChoice({ ...choice, metric: 'E' })}>增加能耗</button></div>}{design ? <><button className="self-action" disabled={busy || !!blockReason(game, 'player', { ...choice, mode: 'self' })} onClick={() => play('self')}>调整自己 · {design.ap} 体力</button>{canCounterDesign(design) && <button className="counter-action" disabled={busy || !!blockReason(game, 'player', { ...choice, mode: 'counter' })} onClick={() => play('counter')}>反制对手 · {design.ap} 体力</button>}</> : <button className="self-action" disabled={busy || !!reason} onClick={() => play('function')}>{reason || '使用功能牌'}</button>}<button className="cancel" onClick={() => setChoice(null)}>取消</button></div></> : <p>先决定怎么改，再看看建筑的回答。<small>卡牌不预告性能收益；边界上的牌也可以打出。</small></p>}</div>
      <div className="hand">{game.player.hand.map((id, i) => <div className={`${choice?.discard === i ? 'discard-picked' : ''} ${choice?.retain?.includes(i) ? 'retain-picked' : ''}`} key={`${i}-${id}`}><Card id={id} selected={choice?.index === i} retained={game.player.retained.includes(i)} onClick={() => pick(i)}/>{choice?.discard === i && <span className="selection-tag">将弃置</span>}{choice?.retain?.includes(i) && <span className="selection-tag">将保留</span>}</div>)}</div>
      <div className="turn-footer"><span>抽牌堆 {game.player.draw.length} · 弃牌堆 {game.player.discard.length}</span><button className="primary end-turn" disabled={busy} onClick={() => { setChoice(null); setBusy(true); }}>{busy ? '对手正在行动…' : '结束本轮 →'}</button></div>
    </section> : <section className={`result ${game.phase}`}><GameIcon kind="trophy"/><div><h2>{resultTitle}</h2><p>{game.phase === 'timeout' ? '双方仍有未满足的要求。比较方案，试试另一条设计路线。' : '先满足采光、能耗和成本要求；双方同轮达标时比较竞标分。'}</p></div><button onClick={() => setModal('history')}>查看设计过程</button><button className="primary" onClick={() => start(game.level)}>再试一次</button><button onClick={() => { setGame(initialGame()); setChoice(null); }}>选择委托</button></section>}
  </main>}
  {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className={`modal ${modal === 'deck' ? 'deck-modal' : ''}`} role="dialog" aria-modal="true" aria-label={modal === 'rules' ? '玩法说明' : modal === 'deck' ? '全部卡牌' : '方案比较'} onClick={e => e.stopPropagation()}><button className="modal-close" aria-label="关闭弹窗" onClick={() => setModal(null)}>×</button>
    {modal === 'rules' ? <><span className="eyebrow">HOW TO PLAY</span><h2>设计、观察、再调整</h2><ol><li>每轮恢复至 {turnRules.energy} 点体力，手牌补至 {turnRules.hand} 张，上限 {turnRules.maxHand} 张。</li><li>自调与反制均按牌面费用消耗体力。各类卡牌都可连续使用，体力足够即可出牌；抽牌和回能遵守卡牌说明。参数跨轮保留。</li><li>玻璃等成套方案仅可用于自己；增减参数牌可用于自己或对手。参数到达边界后仍可打出，照常消耗卡牌与体力。</li><li>方案成本按当前配置计算。允许超预算；获胜时必须满足三个指标要求。</li><li>入门对手前 2 轮专注调整自己的建筑，随后偶尔反制。对手先确定本轮意图，不会针对你的最后一步重新计划。护盾保护一个变量至自己下次行动前。</li><li>本轮双方行动后评审。先达标者获胜，同轮达标比竞标分，再比更低成本，完全相同则平局。</li></ol><h3>三种不同的委托</h3><p>采光／能耗／成本权重依次为：{levels.map(lv => `${lv.name} ${metrics.map(metric => Math.round(lv.weights[metric] * 100)).join("/")}`).join("，")}。所有门槛都必须满足。</p><h3>数据与模型</h3><p>采光采用传感点等权汇总的 sDA；能耗为全年供暖、制冷、热水、设备与照明总和。Gothenburg 的 256 个端点组合来自 AR 仿真，中间档位通过近似计算得到。成本为教学点数，不代表真实报价。建筑模型是示意表达。</p><p>「针对性干扰」只调整对手可增减的参数，削减采光或增加能耗，不会更换玻璃；方案成本也随配置重算，参数防护可以拦截。使用后显示实际变化。「聚焦优化」已撤下。</p><small className="data-note">数据指纹 {provenance.sourceSha256.slice(0, 16)}</small></> : modal === 'deck' ? <><h2>设计行动与功能牌</h2><p>16 种设计行动，7 种功能牌。方案状态始终保留在建筑上。</p><div className="catalog">{cards.map(c => <Card id={c.id} key={c.id}/>)}</div></> : <><h2>方案比较</h2><p>数据只在出牌后揭晓。每轮评审都会保留双方方案的指标，下方记录每次出牌的实际变化。</p><div className="table-scroll"><table><thead><tr><th>阶段</th><th>你的采光</th><th>能耗</th><th>成本</th><th>对手采光</th><th>能耗</th><th>成本</th></tr></thead><tbody>{[{ round: 0, player: performance(l.initial), npc: performance(l.initial) }, ...game.history, { round: -1, player: performance(game.player.config), npc: performance(game.npc.config) }].map((h, i) => <tr key={i}><th>{h.round === 0 ? '初始' : h.round === -1 ? '当前' : `第 ${h.round} 轮`}</th>{(['player', 'npc'] as Side[]).flatMap(s => metrics.map(k => <td key={s + k}>{h[s][k].toFixed(1)}</td>))}</tr>)}</tbody></table></div><div className="event-log">{game.events.slice().reverse().map((e, i) => <div className="event-log-entry" key={i}><p><small>第 {e.round} 轮</small>{e.message}</p><PerformanceChange event={e}/></div>)}</div></>}
  </section></div>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
