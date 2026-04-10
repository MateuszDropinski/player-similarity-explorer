import { Component, computed, input } from '@angular/core';
import { type ProcessedPlayer, type ExpansionCategory } from '../../../core/models';
import { METRIC_SHORT_LABELS, CATEGORY_METRICS } from '../../../core/constants';

interface PlayerEntry {
  player: ProcessedPlayer;
  color: string;
}

@Component({
  selector: 'app-radar-chart',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.viewBox]="viewBox()"
    >
      <!-- Reference rings -->
      @for (ring of rings; track ring) {
        <polygon
          [attr.points]="getRingPoints(ring)"
          fill="none"
          stroke="#333"
          stroke-width="0.5"
          stroke-dasharray="2 2"
        />
      }

      <!-- Axes -->
      @for (axis of axes(); track axis.index) {
        <line
          [attr.x1]="center()"
          [attr.y1]="center()"
          [attr.x2]="axis.x"
          [attr.y2]="axis.y"
          stroke="#333"
          stroke-width="0.5"
        />
        <text
          [attr.x]="axis.labelX"
          [attr.y]="axis.labelY"
          fill="#888"
          font-size="8"
          text-anchor="middle"
          dominant-baseline="middle"
        >{{ axis.label }}</text>
      }

      <!-- Player polygons -->
      @for (entry of playerPolygons(); track entry.color) {
        <polygon
          [attr.points]="entry.points"
          [attr.fill]="entry.color"
          fill-opacity="0.15"
          [attr.stroke]="entry.color"
          stroke-width="1.5"
        />
      }

      <!-- Data points and value labels -->
      @for (entry of playerPolygons(); track entry.color) {
        @for (pt of entry.dataPoints; track pt.index) {
          <circle
            [attr.cx]="pt.x"
            [attr.cy]="pt.y"
            r="2.5"
            [attr.fill]="entry.color"
          />
          @if (showValues()) {
            <text
              [attr.x]="pt.labelX"
              [attr.y]="pt.labelY"
              [attr.fill]="entry.color"
              font-size="7"
              font-weight="600"
              text-anchor="middle"
              dominant-baseline="middle"
            >{{ pt.value }}</text>
          }
        }
      }
    </svg>
  `,
  styles: [`
    :host {
      display: block;
    }
    svg {
      display: block;
    }
  `],
})
export class RadarChartComponent {
  players = input.required<PlayerEntry[]>();
  category = input.required<ExpansionCategory>();
  size = input(300);
  showValues = input(false);

  readonly rings = [25, 50, 75, 100];

  readonly center = computed(() => this.size() / 2);
  readonly radius = computed(() => this.size() / 2 - 45);

  readonly viewBox = computed(() => `0 0 ${this.size()} ${this.size()}`);

  readonly metrics = computed(() => CATEGORY_METRICS[this.category()]);

  readonly axes = computed(() => {
    const metrics = this.metrics();
    const c = this.center();
    const r = this.radius();
    return metrics.map((metric, i) => {
      const angle = (2 * Math.PI * i) / metrics.length - Math.PI / 2;
      const x = c + r * Math.cos(angle);
      const y = c + r * Math.sin(angle);
      const labelR = r + 16;
      const labelX = c + labelR * Math.cos(angle);
      const labelY = c + labelR * Math.sin(angle);
      return {
        index: i,
        label: METRIC_SHORT_LABELS[metric] ?? metric,
        x, y,
        labelX, labelY,
      };
    });
  });

  getRingPoints(pct: number): string {
    const metrics = this.metrics();
    const c = this.center();
    const r = this.radius() * (pct / 100);
    return metrics
      .map((_, i) => {
        const angle = (2 * Math.PI * i) / metrics.length - Math.PI / 2;
        return `${c + r * Math.cos(angle)},${c + r * Math.sin(angle)}`;
      })
      .join(' ');
  }

  readonly playerPolygons = computed(() => {
    const cat = this.category();
    const metrics = this.metrics();
    const c = this.center();
    const r = this.radius();

    return this.players().map(entry => {
      const percentiles = entry.player.percentiles[cat];
      const dataPoints = metrics.map((_, i) => {
        const pct = percentiles[i] ?? 0;
        const angle = (2 * Math.PI * i) / metrics.length - Math.PI / 2;
        const dist = r * (pct / 100);
        const x = c + dist * Math.cos(angle);
        const y = c + dist * Math.sin(angle);
        // Place label slightly outward from the data point
        const labelOffset = 10;
        const labelX = x + labelOffset * Math.cos(angle);
        const labelY = y + labelOffset * Math.sin(angle);
        return {
          index: i,
          x, y,
          labelX, labelY,
          value: pct,
        };
      });

      return {
        color: entry.color,
        points: dataPoints.map(p => `${p.x},${p.y}`).join(' '),
        dataPoints,
      };
    });
  });
}
