import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { DataLoaderService } from '../../core/services/data-loader.service';
import { SimilarityService } from '../../core/services/similarity.service';
import { GraphStateService } from '../../core/services/graph-state.service';
import { type ProcessedPlayer, type PositionGroup } from '../../core/models';
import { POSITION_GROUP_COLORS } from '../../core/constants';

const ALL_POSITION_GROUPS: PositionGroup[] = ['CB', 'FB', 'DM', 'CM', 'AM', 'W', 'CF'];

function getSurname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

function toSurnameFirst(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const surname = parts.pop()!;
  return `${surname} ${parts.join(' ')}`;
}

@Component({
  selector: 'app-player-list',
  imports: [FormsModule, CdkVirtualScrollViewport, CdkFixedSizeVirtualScroll, CdkVirtualForOf],
  template: `
    @if (!dataLoader.hasData() && !dataLoader.isLoading()) {
      <div class="demo-banner">
        No data loaded. Add Wyscout XLSX exports to data/ and update manifest.json.
      </div>
    }

    @if (similarity.isComputing()) {
      <div class="computing-indicator">Computing similarities...</div>
    }

    <div class="search-section">
      <input
        type="text"
        class="search-input"
        placeholder="Search players..."
        [ngModel]="searchQuery()"
        (ngModelChange)="searchQuery.set($event)"
      />
    </div>

    <div class="filters-section">
      <div class="filter-row">
        <label>Position</label>
        <select
          class="filter-select"
          [ngModel]="selectedPositionGroup()"
          (ngModelChange)="selectedPositionGroup.set($event)"
        >
          <option value="all">All</option>
          @for (group of positionGroups; track group) {
            <option [value]="group">{{ group }}</option>
          }
        </select>
      </div>
    </div>

    <div class="player-count">{{ filteredPlayers().length }} players</div>

    <cdk-virtual-scroll-viewport itemSize="56" class="player-scroll">
      <div
        *cdkVirtualFor="let player of filteredPlayers(); trackBy: trackById"
        class="player-row"
        [class.disabled]="similarity.isComputing()"
        (click)="onPlayerClick(player)"
      >
        @if (confirmingPlayer()?.id === player.id) {
          <div class="confirm-bar">
            <span>Replace current graph?</span>
            <button class="confirm-btn yes" (click)="confirmReplace($event)">Yes</button>
            <button class="confirm-btn no" (click)="cancelReplace($event)">Cancel</button>
          </div>
        } @else {
          <span
            class="position-badge"
            [style.background]="getGroupColor(player.primaryGroup)"
          >{{ player.primaryGroup }}</span>
          <div class="player-info">
            <span class="player-name">{{ displayName(player.name) }}</span>
            <span class="player-meta">{{ player.team }} · {{ player.age }}</span>
          </div>
          <span class="row-hint">Set as root</span>
        }
      </div>
    </cdk-virtual-scroll-viewport>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .demo-banner {
      padding: 8px 12px;
      background: #2a2520;
      color: #ba7517;
      font-size: 11px;
      line-height: 1.4;
      border-bottom: 1px solid var(--color-panel-border);
    }

    .computing-indicator {
      padding: 6px 12px;
      background: #1a2530;
      color: var(--color-def);
      font-size: 11px;
      border-bottom: 1px solid var(--color-panel-border);
    }

    .search-section {
      padding: 12px;
      border-bottom: 1px solid var(--color-panel-border);
    }

    .search-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--color-panel-border);
      border-radius: 4px;
      background: #111;
      color: var(--color-sidebar-text);
      font-size: 13px;
      outline: none;

      &:focus {
        border-color: var(--color-sidebar-muted);
      }
    }

    .filters-section {
      padding: 8px 12px;
      border-bottom: 1px solid var(--color-panel-border);
    }

    .filter-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;

      label {
        font-size: 11px;
        color: var(--color-sidebar-muted);
        min-width: 60px;
      }
    }

    .filter-select {
      flex: 1;
      padding: 4px 6px;
      border: 1px solid var(--color-panel-border);
      border-radius: 3px;
      background: #111;
      color: var(--color-sidebar-text);
      font-size: 12px;
    }

    .player-count {
      padding: 6px 12px;
      font-size: 11px;
      color: var(--color-sidebar-muted);
      border-bottom: 1px solid var(--color-panel-border);
    }

    .player-scroll {
      flex: 1;
      min-height: 0;
    }

    .player-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      height: 56px;
      cursor: pointer;
      border-bottom: 1px solid #222;
      transition: background 150ms;
      position: relative;

      &:hover {
        background: #252525;
      }

      &.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
    }

    .row-hint {
      display: none;
      font-size: 10px;
      color: var(--color-sidebar-muted);
      white-space: nowrap;
      margin-left: auto;

      .player-row:hover & {
        display: block;
      }
    }

    .confirm-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      font-size: 11px;
      color: var(--color-sidebar-text);
    }

    .confirm-btn {
      padding: 2px 10px;
      border-radius: 3px;
      border: none;
      font-size: 11px;
      cursor: pointer;
      font-weight: 500;

      &.yes {
        background: var(--color-root-node);
        color: #fff;
      }

      &.no {
        background: transparent;
        border: 1px solid var(--color-panel-border);
        color: var(--color-sidebar-muted);
      }
    }

    .position-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 22px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      color: #fff;
      flex-shrink: 0;
    }

    .player-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .player-name {
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .player-meta {
      font-size: 11px;
      color: var(--color-sidebar-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `],
})
export class PlayerListComponent {
  protected readonly dataLoader = inject(DataLoaderService);
  protected readonly similarity = inject(SimilarityService);
  protected readonly graphState = inject(GraphStateService);

  readonly positionGroups = ALL_POSITION_GROUPS;

  readonly searchQuery = signal('');
  readonly selectedPositionGroup = signal<PositionGroup | 'all'>('all');
  readonly confirmingPlayer = signal<ProcessedPlayer | null>(null);

  readonly filteredPlayers = computed(() => {
    let players = this.dataLoader.players();
    const query = this.searchQuery().toLowerCase();
    const group = this.selectedPositionGroup();
    const minMin = this.graphState.minMinutes();

    if (query) {
      players = players.filter(p => p.name.toLowerCase().includes(query));
    }

    if (group !== 'all') {
      players = players.filter(p => p.primaryGroup === group);
    }

    if (minMin > 0) {
      players = players.filter(p => p.minutesPlayed >= minMin);
    }

    return [...players].sort((a, b) => getSurname(a.name).localeCompare(getSurname(b.name)));
  });

  trackById(_index: number, player: ProcessedPlayer): string {
    return player.id;
  }

  displayName(name: string): string {
    return toSurnameFirst(name);
  }

  getGroupColor(group: PositionGroup): string {
    return POSITION_GROUP_COLORS[group];
  }

  onPlayerClick(player: ProcessedPlayer): void {
    if (this.similarity.isComputing()) return;

    // If there's already a root, ask for confirmation
    if (this.graphState.rootPlayer() && this.graphState.graphNodes().size > 1) {
      this.confirmingPlayer.set(player);
      return;
    }

    this.graphState.setRootPlayer(player);
  }

  confirmReplace(event: MouseEvent): void {
    event.stopPropagation();
    const player = this.confirmingPlayer();
    if (player) {
      this.graphState.setRootPlayer(player);
      this.confirmingPlayer.set(null);
    }
  }

  cancelReplace(event: MouseEvent): void {
    event.stopPropagation();
    this.confirmingPlayer.set(null);
  }
}
