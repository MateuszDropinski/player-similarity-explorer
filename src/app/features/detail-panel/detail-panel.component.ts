import { Component, computed, inject, signal } from '@angular/core';
import { GraphStateService } from '../../core/services/graph-state.service';
import { SimilarityService } from '../../core/services/similarity.service';
import { DataLoaderService } from '../../core/services/data-loader.service';
import { RadarChartComponent } from '../../shared/components/radar-chart/radar-chart.component';
import {
  type ProcessedPlayer,
  type ExpansionCategory,
  ALL_CATEGORIES,
} from '../../core/models';
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_METRICS,
  METRIC_LABELS,
  POSITION_GROUP_COLORS,
  TOP_SIMILARITIES_COUNT,
} from '../../core/constants';
import { getMetricValue } from '../../core/utils';

const MULTI_COLORS = ['#e8593c', '#1d9e75', '#378add', '#ba7517'];

function formatValue(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(2);
}

function formatMarketValue(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return `€${value}`;
}

@Component({
  selector: 'app-detail-panel',
  imports: [RadarChartComponent],
  template: `
    <div class="detail-panel">
      @switch (panelState()) {
        @case ('empty') {
          <div class="empty-state">
            <p>Click a player in the list to set them as the root node, then click the
              <strong>A</strong> / <strong>P</strong> / <strong>D</strong>
              badges to explore similar players.</p>
          </div>
        }
        @case ('single') {
          @if (singlePlayer(); as player) {
            <div class="single-view">
              <!-- Player card -->
              <div class="player-card">
                <h2 class="player-card-name">{{ player.name }}</h2>
                <div class="player-card-row">
                  <span class="position-badge" [style.background]="getPositionColor(player)">{{ player.primaryGroup }}</span>
                  <span class="player-card-team">{{ player.team }}</span>
                  @if (player.onLoan) { <span class="loan-tag">On loan</span> }
                </div>
                <div class="player-card-details">
                  <div class="detail-item"><span class="detail-label">Age</span><span>{{ player.age }}</span></div>
                  <div class="detail-item"><span class="detail-label">Height</span><span>{{ player.height }} cm</span></div>
                  <div class="detail-item"><span class="detail-label">Foot</span><span>{{ player.foot }}</span></div>
                  <div class="detail-item"><span class="detail-label">Country</span><span>{{ player.birthCountry }}</span></div>
                  <div class="detail-item"><span class="detail-label">Value</span><span>{{ formatMV(player.marketValue) }}</span></div>
                  <div class="detail-item"><span class="detail-label">Contract</span><span>{{ player.contractExpires }}</span></div>
                  <div class="detail-item"><span class="detail-label">Minutes</span><span>{{ player.minutesPlayed.toLocaleString() }}</span></div>
                  <div class="detail-item"><span class="detail-label">Matches</span><span>{{ player.matchesPlayed }}</span></div>
                </div>
              </div>

              <!-- Radar tabs -->
              <div class="radar-section">
                <div class="radar-tabs">
                  @for (cat of categories; track cat) {
                    <button
                      class="radar-tab"
                      [class.active]="activeCategory() === cat"
                      [style.--tab-color]="getCategoryColor(cat)"
                      (click)="activeCategory.set(cat)"
                    >{{ getCategoryLabel(cat) }}</button>
                  }
                </div>
                <div class="radar-container">
                  <app-radar-chart
                    [players]="[{ player: player, color: getCategoryColor(activeCategory()) }]"
                    [category]="activeCategory()"
                    [size]="300"
                    [showValues]="true"
                  />
                </div>
              </div>

              <!-- Top similarities -->
              <div class="similarities-section">
                @for (cat of categories; track cat) {
                  @if (topSimilarities()[cat]; as sims) {
                    @if (sims.length > 0) {
                      <div class="sim-group">
                        <h4 class="sim-group-title" [style.color]="getCategoryColor(cat)">{{ getCategoryLabel(cat) }}</h4>
                        @for (sim of sims; track sim.player.id; let i = $index) {
                          <div class="sim-row">
                            <span class="sim-rank">{{ i + 1 }}.</span>
                            <span class="sim-name">{{ sim.player.name }}</span>
                            <span class="sim-score">{{ sim.score.toFixed(2) }}</span>
                            <div class="sim-bar">
                              <div class="sim-bar-fill" [style.width.%]="sim.score * 100" [style.background]="getCategoryColor(cat)"></div>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  }
                }
              </div>
            </div>
          }
        }
        @case ('multi') {
          <div class="multi-view">
            <h3 class="section-title">Player Comparison</h3>

            <!-- Radar tabs -->
            <div class="radar-section">
              <div class="radar-tabs">
                @for (cat of categories; track cat) {
                  <button
                    class="radar-tab"
                    [class.active]="activeCategory() === cat"
                    [style.--tab-color]="getCategoryColor(cat)"
                    (click)="activeCategory.set(cat)"
                  >{{ getCategoryLabel(cat) }}</button>
                }
              </div>
              <div class="radar-container">
                <app-radar-chart
                  [players]="multiPlayerEntries()"
                  [category]="activeCategory()"
                  [size]="300"
                />
              </div>
              <div class="radar-legend">
                @for (entry of multiPlayerEntries(); track entry.color) {
                  <div class="legend-item">
                    <span class="legend-dot" [style.background]="entry.color"></span>
                    <span>{{ entry.player.name }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Stats table -->
            <div class="stats-table-container">
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    @for (p of graphState.selectedPlayers(); track p.id) {
                      <th>{{ p.name.split(' ').pop() }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (metric of comparisonMetrics(); track metric) {
                    <tr>
                      <td class="metric-name">{{ getMetricLabel(metric) }}</td>
                      @for (p of graphState.selectedPlayers(); track p.id) {
                        <td
                          [class.best]="isBestValue(p, metric)"
                        >{{ formatVal(getPlayerMetric(p, metric)) }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
        @case ('edge') {
          @if (graphState.selectedEdge(); as edge) {
            <div class="edge-view">
              <h3 class="section-title edge-title">
                <span [style.color]="getCategoryColor(edge.category)">{{ getCategoryLabel(edge.category) }}</span> similarity
              </h3>
              <div class="edge-score">{{ edge.similarityScore.toFixed(2) }}</div>
              <div class="edge-players">
                {{ getPlayerName(edge.sourcePlayerId) }} — {{ getPlayerName(edge.targetPlayerId) }}
              </div>

              <!-- Metric breakdown -->
              <div class="metric-breakdown">
                @for (metric of getEdgeMetrics(edge.category); track metric) {
                  <div class="breakdown-row">
                    <span class="breakdown-label">{{ getMetricLabel(metric) }}</span>
                    <div class="breakdown-bars">
                      <div class="breakdown-bar-container">
                        <div
                          class="breakdown-bar"
                          [style.width.%]="getZScoreWidth(edge.sourcePlayerId, edge.category, $index)"
                          [style.background]="getCategoryColor(edge.category)"
                        ></div>
                        <span class="breakdown-value">{{ formatVal(getPlayerMetricById(edge.sourcePlayerId, metric)) }}</span>
                      </div>
                      <div class="breakdown-bar-container">
                        <div
                          class="breakdown-bar"
                          [style.width.%]="getZScoreWidth(edge.targetPlayerId, edge.category, $index)"
                          [style.background]="getCategoryColor(edge.category)"
                          style="opacity: 0.6"
                        ></div>
                        <span class="breakdown-value">{{ formatVal(getPlayerMetricById(edge.targetPlayerId, metric)) }}</span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow: hidden; }

    .detail-panel {
      height: 100%;
      overflow-y: auto;
      padding: 16px;
    }

    .empty-state {
      display: flex; align-items: center; justify-content: center;
      height: 100%; text-align: center;
      p { color: var(--color-sidebar-muted); font-size: 13px; line-height: 1.6; padding: 0 20px; }
      strong { color: var(--color-sidebar-text); }
    }

    /* Player card */
    .player-card { margin-bottom: 16px; }
    .player-card-name { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
    .player-card-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .position-badge {
      padding: 2px 8px; border-radius: 3px;
      font-size: 10px; font-weight: 600; color: #fff;
    }
    .player-card-team { font-size: 13px; color: var(--color-sidebar-muted); }
    .loan-tag {
      font-size: 10px; padding: 1px 6px;
      border: 1px solid #ba7517; color: #ba7517;
      border-radius: 3px;
    }
    .player-card-details { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .detail-item {
      display: flex; justify-content: space-between;
      font-size: 12px; padding: 3px 0;
      border-bottom: 1px solid #222;
    }
    .detail-label { color: var(--color-sidebar-muted); }

    /* Radar */
    .radar-section { margin-bottom: 16px; }
    .radar-tabs {
      display: flex; gap: 4px; margin-bottom: 8px;
    }
    .radar-tab {
      flex: 1; padding: 4px 0;
      border: 1px solid #333; border-radius: 4px;
      background: transparent; color: var(--color-sidebar-muted);
      font-size: 10px; cursor: pointer; transition: all 150ms;
      &.active { background: var(--tab-color); color: #fff; border-color: var(--tab-color); }
      &:hover:not(.active) { border-color: var(--tab-color); color: var(--tab-color); }
    }
    .radar-container { display: flex; justify-content: center; }

    /* Legend */
    .radar-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; }

    /* Similarities */
    .similarities-section { margin-top: 12px; }
    .sim-group { margin-bottom: 12px; }
    .sim-group-title { font-size: 11px; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .sim-row {
      display: grid; grid-template-columns: 16px 1fr auto auto;
      align-items: center; gap: 4px;
      font-size: 11px; padding: 3px 0;
    }
    .sim-rank { color: var(--color-sidebar-muted); }
    .sim-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sim-score { font-weight: 500; font-size: 11px; }
    .sim-bar { height: 3px; background: #222; border-radius: 2px; grid-column: 1 / -1; }
    .sim-bar-fill { height: 100%; border-radius: 2px; transition: width 300ms; }

    /* Section title */
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }

    /* Stats table */
    .stats-table-container { margin-top: 12px; overflow-x: auto; }
    .stats-table {
      width: 100%; border-collapse: collapse; font-size: 11px;
      th, td { padding: 4px 6px; text-align: right; border-bottom: 1px solid #222; }
      th { color: var(--color-sidebar-muted); font-weight: 500; font-size: 10px; }
      td:first-child, th:first-child { text-align: left; }
      .metric-name { color: var(--color-sidebar-muted); }
      .best { color: #1d9e75; font-weight: 600; }
    }

    /* Edge view */
    .edge-title { font-size: 13px; }
    .edge-score { font-size: 36px; font-weight: 700; margin: 8px 0; }
    .edge-players { font-size: 12px; color: var(--color-sidebar-muted); margin-bottom: 16px; }

    .metric-breakdown { margin-top: 8px; }
    .breakdown-row { margin-bottom: 8px; }
    .breakdown-label { font-size: 10px; color: var(--color-sidebar-muted); display: block; margin-bottom: 2px; }
    .breakdown-bars { display: flex; flex-direction: column; gap: 2px; }
    .breakdown-bar-container {
      display: flex; align-items: center; gap: 6px;
      height: 14px;
    }
    .breakdown-bar {
      height: 8px; border-radius: 2px;
      min-width: 2px; max-width: 80%;
      transition: width 300ms;
    }
    .breakdown-value { font-size: 10px; color: var(--color-sidebar-text); white-space: nowrap; }
  `],
})
export class DetailPanelComponent {
  readonly graphState = inject(GraphStateService);
  private readonly similarity = inject(SimilarityService);
  private readonly dataLoader = inject(DataLoaderService);

