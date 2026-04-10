import { Component, effect, inject, signal, type OnInit } from '@angular/core';
import {
  NgDiagramComponent,
  NgDiagramNodeTemplateMap,
  NgDiagramEdgeTemplateMap,
  NgDiagramModelService,
  NgDiagramViewportService,
  NgDiagramService,
  NgDiagramSelectionService,
  provideNgDiagram,
  initializeModel,
  type NgDiagramConfig,
  type SelectionChangedEvent,
} from 'ng-diagram';
import { GraphStateService } from '../../core/services/graph-state.service';
import { type ExpansionCategory } from '../../core/models';
import { MAX_SELECTED_NODES } from '../../core/constants';
import { PlayerNodeComponent } from './components/player-node.component';
import { SimilarityEdgeComponent } from './components/similarity-edge.component';

@Component({
  selector: 'app-diagram',
  imports: [NgDiagramComponent],
  providers: [provideNgDiagram()],
  template: `
    <div class="diagram-wrapper">
      <ng-diagram
        [model]="model"
        [config]="diagramConfig"
        [nodeTemplateMap]="nodeTemplateMap"
        [edgeTemplateMap]="edgeTemplateMap"
        (selectionChanged)="onSelectionChanged($event)"
      />

      @if (graphState.rootPlayer()) {
        <div class="diagram-toolbar">
          <span class="toolbar-label">Threshold (%):</span>
          <div class="threshold-group">
            <label class="toolbar-label" style="color: var(--color-att)">A:</label>
            <input type="number" class="toolbar-input" min="20" max="99" step="1"
              [value]="thresholdAtt()" (change)="onThresholdChange('att', +$any($event.target).value)" />
          </div>
          <div class="threshold-group">
            <label class="toolbar-label" style="color: var(--color-pas)">P:</label>
            <input type="number" class="toolbar-input" min="20" max="99" step="1"
              [value]="thresholdPas()" (change)="onThresholdChange('pas', +$any($event.target).value)" />
          </div>
          <div class="threshold-group">
            <label class="toolbar-label" style="color: var(--color-def)">D:</label>
            <input type="number" class="toolbar-input" min="20" max="99" step="1"
              [value]="thresholdDef()" (change)="onThresholdChange('def', +$any($event.target).value)" />
          </div>
          <button class="toolbar-btn" (click)="graphState.clearCanvas()">Clear</button>
        </div>

        <div class="diagram-legend">
          <div class="legend-title">Dimensions</div>
          @for (item of legendItems; track item.key) {
            <div class="legend-row">
              <span class="legend-dot" [style.background]="item.color"></span>
              <span class="legend-label">{{ item.label }}</span>
            </div>
          }
        </div>
      }

      @if (!graphState.rootPlayer()) {
        <div class="empty-state">
          <p>Search for a player and click their name to begin exploring.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      height: 100%;
      position: relative;
    }

    .diagram-wrapper {
      width: 100%;
      height: 100%;
      position: relative;
      display: flex;
    }

    ng-diagram {
      flex: 1;
    }

    .diagram-toolbar {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      background: rgba(26, 26, 26, 0.9);
      border-radius: 8px;
      border: 1px solid var(--color-panel-border);
      backdrop-filter: blur(8px);
    }

    .toolbar-label {
      font-size: 12px;
      color: var(--color-sidebar-muted);
      white-space: nowrap;
      font-weight: 600;
    }

    .threshold-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toolbar-input {
      width: 56px;
      padding: 3px 8px;
      border: 1px solid #555;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--color-sidebar-text);
      font-size: 12px;
      text-align: center;
      -moz-appearance: textfield;

      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      &:focus {
        outline: 1px solid var(--color-root-node);
        border-color: var(--color-root-node);
      }
    }

    .toolbar-btn {
      padding: 4px 12px;
      border: 1px solid var(--color-panel-border);
      border-radius: 4px;
      background: transparent;
      color: var(--color-sidebar-text);
      font-size: 12px;
      cursor: pointer;
      transition: background 150ms;

      &:hover {
        background: var(--color-panel-border);
      }
    }

    .diagram-legend {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 10px 14px;
      background: rgba(26, 26, 26, 0.9);
      border-radius: 8px;
      border: 1px solid var(--color-panel-border);
      backdrop-filter: blur(8px);
      font-size: 11px;
    }

    .legend-title {
      font-weight: 600;
      color: var(--color-sidebar-text);
      margin-bottom: 6px;
      font-size: 11px;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .legend-label {
      color: var(--color-sidebar-muted);
    }

    .empty-state {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: var(--color-sidebar-muted);
      font-size: 15px;
      pointer-events: none;

      p {
        color: #888;
      }
    }
  `],
})
export class DiagramComponent implements OnInit {
  readonly graphState = inject(GraphStateService);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly diagramService = inject(NgDiagramService);
  private readonly selectionService = inject(NgDiagramSelectionService);
  readonly model = initializeModel();
  readonly thresholdAtt = signal(40);
  readonly thresholdPas = signal(40);
  readonly thresholdDef = signal(40);
  private selectionOrder: string[] = [];

