import { Component, computed, effect, HostListener, inject, signal, untracked } from '@angular/core';
import { PlayerListComponent } from './features/player-list/player-list.component';
import { DiagramComponent } from './features/diagram/diagram.component';
import { DetailPanelComponent } from './features/detail-panel/detail-panel.component';
import { DataLoaderService } from './core/services/data-loader.service';
import { SimilarityService } from './core/services/similarity.service';
import { GraphStateService } from './core/services/graph-state.service';

@Component({
  selector: 'app-root',
  imports: [PlayerListComponent, DiagramComponent, DetailPanelComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly dataLoader = inject(DataLoaderService);
  protected readonly similarity = inject(SimilarityService);
  protected readonly graphState = inject(GraphStateService);
  protected readonly detailPanelOpen = signal(false);
  protected readonly screenTooSmall = signal(document.documentElement.clientWidth <= 1000);

  @HostListener('window:resize')
  onResize(): void {
    this.screenTooSmall.set(document.documentElement.clientWidth <= 1000);
  }

  readonly maxMinutes = computed(() => {
    const players = this.dataLoader.players();
    if (players.length === 0) return 3000;
    return Math.max(...players.map(p => p.minutesPlayed));
  });

  readonly minutesDisplay = signal(0);

  private initialized = false;

  constructor() {
    effect(() => {
      const ready = this.dataLoader.hasData() && !this.similarity.isComputing();
      if (ready && !this.initialized) {
        this.initialized = true;
        untracked(() => {
          this.graphState.initMinMinutes();
          this.minutesDisplay.set(this.graphState.minMinutes());
        });
      }
    });
  }

  onMinMinutesChange(value: number): void {
    this.graphState.minMinutes.set(value);
    this.graphState.applyMinMinutesFilter();
  }

  toggleDetailPanel(): void {
    this.detailPanelOpen.update(v => !v);
  }
}
