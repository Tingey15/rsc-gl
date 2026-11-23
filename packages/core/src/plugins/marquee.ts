import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import type { Chart } from '../chart/chart';
import type { ChartPlugin, PlotPoint } from '../chart/plugin';
import type { ResolvedAxis as AxisLayout } from '../series/types';
import type { FrameState } from '../marks/instance-mark';
import { RectMark } from '../marks/rect-mark';
import { isOrdinal, type DomainValue } from '../scales/scales';
import { resolveColor, rgbaToCss, withAlpha } from '../theme/colors';
import type { Datum } from '../types';

export interface MarqueeSelection {
  /** Selected x range (numbers for continuous axes, categories for ordinal axes). */
  x: [DomainValue, DomainValue];
  /** Selected y range ('y' and 'xy' modes, or a category range on ordinal y axes). */
  y?: [DomainValue, DomainValue];
  /** Items inside the selection. */
  items: { seriesId: string; dataIndex: number; datum?: Datum; x?: DomainValue; y?: number | null }[];
}

/** Live marquee state: pixel positions (plot coordinates) and the selection they cover. */
export interface MarqueeState {
  start: PlotPoint;
  current: PlotPoint;
  /** True while dragging; false for a selection kept after release. */
  active: boolean;
  selection: MarqueeSelection | null;
}

export interface MarqueeOptions {
  /** Default true when options are given. */
  enabled?: boolean;
  /** What a finished drag does: zoom into it (default), keep it as a selection, or nothing. */
  action?: 'zoom' | 'select' | 'none';
  /** 'x' selects a horizontal range, 'y' a vertical one, 'xy' a rectangle. Default: 'xy' for scatter, 'y' for horizontal bars, else 'x'. */
  mode?: 'x' | 'y' | 'xy';
  /** Require Shift while dragging. Default 'none' (Shift+drag then pans a zoomed chart). */
  modifier?: 'none' | 'shift';
  /** Keep the selection after release ('select' action). Default true. */
  persist?: boolean;
  /** Draw the selection rectangle. Default true. */
  overlay?: boolean;
  /** Value badges at the selection edges. Default true. */
  labels?: boolean;
  /** Hide tooltips while dragging. Default true. */
  preventTooltip?: boolean;
  /** Clear hover highlight while dragging. Default true. */
  preventHighlight?: boolean;
  /** Smallest drag (px) that counts as a selection. Default 6. */
  minSize?: number;
  /** A "Reset zoom" chip while zoomed by the marquee. Default true. */
  resetButton?: boolean;
  /** Called on every change (start, move, release, clear). */
  onMarquee?: (state: MarqueeState | null) => void;
  /** Called when a drag finishes, with the selection (null when cleared). */
  onMarqueeEnd?: (selection: MarqueeSelection | null) => void;
}

export interface MarqueePluginOptions extends MarqueeOptions {
  /** @deprecated use `action: 'zoom'`. */
  zoomOnRelease?: boolean;
}

let styled = false;
function injectMarqueeStyles(doc: Document): void {
  if (styled) return;
  styled = true;
  const st = doc.createElement('style');
  st.textContent = `.rgl-marquee-reset{position:absolute;z-index:4;all:unset;position:absolute;cursor:pointer;font:600 11px var(--rgl-font);padding:3px 9px;border-radius:999px;background:var(--rgl-tooltip-bg);color:var(--rgl-text);border:1px solid var(--rgl-tooltip-border);box-shadow:0 2px 8px rgba(0,0,0,.12)}
.rgl-marquee-reset:hover{background:var(--rgl-hover)}.rgl-marquee-reset:focus-visible{outline:2px solid var(--rgl-focus)}`;
  doc.head.appendChild(st);
}

/**
 * Drag to select a range or rectangle. By default the chart zooms into the
 * selection (continuous and category axes); double-click, Esc or the reset
 * chip return to the full view. With `action: 'select'` the selection stays
 * and reports the items it covers.
 */
