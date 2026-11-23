import { createDevice, type GpuBackend, type GpuDevice, type GpuSurface } from '@rsc-gl/gpu';
import { resolveTransition } from '../animation/easing';
import { buildScene, type Scene } from '../chart/scene';
import { drawAxes } from '../components/axes';
import { getFormatter, type Formatter } from '../format/format';
import type { FrameState, MarkItem } from '../marks/instance-mark';
import { RectMark, type RectAttrs } from '../marks/rect-mark';
import { isOrdinal } from '../scales/scales';
import { formatSeriesValue } from '../series/format-value';
import type { LayoutContext, SeriesDefinition, SeriesRenderer } from '../series/types';
import { resolveColor, withAlpha } from '../theme/colors';
import { getTheme, type ChartTheme } from '../theme/theme';
import type { ChartOptions } from '../types';
import type { FromWorker, ToWorker } from './protocol';

export interface ChartWorkerConfig {
  /** Series types this worker can render (only these are bundled into the worker). */
  series: SeriesDefinition<any>[];
  /** GPU backends in preference order. */
  backends: GpuBackend[];
  /**
   * Runs inside the worker once the chart exists. Data produced here (sockets,
   * simulations, parsing) never touches the main thread.
   */
  setup?: (chart: WorkerChartApi) => void;
}

/** What `setup` can do with the worker's chart. */
export interface WorkerChartApi {
  getOptions(): ChartOptions;
  setOptions(options: ChartOptions, animate?: boolean): void;
  /** Appends values to a series (keeps the last `maxPoints`). */
  appendData(seriesIndex: number, values: unknown[], maxPoints?: number): void;
}

type Ctx2D = OffscreenCanvasRenderingContext2D;

const raf: (cb: (t: number) => void) => void =
  typeof requestAnimationFrame !== 'undefined' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(() => cb(performance.now()), 16);

class WorkerRuntime implements WorkerChartApi {
  private device: GpuDevice | null = null;
  private surface: GpuSurface | null = null;
  private readonly gpuCanvas = new OffscreenCanvas(1, 1);
  private readonly out: Ctx2D;
  private readonly defs: Map<string, SeriesDefinition>;
  private readonly renderers = new Map<string, SeriesRenderer>();
  private grid: RectMark | null = null;
  private theme: ChartTheme = getTheme('light');
  private formatter: Formatter = getFormatter();
  private scene: Scene | null = null;
  private ctx: LayoutContext | null = null;
  private titleH = 0;
  private legendH = 0;
  private first = true;
  private scheduled = false;
  private highlight: [number, number, number, number] = [-1, -1, 1, 0];
  private frames = 0;
  private fpsWindow = 0;
  private lastFrameMs = 0;

  constructor(
    private readonly canvas: OffscreenCanvas,
    private width: number,
    private height: number,
    private dpr: number,
    private options: ChartOptions,
    config: ChartWorkerConfig,
    private readonly post: (m: FromWorker) => void,
  ) {
    this.defs = new Map(config.series.map((d) => [d.type, d]));
    this.out = canvas.getContext('2d') as Ctx2D;
  }

  async start(backends: GpuBackend[], prefer?: 'webgpu' | 'webgl2'): Promise<void> {
    this.device = await createDevice({ backends, prefer });
    this.surface = this.device.createSurface(this.gpuCanvas);
    this.grid = new RectMark(this.device);
    this.post({ type: 'ready', backend: this.device.type });
    this.relayout(true);
  }

  getOptions(): ChartOptions {
    return this.options;
  }

  setOptions(options: ChartOptions, animate = true): void {
    this.options = options;
    this.relayout(animate);
  }

  appendData(seriesIndex: number, values: unknown[], maxPoints = Infinity): void {
    const s = this.options.series[seriesIndex] as { data?: unknown[] } | undefined;
    if (!s) return;
    const merged = [...(s.data ?? []), ...values];
    s.data = merged.slice(Math.max(0, merged.length - maxPoints));
    this.relayout(false);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.relayout(false);
  }

  private measure = (t: string) => {
    this.out.font = `${this.theme.fontSize}px ${this.theme.fontFamily}`;
    return this.out.measureText(t).width;
  };

