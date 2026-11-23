import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import type { Chart } from '../chart/chart';
import type { ChartPlugin } from '../chart/plugin';
import type { FrameState, MarkItem } from '../marks/instance-mark';
import { LineMark } from '../marks/path-mark';
import { RectMark, type RectAttrs } from '../marks/rect-mark';
import type { LayoutContext } from '../series/types';
import { resolveColor, rgbaToCss, withAlpha } from '../theme/colors';
import { resolveLineType } from '../theme/theme';
import type { ReferenceAreaOptions, ReferenceLineOptions } from '../types';

/**
 * Reference lines (`referenceLines`) and shaded reference areas
 * (`referenceAreas`), drawn behind or in front of the series.
 */
export function referenceLinesPlugin(): ChartPlugin {
  let chart: Chart | null = null;
  let lines: LineMark[] = [];
  let areasBack: RectMark | null = null;
  let areasFront: RectMark | null = null;
  let device: GpuDevice | null = null;
  const refs = (): ReferenceLineOptions[] => chart?.getOptions().referenceLines ?? [];
  const areas = (): ReferenceAreaOptions[] => chart?.getOptions().referenceAreas ?? [];

  const ensure = (d: GpuDevice) => {
    if (device === d && areasBack) return;
    device = d;
    areasBack = new RectMark(d);
    areasFront = new RectMark(d);
    lines.forEach((l) => l.setDevice(d));
  };

  const areaRect = (a: ReferenceAreaOptions, ctx: LayoutContext) => {
    const p = ctx.plot;
    const xa = ctx.xAxis(a.xAxisId);
    const ya = ctx.yAxis(a.yAxisId);
    const xs = [a.x1, a.x2].map((v, i) => (v === undefined || !xa ? (i === 0 ? p.x : p.x + p.width) : xa.scale.map(v) + (i === 1 ? xa.scale.bandwidth() : 0)));
    const ys = [a.y1, a.y2].map((v, i) => (v === undefined || !ya ? (i === 0 ? p.y + p.height : p.y) : ya.scale.map(v) + (i === 1 ? 0 : ya.scale.bandwidth())));
    const x0 = Math.max(p.x, Math.min(xs[0], xs[1]));
    const x1 = Math.min(p.x + p.width, Math.max(xs[0], xs[1]));
    const y0 = Math.max(p.y, Math.min(ys[0], ys[1]));
    const y1 = Math.min(p.y + p.height, Math.max(ys[0], ys[1]));
    return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  };

  return {
    name: 'referenceLines',
    attach(c) {
      chart = c;
    },
    layout(c, ctx) {
      const d = c.gpuDevice;
      if (!d) return;
      ensure(d);
      const list = refs();
      while (lines.length > list.length) lines.pop()!.destroy();
      while (lines.length < list.length) lines.push(new LineMark(d));
      const p = ctx.plot;
      list.forEach((r, i) => {
        let pts: { key: string; x: number; y: number }[] = [];
        if (r.y !== undefined) {
          const a = ctx.yAxis(r.axisId);
          if (a) {
            const y = a.scale.map(r.y) + a.scale.bandwidth() / 2;
            pts = [
              { key: 'a', x: p.x, y },
              { key: 'b', x: p.x + p.width, y },
            ];
          }
        } else if (r.x !== undefined) {
          const a = ctx.xAxis(r.axisId);
          if (a) {
            const x = a.scale.map(r.x) + a.scale.bandwidth() / 2;
            pts = [
              { key: 'a', x, y: p.y },
              { key: 'b', x, y: p.y + p.height },
            ];
          }
        }
        lines[i].style = { color: resolveColor(r.color ?? 'gray-800', ctx.scheme), width: r.lineWidth ?? 1.5, dash: resolveLineType(r.lineType ?? 'solid'), alternateDash: [], opacity: 1 };
        // Lines enter by sweeping in from their first point.
        lines[i].update(pts, ctx.transition, ctx.now, (pt) => ({ x: pts[0]?.x ?? pt.x, y: pts[0]?.y ?? pt.y, y0: 0 }));
      });
      const mk = (layer: 'back' | 'front'): MarkItem<RectAttrs>[] =>
        areas()
          .map((a, i) => ({ a, i }))
          .filter(({ a }) => (a.layer ?? 'back') === layer)
          .map(({ a, i }) => {
            const c0 = resolveColor(a.color ?? 'blue-500', ctx.scheme);
            const value: RectAttrs = { ...areaRect(a, ctx), color: withAlpha(c0, a.opacity ?? 0.14), radius: 0, corners: 0 };
            return { key: `area${i}`, seriesIndex: -1, dataIndex: -1, value, enter: { ...value, color: withAlpha(c0, 0) } };
          });
      areasBack!.update(mk('back'), ctx.transition, ctx.now);
      areasFront!.update(mk('front'), ctx.transition, ctx.now);
    },
    drawBack(pass: RenderPass, frame: FrameState) {
      areasBack?.draw(pass, frame);
      refs().forEach((r, i) => r.layer === 'back' && lines[i]?.draw(pass, frame));
    },
    drawFront(pass: RenderPass, frame: FrameState) {
      areasFront?.draw(pass, frame);
      refs().forEach((r, i) => r.layer !== 'back' && lines[i]?.draw(pass, frame));
    },
    drawOverlay(g, ctx) {
      const theme = chart!.chartTheme;
      const p = ctx.plot;
      g.save();
      g.font = `600 ${theme.fontSize - 1}px ${theme.fontFamily}`;
      for (const r of refs()) {
        if (!r.label) continue;
        g.fillStyle = r.color ? rgbaToCss(resolveColor(r.color, ctx.scheme)) : theme.textColor;
        if (r.y !== undefined) {
          const a = ctx.yAxis(r.axisId);
          if (!a) continue;
          const y = a.scale.map(r.y) + a.scale.bandwidth() / 2;
          g.textBaseline = 'bottom';
          g.textAlign = r.labelAlign === 'start' ? 'left' : r.labelAlign === 'middle' ? 'center' : 'right';
          g.fillText(r.label, r.labelAlign === 'start' ? p.x + 4 : r.labelAlign === 'middle' ? p.x + p.width / 2 : p.x + p.width - 4, y - 3);
        } else if (r.x !== undefined) {
          const a = ctx.xAxis(r.axisId);
          if (!a) continue;
          g.textBaseline = 'top';
          g.textAlign = 'left';
          g.fillText(r.label, a.scale.map(r.x) + a.scale.bandwidth() / 2 + 4, p.y + 2);
        }
      }
      for (const a of areas()) {
        if (!a.label) continue;
        const rc = areaRect(a, ctx);
        g.fillStyle = a.color ? rgbaToCss(resolveColor(a.color, ctx.scheme)) : theme.mutedTextColor;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(a.label, rc.x + 4, rc.y + 3);
      }
      g.restore();
    },
    isAnimating(now) {
      return lines.some((l) => l.isAnimating(now)) || !!areasBack?.isAnimating(now) || !!areasFront?.isAnimating(now);
    },
    toSvg(now, layer) {
      const area = (layer === 'back' ? areasBack : areasFront)?.toSvg(now) ?? '';
      return area + refs().map((r, i) => ((r.layer === 'back') === (layer === 'back') ? (lines[i]?.toSvg(now) ?? '') : '')).join('');
    },
    setDevice(d) {
      device = null;
      ensure(d);
    },
    destroy() {
      lines.forEach((l) => l.destroy());
      lines = [];
      areasBack?.destroy();
      areasFront?.destroy();
    },
  };
}
