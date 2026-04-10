import { ProcessedPlayer } from './player.model';

export type ExpansionCategory = 'att' | 'pas' | 'def';

export const ALL_CATEGORIES: ExpansionCategory[] = ['att', 'pas', 'def'];

export interface GraphNodeData {
  player: ProcessedPlayer;
  isRoot: boolean;
  expandedCategories: Set<ExpansionCategory>;
}

export interface GraphEdgeData {
  sourcePlayerId: string;
  targetPlayerId: string;
  category: ExpansionCategory;
  similarityScore: number;
}

export interface SimilarityResult {
  player: ProcessedPlayer;
  score: number;
  category: ExpansionCategory;
}
