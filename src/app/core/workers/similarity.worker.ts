/// <reference lib="webworker" />

import {
  type ProcessedPlayer,
  ATT_METRICS,
  PAS_METRICS,
  DEF_METRICS,
  SHRINKAGE_PRIOR_MINUTES,
} from '../models';
import { getMetricValue } from '../utils';

interface WorkerInput {
  type: 'COMPUTE_ZSCORES';
  players: ProcessedPlayer[];
}

interface WorkerOutput {
  type: 'ZSCORES_READY';
  players: ProcessedPlayer[];
}

addEventListener('message', ({ data }: MessageEvent<WorkerInput>) => {
  if (data.type === 'COMPUTE_ZSCORES') {
    const enriched = computeAllZScores(data.players);
    postMessage({ type: 'ZSCORES_READY', players: enriched } satisfies WorkerOutput);
  }
});

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/**
 * Bayesian shrinkage: regress each player's metric values toward the position-group
 * mean proportional to their minutes played. Players with fewer minutes are pulled
 * more strongly toward the group average, reflecting statistical uncertainty in
 * small-sample per-90 values.
 *
 * adjusted = w * observed + (1 - w) * group_mean
 * where w = minutes / (minutes + SHRINKAGE_PRIOR_MINUTES)
 */
function applyShrinkage(players: ProcessedPlayer[], allMetrics: readonly string[]): void {
  const groups = groupBy(players, p => p.primaryGroup);

  for (const [, groupPlayers] of groups) {
    // Compute group means for each metric
    const groupMeans: number[] = allMetrics.map(metric => {
      const values = groupPlayers.map(p => getMetricValue(p, metric));
      return mean(values);
    });

    for (const player of groupPlayers) {
      const weight = player.minutesPlayed / (player.minutesPlayed + SHRINKAGE_PRIOR_MINUTES);

      for (let mi = 0; mi < allMetrics.length; mi++) {
        const metric = allMetrics[mi];
        const observed = getMetricValue(player, metric);
        const adjusted = weight * observed + (1 - weight) * groupMeans[mi];

        // Write back to the player's metrics or derived fields
        if (metric in player.metrics) {
          player.metrics[metric] = adjusted;
        } else {
          (player as unknown as Record<string, number>)[metric] = adjusted;
        }
      }
    }
  }
}

function computeZScoresWithinGroup(
  players: ProcessedPlayer[],
  metrics: readonly string[],
  vectorKey: 'att' | 'pas' | 'def',
): void {
  const groups = groupBy(players, p => p.primaryGroup);

  for (const [, groupPlayers] of groups) {
    for (let mi = 0; mi < metrics.length; mi++) {
      const metric = metrics[mi];
      const values = groupPlayers.map(p => getMetricValue(p, metric));
      const avg = mean(values);
      const std = stdDev(values, avg);

      for (let pi = 0; pi < groupPlayers.length; pi++) {
        const val = values[pi];
        groupPlayers[pi].zScores[vectorKey][mi] = std === 0 ? 0 : (val - avg) / std;
      }
    }
  }
}

/** Binary search: returns the count of elements in a sorted array that are strictly less than target. */
function lowerBound(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function computePercentiles(
  players: ProcessedPlayer[],
  metrics: readonly string[],
  vectorKey: 'att' | 'pas' | 'def',
): void {
  const groupsToProcess = [...groupBy(players, p => p.primaryGroup).values()];

  for (const groupPlayers of groupsToProcess) {
    for (let mi = 0; mi < metrics.length; mi++) {
      const metric = metrics[mi];
      const values = groupPlayers.map(p => getMetricValue(p, metric));

      const sorted = [...values].sort((a, b) => a - b);
      const divisor = groupPlayers.length - 1 || 1;

      for (let pi = 0; pi < groupPlayers.length; pi++) {
        const rank = lowerBound(sorted, values[pi]);
        groupPlayers[pi].percentiles[vectorKey][mi] = Math.round((rank / divisor) * 100);
      }
    }
  }
}

function computeAllZScores(players: ProcessedPlayer[]): ProcessedPlayer[] {
  for (const player of players) {
    player.zScores = {
      att: new Array(ATT_METRICS.length).fill(0),
      pas: new Array(PAS_METRICS.length).fill(0),
      def: new Array(DEF_METRICS.length).fill(0),
    };
    player.percentiles = {
      att: new Array(ATT_METRICS.length).fill(0),
      pas: new Array(PAS_METRICS.length).fill(0),
      def: new Array(DEF_METRICS.length).fill(0),
    };
  }

  // Apply Bayesian shrinkage before z-score computation to stabilize low-minute players
  const allMetrics: readonly string[] = [...ATT_METRICS, ...PAS_METRICS, ...DEF_METRICS];
  applyShrinkage(players, allMetrics);

  computeZScoresWithinGroup(players, ATT_METRICS, 'att');
  computeZScoresWithinGroup(players, PAS_METRICS, 'pas');
  computeZScoresWithinGroup(players, DEF_METRICS, 'def');

  computePercentiles(players, ATT_METRICS, 'att');
  computePercentiles(players, PAS_METRICS, 'pas');
  computePercentiles(players, DEF_METRICS, 'def');

  return players;
}