  readonly categories = ALL_CATEGORIES;
  readonly activeCategory = signal<ExpansionCategory>('att');

  readonly comparisonMetrics = computed(() => CATEGORY_METRICS[this.activeCategory()]);

  readonly panelState = computed<'empty' | 'single' | 'multi' | 'edge'>(() => {
    if (this.graphState.selectedEdge()) return 'edge';
    const count = this.graphState.selectedNodeIds().length;
    if (count === 0) return 'empty';
    if (count === 1) return 'single';
    return 'multi';
  });

  readonly singlePlayer = computed(() => {
    const players = this.graphState.selectedPlayers();
    return players.length === 1 ? players[0] : null;
  });

  readonly multiPlayerEntries = computed(() =>
    this.graphState.selectedPlayers().slice(0, 4).map((player, i) => ({
      player,
      color: MULTI_COLORS[i],
    }))
  );

  readonly topSimilarities = computed(() => {
    const player = this.singlePlayer();
    if (!player) return { att: [], pas: [], def: [] };

    const allPlayers = this.dataLoader.players();
    const pool = allPlayers.filter(p =>
      p.id !== player.id && p.primaryGroup === player.primaryGroup
    );

    const result: Record<ExpansionCategory, { player: ProcessedPlayer; score: number }[]> = {
      att: [], pas: [], def: [],
    };

    for (const cat of ALL_CATEGORIES) {
      result[cat] = this.similarity.findAboveThreshold(player, cat, pool, 0).slice(0, TOP_SIMILARITIES_COUNT);
    }

    return result;
  });