  private relayout(animate: boolean): void {
    if (!this.device || this.width <= 0 || this.height <= 0) return;
    const o = this.options;
    const now = performance.now();
    this.theme = getTheme(o.colorScheme ?? 'light', o.theme);
    this.formatter = getFormatter(o.locale);
    const title = typeof o.title === 'string' ? o.title : o.title?.text;
    this.titleH = title ? 28 : 0;
    const hidden = new Set(o.hiddenSeries ?? []);
    const legendWanted = o.legend !== false && o.legend !== undefined;
    this.legendH = legendWanted ? 26 : 0;
    const plotH = Math.max(10, this.height - this.titleH - this.legendH);
    const scene = buildScene({ options: o, defs: this.defs, width: this.width, height: plotH, theme: this.theme, formatter: this.formatter, measure: this.measure, hidden });
    if (!scene.legend.length) this.legendH = 0;
    this.scene = scene;
    const a = o.animation;
    const base = resolveTransition(typeof a === 'object' ? a : undefined);
    const transition = a === false || !(animate || this.first) ? { ...base, duration: 0 } : base;
    const cart = scene.cartesian;
    const ctx: LayoutContext = {
      now,
      transition,
      firstRender: this.first,
      enterAnimation: this.first && transition.duration > 0,
      theme: this.theme,
      scheme: this.theme.scheme,
      formatter: this.formatter,
      plot: scene.plot,
      width: this.width,
      height: plotH,
      dpr: this.dpr,
      xAxis: (id) => cart?.xAxes.find((x) => x.id === (id ?? 'x')) ?? cart?.xAxes[0],
      yAxis: (id) => cart?.yAxes.find((x) => x.id === (id ?? 'y')) ?? cart?.yAxes[0],
    };
    this.ctx = ctx;
    for (const [type, list] of scene.byType) {
      let r = this.renderers.get(type);
      if (!r) {
        r = this.defs.get(type)!.createRenderer(this.device);
        this.renderers.set(type, r);
      }
      r.layout(list, ctx);
    }
    for (const [type, r] of this.renderers)
      if (!scene.byType.has(type)) {
        r.destroy();
        this.renderers.delete(type);
      }
    this.layoutGrid(ctx);
    this.first = false;
    this.schedule();
  }

  private layoutGrid(ctx: LayoutContext): void {
    const cart = this.scene?.cartesian;
    const items: MarkItem<RectAttrs>[] = [];
    const ya = cart?.yAxes[0];
    if (cart && ya && this.options.grid?.horizontal !== false) {
      const color = resolveColor(this.theme.gridColor);
      const strong = withAlpha(resolveColor(this.theme.axisColor), 0.9);
      const p = cart.plot;
      for (const t of ya.ticks) {
        if (t.pos < p.y - 0.5 || t.pos > p.y + p.height + 0.5) continue;
        const zero = !isOrdinal(ya.scaleType) && Number(t.value) === 0;
        const value: RectAttrs = { x: p.x, y: t.pos - 0.5, width: p.width, height: 1, color: zero ? strong : color, radius: 0, corners: 0 };
        items.push({ key: `gy|${String(t.value)}`, seriesIndex: -1, dataIndex: -1, value, enter: { ...value, color: [color[0], color[1], color[2], 0] } });
      }
    }
    this.grid?.update(items, { ...ctx.transition, stagger: 0 }, ctx.now);
  }

