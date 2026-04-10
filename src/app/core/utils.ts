import type { ProcessedPlayer } from './models';

export function getMetricValue(player: ProcessedPlayer, metric: string): number {
  if (metric in player.metrics) return player.metrics[metric];
  const val = (player as unknown as Record<string, unknown>)[metric];
  return typeof val === 'number' && Number.isFinite(val) ? val : 0;
}
