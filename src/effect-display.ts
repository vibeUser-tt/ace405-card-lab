import { metricNames, metricUnits, playCard, review } from './game.ts';
import type { Game, Metric } from './game.ts';

export function metricChangeText(metric: Metric, delta: number) {
  const amount = Number(Math.abs(delta).toFixed(2));
  const unit = metric === 'D' ? '个百分点' : metricUnits[metric];
  return `${metricNames[metric]}${delta > 0 ? '增加' : delta < 0 ? '减少' : '变化'} ${amount} ${unit}`;
}

export function previewMetricChange(game: Game, index: number, mode: 'counter' | 'function', target: string, metric: Metric) {
  const next = playCard(game, index, mode, target, metric);
  if (next === game) return null;
  const side = mode === 'counter' || game.hand[index] === 'F06' ? 'npc' : 'player';
  const board = side === 'npc' ? game.npcBoard : game.playerBoard;
  return review(board, next.effects, side)[metric] - review(board, game.effects, side)[metric];
}
