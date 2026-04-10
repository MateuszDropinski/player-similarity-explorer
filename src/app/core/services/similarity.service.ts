import { Injectable, signal } from '@angular/core';
import {
  type ProcessedPlayer,
  type ExpansionCategory,
  type SimilarityResult,
  ATT_METRICS,
  PAS_METRICS,
  DEF_METRICS,
} from '../models';

/**
 * Euclidean distance-based similarity: 1 / (1 + d).
 * Captures both profile shape AND magnitude differences (unlike cosine similarity).
 * Returns a value in (0, 1] where 1 = identical vectors.
 */
function euclideanSimilarity(a: number[], b: number[]): number {
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  const distance = Math.sqrt(sumSq);
  return 1 / (1 + distance);
}

const METRIC_COUNTS: Record<ExpansionCategory, number> = {
  att: ATT_METRICS.length,
  pas: PAS_METRICS.length,
  def: DEF_METRICS.length,
};

@Injectable({ providedIn: 'root' })
export class SimilarityService {
  readonly isComputing = signal(false);

  private worker: Worker | null = null;
  private resolveWorker: ((players: ProcessedPlayer[]) => void) | null = null;

  initializeWorker(players: ProcessedPlayer[]): Promise<ProcessedPlayer[]> {
    this.isComputing.set(true);

    return new Promise<ProcessedPlayer[]>((resolve) => {
      this.resolveWorker = resolve;

      this.worker = new Worker(
        new URL('../workers/similarity.worker', import.meta.url),
        { type: 'module' },
      );

      this.worker.onmessage = ({ data }) => {
        if (data.type === 'ZSCORES_READY') {
          this.isComputing.set(false);
          this.resolveWorker?.(data.players);
          this.resolveWorker = null;
          this.worker?.terminate();
          this.worker = null;
        }
      };

      this.worker.onerror = (err) => {
        console.error('Similarity worker error:', err);
        this.isComputing.set(false);
        this.resolveWorker?.(players);
        this.resolveWorker = null;
        this.worker?.terminate();
        this.worker = null;
      };

      this.worker.postMessage({ type: 'COMPUTE_ZSCORES', players });
    });
  }

  computeSimilarity(a: ProcessedPlayer, b: ProcessedPlayer, category: ExpansionCategory): number {
    const va = a.zScores[category];
    const vb = b.zScores[category];
    if (!va || !vb || va.length !== METRIC_COUNTS[category] || vb.length !== va.length) return 0;
    return euclideanSimilarity(va, vb);
  }

  findAboveThreshold(
    targetPlayer: ProcessedPlayer,
    category: ExpansionCategory,
    candidatePool: ProcessedPlayer[],
    threshold: number,
  ): SimilarityResult[] {
    const targetVector = targetPlayer.zScores[category];

    if (!targetVector || targetVector.length !== METRIC_COUNTS[category]) {
      return [];
    }

    const results: SimilarityResult[] = [];

    for (const candidate of candidatePool) {
      if (candidate.id === targetPlayer.id) continue;

      const candidateVector = candidate.zScores[category];
      if (!candidateVector || candidateVector.length !== targetVector.length) continue;

      const score = euclideanSimilarity(targetVector, candidateVector);
      if (score >= threshold) {
        results.push({ player: candidate, score, category });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

}
