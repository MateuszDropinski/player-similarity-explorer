import { Component, computed, inject, input } from '@angular/core';
import {
  type Edge,
  type NgDiagramEdgeTemplate,
  NgDiagramBaseEdgeComponent,
  NgDiagramBaseEdgeLabelComponent,
} from 'ng-diagram';
import { type GraphEdgeData, type ExpansionCategory } from '../../../core/models';
import { GraphStateService } from '../../../core/services/graph-state.service';
import { CATEGORY_COLORS } from '../../../core/constants';

const CATEGORY_LABELS: Record<ExpansionCategory, string> = {
  att: 'A',
  pas: 'P',
  def: 'D',
};

const CATEGORY_LABEL_POSITION: Record<ExpansionCategory, number> = {
  att: 0.4,
  pas: 0.5,
  def: 0.6,
};

@Component({
  selector: 'app-similarity-edge',
  imports: [NgDiagramBaseEdgeComponent, NgDiagramBaseEdgeLabelComponent],
  template: `
    <ng-diagram-base-edge
      [edge]="edge()"
      [stroke]="strokeColor()"
      [strokeWidth]="strokeWidth()"
      [strokeOpacity]="strokeOpacity()"
    >
      <ng-diagram-base-edge-label id="score" [positionOnEdge]="labelPosition()">
        <div
          class="edge-label"
          [class.selected]="isSelected()"
          [style.background]="strokeColor()"
        >{{ label() }}</div>
      </ng-diagram-base-edge-label>
    </ng-diagram-base-edge>
  `,
  styles: [`
    :host {
      cursor: pointer;
    }

    .edge-label {
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      pointer-events: none;
      transition: box-shadow 150ms;

      &.selected {
        box-shadow: 0 0 0 2px #fff, 0 0 8px rgba(255, 255, 255, 0.4);
        font-size: 10px;
        padding: 2px 7px;
      }
    }
  `],
  host: {
    '(click)': 'onClick($event)',
  },
})
export class SimilarityEdgeComponent implements NgDiagramEdgeTemplate<Record<string, unknown>> {
  edge = input.required<Edge<Record<string, unknown>>>();

  private readonly graphState = inject(GraphStateService);

  private readonly edgeData = computed(() => this.edge().data as unknown as GraphEdgeData);

  readonly isSelected = computed(() => {
    const sel = this.graphState.selectedEdge();
    if (!sel) return false;
    const d = this.edgeData();
    return sel.sourcePlayerId === d.sourcePlayerId
      && sel.targetPlayerId === d.targetPlayerId
      && sel.category === d.category;
  });

  readonly labelPosition = computed(() => CATEGORY_LABEL_POSITION[this.edgeData().category]);

  readonly strokeColor = computed(() => CATEGORY_COLORS[this.edgeData().category]);

  readonly strokeWidth = computed(() => {
    if (this.isSelected()) return 6;
    const score = this.edgeData().similarityScore;
    return 1 + score * 4;
  });

  readonly strokeOpacity = computed(() => {
    if (this.isSelected()) return 1;
    const score = this.edgeData().similarityScore;
    return 0.2 + score * 0.7;
  });

  readonly label = computed(() => {
    const data = this.edgeData();
    return CATEGORY_LABELS[data.category] + ' ' + (data.similarityScore * 100).toFixed(0) + '%';
  });

  onClick(event: MouseEvent): void {
    event.stopPropagation();
    this.graphState.selectEdge(this.edgeData());
  }
}
