import type { Chart } from '../chart/chart';
import type { ChartPlugin } from '../chart/plugin';
import { isOrdinal } from '../scales/scales';

export interface CrosshairOptions {
  /** Vertical line. Default true. */
  x?: boolean;
  /** Horizontal line. Default true. */
  y?: boolean;
  /** Value badges on the axes. Default true. */
  badges?: boolean;
  /** Snap the vertical line to the nearest category / data point. Default true. */
  snap?: boolean;
}

/** Dashed crosshair following the pointer, with value badges on the axes. */
export function crosshairPlugin(options: CrosshairOptions = {}): ChartPlugin {
  let chart: Chart | null = null;
  let pointer: { x: number; y: number } | null = null;

  return {
    name: 'crosshair',
    attach(c) {
      chart = c;
      c.plotEl.addEventListener('pointerleave', () => {
        pointer = null;
        c.invalidate();
      });
    },
    onPointerMove(_e, p) {
      pointer = p;
      chart!.invalidate();
      return false;
    },
    drawOverlay(g, ctx) {
      if (!pointer || !chart) return;
      const pl = ctx.plot;
      if (pointer.x < pl.x || pointer.x > pl.x + pl.width || pointer.y < pl.y || pointer.y > pl.y + pl.height) return;
      const theme = chart.chartTheme;
      const xa = ctx.xAxis();
      const ya = ctx.yAxis();
      let x = pointer.x;
      let xLabel = '';
      if (xa) {
        if (isOrdinal(xa.scaleType)) {
          const v = xa.scale.invert(pointer.x)!;
          if (options.snap !== false) x = xa.scale.map(v) + xa.scale.bandwidth() / 2;
          xLabel = xa.format(v, 'tooltip');
        } else {
          const hit = options.snap !== false ? chart.hitTestAt(pointer.x, pointer.y) : null;
          if (hit && hit.distance < 60) x = hit.anchor.x;
          xLabel = xa.format(xa.scale.invert(x) as number, 'tooltip');
        }
      }
      const yLabel = ya ? ya.format(ya.scale.invert(pointer.y) as number, 'tooltip') : '';
      g.save();
      g.strokeStyle = theme.mutedTextColor;
      g.globalAlpha = 0.8;
      g.setLineDash([4, 4]);
      g.lineWidth = 1;
      if (options.x !== false) {
        g.beginPath();
        g.moveTo(Math.round(x) + 0.5, pl.y);
        g.lineTo(Math.round(x) + 0.5, pl.y + pl.height);
        g.stroke();
      }
      if (options.y !== false) {
        g.beginPath();
        g.moveTo(pl.x, Math.round(pointer.y) + 0.5);
        g.lineTo(pl.x + pl.width, Math.round(pointer.y) + 0.5);
        g.stroke();
      }
      g.setLineDash([]);
      g.globalAlpha = 1;
      if (options.badges !== false) {
        g.font = `600 11px ${theme.fontFamily}`;
        const badge = (text: string, bx: number, by: number, align: 'center' | 'right') => {
          const w = g.measureText(text).width + 12;
          const h = 18;
          const left = align === 'center' ? bx - w / 2 : bx - w;
          g.fillStyle = theme.focusRing;
          g.beginPath();
          g.roundRect(left, by - h / 2, w, h, 5);
          g.fill();
          g.fillStyle = '#fff';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(text, left + w / 2, by);
        };
        if (options.x !== false && xLabel) badge(xLabel, x, pl.y + pl.height + 11, 'center');
        if (options.y !== false && yLabel) badge(yLabel, pl.x - 2, pointer.y, 'right');
      }
      g.restore();
    },
  };
}