export function marqueePlugin(options: MarqueePluginOptions = {}): ChartPlugin {
  let chart: Chart | null = null;
  let start: PlotPoint | null = null;
  let current: PlotPoint | null = null;
  let active = false;
  let mark: RectMark | null = null;
  let device: GpuDevice | null = null;
  let resetEl: HTMLButtonElement | null = null;
  /** Axes this marquee zoomed (so reset only undoes its own zoom). */
  const zoomed = new Set<string>();
  const action = options.action ?? 'zoom';
  const minSize = options.minSize ?? 6;

  const modeOf = (): 'x' | 'y' | 'xy' => {
    if (options.mode) return options.mode;
    const series = chart?.resolvedSeries.filter((s) => !s.hidden) ?? [];
    if (series.length && series.every((s) => s.type === 'scatter')) return 'xy';
    if (series.some((s) => s.type === 'bar' && (s.options as { layout?: string }).layout === 'horizontal')) return 'y';
    return 'x';
  };

  const rect = () => {
    const ctx = chart?.layoutContext;
    if (!ctx || !start || !current) return null;
    const p = ctx.plot;
    const mode = modeOf();
    const cx = Math.max(p.x, Math.min(p.x + p.width, current.x));
    const cy = Math.max(p.y, Math.min(p.y + p.height, current.y));
    const x0 = mode === 'y' ? p.x : Math.min(start.x, cx);
    const x1 = mode === 'y' ? p.x + p.width : Math.max(start.x, cx);
    const y0 = mode === 'x' ? p.y : Math.min(start.y, cy);
    const y1 = mode === 'x' ? p.y + p.height : Math.max(start.y, cy);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  };

  const big = (r: { width: number; height: number }) => {
    const mode = modeOf();
    return (mode === 'y' || r.width >= minSize) && (mode === 'x' || r.height >= minSize);
  };

  /** Category / value range an axis covers between two pixels. */
  const rangeOn = (a: AxisLayout, p0: number, p1: number): [DomainValue, DomainValue] | null => {
    if (isOrdinal(a.scaleType)) {
      const dom = a.scale.domain();
      const half = a.scale.bandwidth() / 2;
      const inside = dom.filter((v) => {
        const c = a.scale.map(v) + half;
        return c >= Math.min(p0, p1) && c <= Math.max(p0, p1);
      });
      return inside.length ? [inside[0], inside[inside.length - 1]] : null;
    }
    const v0 = Number(a.scale.invert(p0));
    const v1 = Number(a.scale.invert(p1));
    return [Math.min(v0, v1), Math.max(v0, v1)];
  };

  const select = (): MarqueeSelection | null => {
    const r = rect();
    const ctx = chart?.layoutContext;
    if (!r || !ctx || !big(r)) return null;
    const xa = ctx.xAxis();
    const ya = ctx.yAxis();
    if (!xa || !ya) return null;
    const mode = modeOf();
    const items: MarqueeSelection['items'] = [];
    for (const s of chart!.resolvedSeries) {
      if (s.hidden) continue;
      const sx = ctx.xAxis(s.xAxisId);
      const sy = ctx.yAxis(s.yAxisId);
      if (!sx || !sy) continue;
      const horizontal = (s.options as { layout?: string }).layout === 'horizontal';
      for (const p of s.points) {
        if (p.y === null) continue;
        const cat = horizontal ? sy : sx;
        const val = horizontal ? sx : sy;
        const c = cat.scale.map(p.x) + cat.scale.bandwidth() / 2;
        const v = val.scale.map(p.y1 ?? p.y);
        const px = horizontal ? v : c;
        const py = horizontal ? c : v;
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) items.push({ seriesId: s.id, dataIndex: p.index, datum: p.datum, x: p.x, y: p.y });
      }
    }
    const xr = mode === 'y' ? (rangeOn(xa, ctx.plot.x, ctx.plot.x + ctx.plot.width) ?? [xa.scale.domain()[0], xa.scale.domain()[0]]) : rangeOn(xa, r.x, r.x + r.width);
    const yr = mode === 'x' ? undefined : (rangeOn(ya, r.y + r.height, r.y) ?? undefined);
    if (!xr) return null;
    return { x: xr, y: yr, items };
  };

  const state = (): MarqueeState | null => (start && current ? { start, current, active, selection: select() } : null);
  const notify = () => {
    const s = state();
    options.onMarquee?.(s);
    chart?.emit('marquee', s);
  };

  const clear = () => {
    const had = !!start;
    start = null;
    current = null;
    active = false;
    if (had) {
      notify();
      chart?.invalidate();
    }
    return had;
  };

  /** Zooms the selected axes into the selection. */
  const zoomInto = (sel: MarqueeSelection) => {
    const c = chart!;
    const ctx = c.layoutContext!;
    const mode = modeOf();
    const apply = (a: AxisLayout | undefined, range: [DomainValue, DomainValue] | undefined) => {
      if (!a || !range) return;
      // Mark first: setZoom re-runs layout, which shows the reset chip for marked axes.
      zoomed.add(a.id);
      if (isOrdinal(a.scaleType)) {
        // Category axes zoom by index range into the full category list.
        const dom = a.scale.domain().map(String);
        const offset = Math.round(c.getZoom(a.id)?.[0] ?? 0);
        const i0 = dom.indexOf(String(range[0]));
        const i1 = dom.indexOf(String(range[1]));
        if (i0 < 0 || i1 < 0 || (i0 === 0 && i1 === dom.length - 1)) {
          if (!c.getZoom(a.id)) zoomed.delete(a.id);
          return;
        }
        c.setZoom(a.id, [offset + Math.min(i0, i1), offset + Math.max(i0, i1)], true);
      } else c.setZoom(a.id, [Number(range[0]), Number(range[1])], true);
    };
    if (mode !== 'y') apply(ctx.xAxis(), sel.x);
    if (mode !== 'x') apply(ctx.yAxis(), sel.y);
  };

  const resetZoom = () => {
    if (!zoomed.size || !chart) return false;
    for (const id of zoomed) chart.setZoom(id, null, true);
    zoomed.clear();
    return true;
  };

  const syncReset = () => {
    if (!chart || options.resetButton === false || action !== 'zoom') return;
    const show = [...zoomed].some((id) => chart!.getZoom(id));
    if (!show) {
      resetEl?.remove();
      resetEl = null;
      // Zoom cleared elsewhere (e.g. double-click handled by another plugin).
      if (![...zoomed].some((id) => chart!.getZoom(id))) zoomed.clear();
      return;
    }
    if (!resetEl) {
      injectMarqueeStyles(chart.root.ownerDocument);
      resetEl = document.createElement('button');
      resetEl.type = 'button';
      resetEl.className = 'rgl-marquee-reset';
      resetEl.textContent = 'Reset zoom';
      for (const t of ['pointerdown', 'pointermove', 'dblclick'] as const) resetEl.addEventListener(t, (e) => e.stopPropagation());
      resetEl.addEventListener('click', (e) => {
        e.stopPropagation();
        resetZoom();
      });
      chart.plotEl.appendChild(resetEl);
    }
    const p = chart.layoutContext?.plot;
    if (p) {
      resetEl.style.left = `${p.x + 8}px`;
      resetEl.style.top = `${p.y + 8}px`;
    }
  };

  return {
    name: 'marquee',
    dragModifier: options.modifier ?? 'none',
    attach(c) {
      chart = c;
    },
    layout(c) {
      const d = c.gpuDevice;
      if (d && d !== device) {
        device = d;
        mark?.destroy();
        mark = new RectMark(d);
      }
      syncReset();
    },
    onPointerDown(e, p) {
      if (options.enabled === false) return false;
      const needShift = options.modifier === 'shift';
      if (e.button !== 0 || (needShift ? !e.shiftKey : e.shiftKey && (chart?.plugins.some((x) => x.name === 'zoom') ?? false))) return false;
      const ctx = chart?.layoutContext;
      if (!ctx) return false;
      const pl = ctx.plot;
      if (p.x < pl.x || p.x > pl.x + pl.width || p.y < pl.y || p.y > pl.y + pl.height) return false;
      start = p;
      current = p;
      active = true;
      if (options.preventHighlight !== false) chart!.highlight(null);
      chart!.invalidate();
      return true;
    },
    onPointerMove(_e, p) {
      if (!active) return false;
      current = p;
      notify();
      chart!.invalidate();
      return options.preventTooltip !== false;
    },
    onPointerUp() {
      if (!active) return false;
      active = false;
      const r = rect();
      if (!r || !big(r)) {
        // A click: clears a kept selection.
        clear();
        options.onMarqueeEnd?.(null);
        return true;
      }
      const sel = select();
      options.onMarqueeEnd?.(sel);
      if (sel && action === 'zoom') zoomInto(sel);
      if (action !== 'select' || options.persist === false || !sel) {
        start = null;
        current = null;
      }
      notify();
      chart!.invalidate();
      return true;
    },
    onDoubleClick() {
      const a = clear();
      const b = resetZoom();
      return a || b;
    },
    onKeyDown(e) {
      if (e.key !== 'Escape') return false;
      if (clear()) {
        options.onMarqueeEnd?.(null);
        return true;
      }
      return resetZoom();
    },
    drawFront(pass: RenderPass, frame: FrameState) {
      if (!mark) return;
      const r = options.overlay === false ? null : rect();
      const accent = resolveColor(chart!.chartTheme.focusRing);
      mark.style = { strokeColor: withAlpha(accent, 0.9), strokeWidth: 1.5, hoverGrow: 0 };
      mark.update(r && r.width > 0 && r.height > 0 ? [{ key: 'marquee', seriesIndex: -1, dataIndex: -1, value: { ...r, color: withAlpha(accent, 0.14), radius: 3, corners: 15 } }] : [], { duration: 0, easing: 'linear', stagger: 0 }, frame.now);
      mark.draw(pass, frame);
    },
    drawOverlay(g) {
      if (options.labels === false || options.overlay === false) return;
      const r = rect();
      const ctx = chart?.layoutContext;
      if (!r || !ctx || !big(r)) return;
      const theme = chart!.chartTheme;
      const accent = resolveColor(theme.focusRing);
      const mode = modeOf();
      const badge = (text: string, x: number, y: number, align: CanvasTextAlign) => {
        g.font = `600 ${theme.fontSize - 1}px ${theme.fontFamily}`;
        const w = g.measureText(text).width + 10;
        const h = theme.fontSize + 6;
        const bx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
        g.fillStyle = rgbaToCss(accent);
        g.beginPath();
        g.roundRect(bx, y - h / 2, w, h, 4);
        g.fill();
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, bx + w / 2, y + 0.5);
      };
      g.save();
      const xa = ctx.xAxis();
      const ya = ctx.yAxis();
      if (mode !== 'y' && xa) {
        const range = rangeOn(xa, r.x, r.x + r.width);
        if (range) {
          const y = ctx.plot.y + ctx.plot.height - 12;
          badge(xa.format(range[0], 'tooltip'), r.x + 2, y, 'left');
          if (range[1] !== range[0]) badge(xa.format(range[1], 'tooltip'), r.x + r.width - 2, mode === 'xy' ? y : y - 20, 'right');
        }
      }
      if (mode !== 'x' && ya) {
        const range = rangeOn(ya, r.y + r.height, r.y);
        if (range) {
          badge(ya.format(range[1], 'tooltip'), ctx.plot.x + 4, r.y + 10, 'left');
          if (range[1] !== range[0]) badge(ya.format(range[0], 'tooltip'), ctx.plot.x + 4, r.y + r.height - 10, 'left');
        }
      }
      g.restore();
    },
    setDevice(d) {
      device = d;
      mark?.destroy();
      mark = new RectMark(d);
    },
    destroy() {
      mark?.destroy();
      resetEl?.remove();
    },
  };
}