  pointer(x: number, y: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const py = y - this.titleH;
    let best: ReturnType<SeriesRenderer['hitTest']> = null;
    const now = performance.now();
    for (const r of this.renderers.values()) {
      const hit = r.hitTest(x, py, ctx, now);
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    if (best && best.distance < 30) {
      const s = best.series;
      const pt = s.points.find((p) => p.index === best!.dataIndex);
      const def = this.defs.get(s.type);
      const value = def?.formatValue && pt ? def.formatValue(s, pt, this.formatter) : formatSeriesValue(s, pt?.y ?? null, this.formatter, 'tooltip', best.dataIndex);
      const xa = ctx.xAxis(s.xAxisId);
      const header = def?.coordinates === 'cartesian' && s.type !== 'scatter' && pt && xa ? xa.format(pt.x, 'tooltip') : undefined;
      this.highlight = [s.index, best.dataIndex, this.theme.fadeOpacity, 1];
      this.post({ type: 'tooltip', tip: { x: best.anchor.x, y: best.anchor.y + this.titleH, header, label: s.label, value, color: s.colorCss } });
    } else this.leave(false);
    this.schedule();
  }

  leave(schedule = true): void {
    this.highlight = [-1, -1, 1, 0];
    this.post({ type: 'tooltip', tip: null });
    if (schedule) this.schedule();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    raf((t) => {
      this.scheduled = false;
      if (this.frame(t)) this.schedule();
    });
  }

  /** Renders one frame; returns true while animating. */
  private frame(now: number): boolean {
    const surface = this.surface;
    const ctx = this.ctx;
    const scene = this.scene;
    if (!surface || !ctx || !scene) return false;
    const t0 = performance.now();
    const dpr = this.dpr;
    const pw = Math.max(1, Math.round(this.width * dpr));
    const ph = Math.max(1, Math.round(ctx.height * dpr));
    surface.resize(pw, ph);
    const frame: FrameState = { now, width: this.width, height: ctx.height, dpr, highlight: this.highlight };
    const pass = surface.beginFrame({ clearColor: [0, 0, 0, 0] });
    pass.setViewport({ x: 0, y: 0, width: pw, height: ph });
    pass.setScissor(null);
    this.grid?.draw(pass, { ...frame, highlight: [-1, -1, 1, 0] });
    if (scene.cartesian) {
      const p = scene.cartesian.plot;
      pass.setScissor({ x: Math.floor((p.x - 8) * dpr), y: Math.floor((p.y - 8) * dpr), width: Math.ceil((p.width + 16) * dpr), height: Math.ceil((p.height + 16) * dpr) });
    }
    for (const r of this.renderers.values()) r.draw(pass, frame, ctx);
    pass.end();

    // Compose GPU plot + text into the visible canvas.
    const W = Math.round(this.width * dpr);
    const H = Math.round(this.height * dpr);
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    const g = this.out;
    const t = this.theme;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const bg = this.options.backgroundColor && this.options.backgroundColor !== 'transparent' ? this.options.backgroundColor : null;
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
    }
    const bitmap = this.gpuCanvas.transferToImageBitmap();
    g.drawImage(bitmap, 0, Math.round(this.titleH * dpr));
    bitmap.close();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const title = typeof this.options.title === 'string' ? this.options.title : this.options.title?.text;
    if (title) {
      g.font = `700 ${t.titleFontSize}px ${t.fontFamily}`;
      g.fillStyle = t.textColor;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillText(title, 8, this.titleH / 2);
    }
    g.save();
    g.translate(0, this.titleH);
    const g2 = g as unknown as CanvasRenderingContext2D;
    if (scene.cartesian) drawAxes(g2, scene.cartesian, t);
    for (const r of this.renderers.values()) r.drawOverlay?.(g2, ctx, now);
    g.restore();
    if (this.legendH) {
      let x = 12;
      const y = this.height - this.legendH / 2;
      g.font = `${t.fontSize}px ${t.fontFamily}`;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      for (const e of scene.legend) {
        g.fillStyle = e.color;
        g.beginPath();
        g.roundRect(x, y - 6, 12, 12, 3);
        g.fill();
        g.fillStyle = t.textColor;
        g.fillText(e.label, x + 18, y);
        x += 32 + g.measureText(e.label).width;
      }
    }

    let animating = !!this.grid?.isAnimating(now);
    for (const r of this.renderers.values()) animating ||= r.isAnimating(now);
    this.lastFrameMs = performance.now() - t0;
    this.frames++;
    if (now - this.fpsWindow >= 1000) {
      this.post({ type: 'frame', fps: Math.round((this.frames * 1000) / (now - this.fpsWindow || 1000)), frameMs: this.lastFrameMs });
      this.frames = 0;
      this.fpsWindow = now;
    }
    return animating;
  }

  dispose(): void {
    for (const r of this.renderers.values()) r.destroy();
    this.renderers.clear();
    this.grid?.destroy();
    this.surface?.destroy();
  }
}

/**
 * Call inside a dedicated worker to render charts there: layout, GPU drawing,
 * text and hit testing all run off the main thread, so a busy page never
 * drops chart frames. Pair with `WorkerChart` (or the React `WorkerChart`).
 *
 * ```ts
 * // chart.worker.ts
 * import { startChartWorker, lineSeries } from '@rsc-gl/core';
 * import { webgpuBackend } from '@rsc-gl/gpu/webgpu';
 * import { webgl2Backend } from '@rsc-gl/gpu/webgl2';
 * startChartWorker({ series: [lineSeries], backends: [webgpuBackend, webgl2Backend] });
 * ```
 */
export function startChartWorker(config: ChartWorkerConfig): void {
  const scope = globalThis as unknown as { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage: (m: FromWorker) => void };
  let rt: WorkerRuntime | null = null;
  const post = (m: FromWorker) => scope.postMessage(m);
  scope.onmessage = (e) => {
    const m = e.data;
    switch (m.type) {
      case 'init':
        rt = new WorkerRuntime(m.canvas, m.width, m.height, m.dpr, m.options, config, post);
        rt.start(config.backends, m.prefer)
          .then(() => config.setup?.(rt!))
          .catch((err) => post({ type: 'error', message: (err as Error).message }));
        break;
      case 'options':
        rt?.setOptions(m.options, m.animate ?? true);
        break;
      case 'resize':
        rt?.resize(m.width, m.height, m.dpr);
        break;
      case 'pointer':
        rt?.pointer(m.x, m.y);
        break;
      case 'leave':
        rt?.leave();
        break;
      case 'append':
        rt?.appendData(m.seriesIndex, m.values, m.maxPoints);
        break;
      case 'dispose':
        rt?.dispose();
        rt = null;
        break;
    }
  };
}