  readonly legendItems = [
    { key: 'att', label: 'Attacking (A)', color: 'var(--color-att)' },
    { key: 'pas', label: 'Passing (P)', color: 'var(--color-pas)' },
    { key: 'def', label: 'Defensive (D)', color: 'var(--color-def)' },
  ];

  readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
    ['player', PlayerNodeComponent],
  ]);

  readonly edgeTemplateMap = new NgDiagramEdgeTemplateMap([
    ['similarity', SimilarityEdgeComponent],
  ]);

  readonly diagramConfig: NgDiagramConfig = {
    nodeDraggingEnabled: false,
    zoom: { min: 0.1, max: 2 },
    edgeRouting: { defaultRouting: 'polyline' },
    linking: { validateConnection: () => false },
    resize: { defaultResizable: false },
    nodeRotation: { defaultRotatable: false },
    zIndex: { edgesAboveConnectedNodes: false, elevateOnSelection: false },
  };

  constructor() {
    // Sync threshold displays when the service thresholds change (e.g. auto-threshold on root selection)
    effect(() => {
      const t = this.graphState.thresholds();
      this.thresholdAtt.set(Math.round(t.att * 100));
      this.thresholdPas.set(Math.round(t.pas * 100));
      this.thresholdDef.set(Math.round(t.def * 100));
    });
  }

  ngOnInit(): void {
    this.graphState.initializeDiagram(
      this.modelService,
      this.viewportService,
      this.diagramService,
    );
  }

  onThresholdChange(category: ExpansionCategory, value: number): void {
    const current = this.graphState.thresholds();
    this.graphState.thresholds.set({ ...current, [category]: value / 100 });
    this.graphState.rebuildDiagram();
  }

  onSelectionChanged(event: SelectionChangedEvent): void {
    if (event.selectedEdges.length > 0) {
      const edgeData = event.selectedEdges[0].data as unknown as import('../../core/models').GraphEdgeData;
      this.graphState.selectedNodeIds.set([]);
      this.graphState.selectedEdge.set(edgeData);
    } else if (event.selectedNodes.length > 0) {
      const currentIds = new Set(event.selectedNodes.map(n => n.id));

      // Remove deselected nodes from order
      this.selectionOrder = this.selectionOrder.filter(id => currentIds.has(id));
      // Append newly selected nodes at the end
      for (const id of currentIds) {
        if (!this.selectionOrder.includes(id)) {
          this.selectionOrder.push(id);
        }
      }

      if (this.selectionOrder.length > MAX_SELECTED_NODES) {
        const dropped = this.selectionOrder.slice(0, -MAX_SELECTED_NODES);
        this.selectionOrder = this.selectionOrder.slice(-MAX_SELECTED_NODES);
        this.selectionService.deselect(dropped);
      }

      this.graphState.selectedNodeIds.set([...this.selectionOrder]);
      this.graphState.selectedEdge.set(null);
    } else {
      this.selectionOrder = [];
      this.graphState.selectedNodeIds.set([]);
      this.graphState.selectedEdge.set(null);
    }
  }
}
