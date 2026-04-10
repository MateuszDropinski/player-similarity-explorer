import { Component, computed, inject, input } from '@angular/core';
import {
  type SimpleNode,
  type NgDiagramNodeTemplate,
  NgDiagramNodeSelectedDirective,
  NgDiagramPortComponent,
} from 'ng-diagram';
import { type GraphNodeData, type ExpansionCategory } from '../../../core/models';
import { GraphStateService } from '../../../core/services/graph-state.service';

const CATEGORY_CONFIG: { key: ExpansionCategory; label: string; color: string }[] = [
  { key: 'att', label: 'A', color: 'var(--color-att)' },
  { key: 'pas', label: 'P', color: 'var(--color-pas)' },
  { key: 'def', label: 'D', color: 'var(--color-def)' },
];

@Component({
  selector: 'app-player-node',
  imports: [NgDiagramNodeSelectedDirective, NgDiagramPortComponent],
  template: `
    <div
      class="player-node"
      ngDiagramNodeSelected
      [node]="node()"
      [class.root]="nodeData().isRoot"
      [style.width.px]="nodeSize()"
      [style.height.px]="nodeSize()"
    >
      <span class="node-name">{{ nodeData().player.name }}</span>
      <span class="node-team">{{ nodeData().player.team }}</span>
      <span class="node-position">{{ nodeData().player.primaryGroup }}</span>
    </div>

    <ng-diagram-port id="center" type="both" side="top" class="center-port" style="top: 50%" />

    <div class="adornments">
      @for (cat of categories; track cat.key) {
        <button
          class="adornment"
          [class.expanded]="nodeData().expandedCategories.has(cat.key)"
          [style.--cat-color]="cat.color"
          [style.left.px]="getAdornmentX(cat.key)"
          [style.top.px]="getAdornmentY(cat.key)"
          (click)="onAdornmentClick($event, cat.key)"
          data-no-drag="true"
          data-no-pan="true"
        >{{ adornmentLabel(cat.key) }}</button>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      position: relative;
    }

    .player-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--color-similar-node);
      border: 2px solid transparent;
      transition: border-color 150ms;
      overflow: hidden;
      padding: 6px;
      cursor: pointer;

      &.root {
        border-color: var(--color-root-node);
      }
    }

    .ng-diagram-node-selected .player-node,
    :host-context(.ng-diagram-node-selected) .player-node {
      border-color: #6ba3d6;
    }

    .node-name {
      font-size: 9px;
      font-weight: 600;
      color: #fff;
      text-align: center;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-word;
    }

    .node-team {
      font-size: 7px;
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .node-position {
      font-size: 8px;
      color: rgba(255, 255, 255, 0.6);
      margin-top: 1px;
    }

    .center-port {
      --ngd-port-size: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .adornments {
      opacity: 1;
    }

    .adornment {
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--cat-color);
      border: none;
      color: #fff;
      font-size: 8px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 150ms;
      transform: translate(-50%, -50%);

      &:hover {
        transform: translate(-50%, -50%) scale(1.2);
      }

      &.expanded {
        box-shadow: 0 0 0 2px #fff;
      }
    }
  `],
})
export class PlayerNodeComponent implements NgDiagramNodeTemplate<Record<string, unknown>> {
  node = input.required<SimpleNode<Record<string, unknown>>>();

  private readonly graphState = inject(GraphStateService);

  readonly categories = CATEGORY_CONFIG;

  readonly nodeData = computed(() => this.node().data as unknown as GraphNodeData);

  readonly nodeSize = computed(() => 75);

  adornmentLabel(category: ExpansionCategory): string {
    const expanded = this.nodeData().expandedCategories.has(category);
    const cat = CATEGORY_CONFIG.find(c => c.key === category)!;
    return expanded ? '-' : cat.label;
  }

  getAdornmentX(category: ExpansionCategory): number {
    const angles: Record<ExpansionCategory, number> = { att: -90, pas: 150, def: 30 };
    const half = this.nodeSize() / 2;
    const radius = half + 8;
    return half + radius * Math.cos((angles[category] * Math.PI) / 180);
  }

  getAdornmentY(category: ExpansionCategory): number {
    const angles: Record<ExpansionCategory, number> = { att: -90, pas: 150, def: 30 };
    const half = this.nodeSize() / 2;
    const radius = half + 8;
    return half + radius * Math.sin((angles[category] * Math.PI) / 180);
  }

  onAdornmentClick(event: MouseEvent, category: ExpansionCategory): void {
    event.stopPropagation();
    this.graphState.expandCategory(this.nodeData().player.id, category);
  }
}
