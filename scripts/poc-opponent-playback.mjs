import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { beginRun, playCard, endTurn, chooseAction } from '../src/game.ts';
import { opponentPlayback, newlyQualifiedMetric } from '../src/opponentPlayback.ts';
import { factors, label, performance } from '../src/model.ts';
import { metricParticles } from '../src/feedback.ts';
const { chromium } = await import('playwright').catch(() => import('file:///C:/Users/ROG/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const report = { cases: [], errors: [] }, out = 'validation/opponent-playback';
await mkdir(out, { recursive: true });
// The animation must not change the committed plan, reveal private cards, or
// review/refill between actions, including turns containing only hidden cards.
let hidden = 0;
for (let seed = 1; seed <= 500; seed++) {
    const g = beginRun(seed % 3, seed), original = JSON.stringify(g), p = opponentPlayback(g);
    assert.equal(JSON.stringify(g), original);
    assert.deepEqual(p.final, endTurn(g));
    const events = p.final.events.slice(g.events.length);
    hidden += events.filter(e => e.hidden).length;
    assert.deepEqual(p.steps.map(s => s.event), events.filter(e => !e.hidden));
    for (const step of p.steps) {
        assert.equal(step.state.round, g.round); assert.equal(step.state.phase, 'battle');
        assert.deepEqual(step.state.history, g.history);
    }
}
assert(hidden > 0);

function scenario(kind) {
    for (let seed = 1; seed <= 2000; seed++) {
        let g = beginRun(0, seed); const actions = [];
        for (let turn = 0; turn < 5 && g.phase === 'battle'; turn++) {
            const p = opponentPlayback(g), points = p.steps.map(s => s.event).filter(e => e.kind === 'point');
            const attack = points.find(e => e.mode === 'counter');
            const match = kind === 'multiple' ? points.length >= 2
                : kind === 'green' ? p.steps.some(s => newlyQualifiedMetric(s.event, g.level))
                : kind === 'boundary' ? points.some(e => e.before === e.after && !e.blocked)
                : kind === 'protected' ? attack && g.player.functionHand.includes('F08')
                : attack?.multiplier === 2;
            if (match) return { seed, actions, attack };
            while (true) { const a = chooseAction(g, 'player', 'skilled'); if (!a) break; actions.push(a); g = playCard(g, 'player', a); }
            actions.push(null); g = endTurn(g);
        }
    }
    throw Error('Missing scenario ' + kind);
}
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } : {}) });
async function play(page, g, a) {
    const id = (a.kind === 'point' ? g.player.hand : g.player.functionHand)[a.index];
    await page.locator(a.kind === 'point' ? '.hand .point-card' : '.hand .function-card').nth(a.index).click();
    if (a.kind === 'point') {
        await page.locator('.' + (a.mode === 'self' ? 'player' : 'npc') + ' [data-factor="' + a.factor + '"]').click();
        await page.locator('[data-direction="' + a.direction + '"]').click();
    } else if (id === 'F08') await page.locator('.player [data-factor="' + a.factor + '"]').click();
    else if (id === 'F02') await page.locator('.hand .point-card').nth(a.discard).click();
    if (a.kind === 'function') await page.locator('.confirm-action').click();
    await page.locator('.app-shell[data-play-stage]').waitFor({ state: 'detached' });
    return playCard(g, 'player', a);
}
async function finish(page, g) {
    await page.locator('.end-turn').click();
    await page.locator('.app-shell[data-opponent-stage]').waitFor({ state: 'detached', timeout: 90000 });
    return endTurn(g);
}
try {
    for (const kind of (process.argv.includes('--layout-only') ? [] : ['multiple', 'green', 'matched-counter', 'protected', 'boundary'])) {
        const found = scenario(kind), page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
        page.on('pageerror', e => report.errors.push(e.message));
        await page.goto((process.env.POC_URL || 'http://127.0.0.1:4180/') + '?seed=' + found.seed);
        await page.locator('.start').click(); await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor();
        let g = beginRun(0, found.seed);
        for (const a of found.actions) g = a ? await play(page, g, a) : await finish(page, g);
        if (kind === 'protected') g = await play(page, g, { kind: 'function', index: g.player.functionHand.indexOf('F08'), factor: found.attack.factor });
        const expected = opponentPlayback(g);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => {
            window.playbackSamples = []; window.samplePlayback = true;
            const sample = () => {
                if (!window.samplePlayback) return;
                const app = document.querySelector('.app-shell'), move = document.querySelector('.opponent-move');
                if (app.dataset.opponentStage) {
                    const slots = {}, metrics = {};
                    for (const side of ['player', 'npc']) {
                        for (const el of document.querySelectorAll('.' + side + ' [data-factor]')) slots[side + '.' + el.dataset.factor] = { text: el.querySelector('strong')?.textContent, rolling: el.dataset.rolling, impact: el.dataset.impact };
                        for (const el of document.querySelectorAll('.' + side + ' .stat:not(.cost-stat)')) metrics[side + '.' + el.dataset.metric] = { value: Number(el.querySelector('strong').textContent), rolling: el.dataset.rolling, gate: el.dataset.gateTransition };
                    }
                    window.playbackSamples.push({ t: performance.now(), step: move ? Number(move.dataset.step) : null, card: move?.dataset.card, target: move?.dataset.target,
                        stage: app.dataset.opponentStage, feedback: app.dataset.playStage, slots, metrics,
                        particles: [...document.querySelectorAll('.particle-stream')].map(el => ({ metric: el.dataset.metric, count: Number(el.dataset.count) })),
                        locked: [...document.querySelectorAll('.hand-card,.end-turn')].every(el => el.disabled),
                        result: !!document.querySelector('.result'), round: document.querySelector('.roundbar').textContent,
                        overflow: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 });
                }
                requestAnimationFrame(sample);
            }; requestAnimationFrame(sample);
        });
        await page.locator('.end-turn').click();
        await page.locator('.opponent-move.reveal').waitFor();
        await page.waitForTimeout(420);
        await page.screenshot({ path: out + '/' + kind + '-reveal.png' });
        await page.locator('.app-shell[data-opponent-stage]').waitFor({ state: 'detached', timeout: 90000 });
        const samples = await page.evaluate(() => { window.samplePlayback = false; return window.playbackSamples; });
        assert(samples.length > 50); assert(samples.every(s => s.locked && !s.result && s.round.includes('第 ' + g.round + ' 轮')));
        assert(samples.every(s => !s.overflow), 'one-screen desktop playback');
        assert.deepEqual([...new Set(samples.filter(s => s.step !== null).map(s => s.step))], expected.steps.map((_, i) => i));
        for (const [index, step] of expected.steps.entries()) {
            const e = step.event, ss = samples.filter(s => s.step === index), reveal = ss.filter(s => s.stage === 'reveal');
            assert(reveal.length > 10); assert(ss.every(s => s.card === e.card && s.target === e.target));
            if (e.kind !== 'point') continue;
            const key = e.target + '.' + e.factor;
            assert(reveal.every(s => s.slots[key].text === label(e.factor, e.before)), 'no update before reveal');
            const stages = [...new Set(ss.map(s => s.feedback).filter(Boolean))];
            assert(stages.includes('flight') && stages.includes('parameter'), 'parameter animation');
            if (e.before !== e.after) {
                assert(ss.some(s => s.slots[key].rolling === 'true'));
                const impacts = metricParticles(e);
                assert(ss.some(s => s.particles.length > 0));
                for (const impact of impacts) assert(ss.some(s => s.particles.some(p => p.metric === impact.metric && p.count === impact.count)));
                for (const k of ['D', 'E']) if (Math.abs(e.beforeValues[k] - e.afterValues[k]) > 1e-8) {
                    assert(ss.some(s => s.metrics[e.target + '.' + k].rolling === 'true'));
                    assert(ss.every(s => s.feedback !== 'parameter' || Math.abs(s.metrics[e.target + '.' + k].value - e.beforeValues[k]) <= .05001));
                }
            } else {
                assert(ss.every(s => !s.particles.length));
                assert(ss.some(s => s.slots[key].impact === (e.blocked ? 'blocked' : 'unchanged')));
            }
            for (const k of ['D', 'E']) assert(ss.every(s => s.metrics[e.target + '.' + k].rolling !== 'true' || s.metrics[e.target + '.' + k].gate !== 'passed'), 'green after rolling');
            if (newlyQualifiedMetric(e, g.level)) {
                const green = ss.filter(s => ['D', 'E'].some(k => s.metrics[e.target + '.' + k].gate === 'passed'));
                assert(green.length > 0); assert(ss.at(-1).t - green[0].t >= 1400, 'green finishes before next action/review');
            }
        }
        for (const side of ['player', 'npc']) {
            for (const f of factors) assert.equal(await page.locator('.' + side + ' [data-factor="' + f + '"] strong').innerText(), label(f, expected.final[side].config[f]));
            const values = performance(expected.final[side].config);
            for (const k of ['D', 'E']) assert(Math.abs(Number(await page.locator('.' + side + ' [data-metric="' + k + '"] strong').innerText()) - values[k]) <= .05001);
        }
        report.cases.push({ kind, seed: found.seed, round: g.round, cards: expected.steps.map(s => s.event.card), frames: samples.length, elapsed: samples.at(-1).t - samples[0].t });
        console.log('PASS playback ' + kind); await page.close();
    }
    for (const viewport of [{ width: 1280, height: 600 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
        page.on('pageerror', e => report.errors.push(e.message));
        await page.goto((process.env.POC_URL || 'http://127.0.0.1:4180/') + '?seed=1');
        await page.locator('.start').click(); await page.locator('.building-view[data-assets="ready"]').nth(1).waitFor();
        await page.locator('.end-turn').click(); await page.locator('.opponent-move.reveal').waitFor();
        const layout = await page.evaluate(() => {
            const move = document.querySelector('.opponent-move'), card = document.querySelector('.opponent-card');
            const a = move.getBoundingClientRect(), b = card.getBoundingClientRect();
            return { width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight,
                move: a.toJSON(), card: b.toJSON(), contained: b.top >= a.top && b.bottom <= a.bottom && b.left >= a.left && b.right <= a.right, color: getComputedStyle(card).color };
        });
        assert(layout.contained, 'opponent card contained in model area: ' + JSON.stringify(layout));
        assert(layout.pageWidth <= viewport.width + 1);
        if (viewport.width >= 1000) assert(layout.pageHeight <= viewport.height + 1);
        assert(['rgb(184, 70, 69)', 'rgb(23, 63, 96)'].includes(layout.color), 'visible dark card text');
        await page.locator('.opponent-move').scrollIntoViewIfNeeded();
        await page.screenshot({ path: out + '/layout-' + viewport.width + '.png' });
        // Resizing mid-animation must settle that action, then continue the queue.
        await page.locator('.opponent-move.effect').waitFor();
        await page.setViewportSize({ ...viewport, height: viewport.height + 1 });
        await page.locator('.app-shell[data-opponent-stage]').waitFor({ state: 'detached', timeout: 60000 });
        assert.equal(await page.locator('.end-turn').isEnabled(), true);
        const expected = endTurn(beginRun(0, 1));
        for (const f of factors) assert.equal(await page.locator('.npc [data-factor="' + f + '"] strong').innerText(), label(f, expected.npc.config[f]));
        // Leaving during a reveal cancels queued callbacks, including final review.
        await page.locator('.end-turn').click(); await page.locator('.opponent-move.reveal').waitFor();
        page.once('dialog', d => d.accept()); await page.locator('.brand').click();
        await page.locator('.intro').waitFor(); await page.waitForTimeout(1800);
        assert.equal(await page.locator('.opponent-move,.result,.metric-particles').count(), 0);
        assert.equal(await page.locator('.intro').count(), 1);
        report.cases.push({ kind: 'layout-resize-cancel', viewport, layout });
        console.log('PASS playback layout/resize/cancel ' + viewport.width); await page.close();
    }
    assert.deepEqual(report.errors, []);
} finally { await writeFile('validation/points-opponent-playback' + (process.argv.includes('--layout-only') ? '-layout' : '') + '.json', JSON.stringify(report, null, 2)); await browser.close(); }