  getPositionColor(player: ProcessedPlayer): string {
    return POSITION_GROUP_COLORS[player.primaryGroup] ?? '#666';
  }

  getCategoryLabel(cat: ExpansionCategory): string { return CATEGORY_LABELS[cat]; }
  getCategoryColor(cat: ExpansionCategory): string { return CATEGORY_COLORS[cat]; }
  getMetricLabel(metric: string): string { return METRIC_LABELS[metric] ?? metric; }
  formatMV(value: number): string { return formatMarketValue(value); }
  formatVal(value: number): string { return formatValue(value); }

  getPlayerMetric(player: ProcessedPlayer, metric: string): number {
    return getMetricValue(player, metric);
  }

  getPlayerMetricById(playerId: string, metric: string): number {
    const player = this.graphState.graphNodes().get(playerId)?.player;
    return player ? getMetricValue(player, metric) : 0;
  }

  getPlayerName(playerId: string): string {
    return this.graphState.graphNodes().get(playerId)?.player.name ?? playerId;
  }

  isBestValue(player: ProcessedPlayer, metric: string): boolean {
    const players = this.graphState.selectedPlayers();
    if (players.length < 2) return false;
    const val = getMetricValue(player, metric);
    const maxVal = Math.max(...players.map(p => getMetricValue(p, metric)));
    if (val < maxVal) return false;
    const countAtMax = players.filter(p => getMetricValue(p, metric) === maxVal).length;
    return countAtMax < players.length;
  }

  getEdgeMetrics(category: ExpansionCategory): readonly string[] {
    return CATEGORY_METRICS[category];
  }

  getZScoreWidth(playerId: string, category: ExpansionCategory, metricIndex: number): number {
    const player = this.graphState.graphNodes().get(playerId)?.player;
    if (!player) return 0;
    const percentile = player.percentiles[category]?.[metricIndex] ?? 50;
    return Math.max(2, percentile);
  }
}
