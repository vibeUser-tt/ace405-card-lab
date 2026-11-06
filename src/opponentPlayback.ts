import { endTurn, playCard } from './game.ts';
import type { Event, Game } from './game.ts';
import { gates, levels } from './model.ts';

export type OpponentStep = { event: Event; state: Game };
export type OpponentPlayback = { steps: OpponentStep[]; final: Game; index: number; stage: 'reveal' | 'effect' };

// Replay the already committed plan. Review/refill happen only in the final
// snapshot, and hidden actions never become public playback steps.
export function opponentPlayback(game: Game): OpponentPlayback {
    let state = game;
    const steps: OpponentStep[] = [];
    if (game.first === 'player') for (const action of game.npcPlan) {
        const next = playCard(state, 'npc', action);
        if (next.events.length > state.events.length) {
            const event = next.events.at(-1)!;
            if (!event.hidden) steps.push({ event, state: next });
        }
        state = next;
    }
    return { steps, final: endTurn(game), index: 0, stage: 'reveal' };
}

export function newlyQualifiedMetric(event: Event, level: number) {
    if (!event.beforeValues || !event.afterValues) return false;
    const before = gates(event.beforeValues, levels[level]), after = gates(event.afterValues, levels[level]);
    return (['D', 'E'] as const).some(k => !before[k] && after[k]);
}
