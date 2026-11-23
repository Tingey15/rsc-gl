import type { GpuDevice, GpuSurface } from '@rsc-gl/gpu';
import { EASING_ID, ease, prefersReducedMotion, resolveTransition, type TransitionOptions } from '../animation/easing';
import { drawAxes, layoutCartesian, axisCategories, type AxisLayout, type AxisTick, type CartesianLayout } from '../components/axes';
import { axisAnnotationBoxes, type AxisAnnotationBox } from '../components/axis-extras';
import { onImageLoad } from '../components/images';
import { exportRows, serializeRows, type DataExportFormat, type TextExportFormat } from '../data/export';
import { XLSX_MIME, toXlsx } from '../data/xlsx';
import { LegendView } from '../components/legend';
import { injectStyles } from '../components/styles';
import { TooltipView } from '../components/tooltip';
import { RenderEngine, type Renderable, type RenderEngineOptions } from '../engine/render-engine';
import { getFormatter, type Formatter } from '../format/format';
import type { FrameState, MarkItem } from '../marks/instance-mark';
import { RectMark, type RectAttrs } from '../marks/rect-mark';
import { isOrdinal, type DomainValue } from '../scales/scales';
import { formatSeriesValue } from '../series/format-value';
import type {
  HitResult,
  LayoutContext,
  LegendEntry,
  NormalizeContext,
  Rect,
  ResolvedAxis,
  ResolvedSeries,
  SeriesDefinition,
  SeriesRenderer,
} from '../series/types';
import { resolveColor, resolvePalette, withAlpha } from '../theme/colors';
import { getTheme, type ChartTheme } from '../theme/theme';
import type { ChartPlugin, PlotPoint } from './plugin';
import { SvgContext } from '../svg/svg-context';
import { xml } from '../svg/svg';
import type {
  ChartOptions,
  HighlightScopeOptions,
  ItemIdentifier,
  LegendOptions,
  TitleOptions,
  TooltipContext,
  TooltipItem,
  TooltipOptions,
} from '../types';

export interface ChartConfig {
  /** Series types this chart understands. Only these are bundled. */
  series: SeriesDefinition<any>[];
  engine: RenderEngineOptions | RenderEngine;
  /** Optional features (zoom, marquee, reference lines, annotations, ...). */
  plugins?: ChartPlugin[];
}

export type ChartEvent = 'tooltip' | 'highlight' | 'ready' | 'render' | 'backend' | 'zoom' | 'marquee' | 'layout' | 'axisAnnotation' | 'select' | 'hydrated';
type Listener = (payload: any) => void;

interface HighlightState {
  seriesIndex: number;
  dataIndex: number;
  source: 'pointer' | 'keyboard' | 'legend' | 'controlled';
}

const FADE_MS = 180;

/**
 * A GPU-rendered chart bound to a DOM container. Framework agnostic: React
 * (or any host) only calls `setOptions`, `destroy`, and listens to events.
 */
export class Chart implements Renderable {
  readonly root: HTMLElement;
  readonly plotEl: HTMLElement;
  readonly tooltipEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly gpuCanvas: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly liveRegion: HTMLElement;
  private readonly stateEl: HTMLElement;
  private readonly legend: LegendView;
  private readonly tooltip = new TooltipView();
  private readonly engine: RenderEngine;
  private readonly defs = new Map<string, SeriesDefinition>();
  private readonly renderers = new Map<string, SeriesRenderer>();
  private static readonly byElement = new WeakMap<Element, Chart>();

  /** Returns the chart rendered into `el` (or any element inside it); for devtools and tests. */
  static fromElement(el: Element | null): Chart | undefined {
    for (let e = el; e; e = e.parentElement) {
      const c = Chart.byElement.get(e);
      if (c) return c;
      const inner = e.querySelector?.(':scope > .rgl-root');
      if (inner && Chart.byElement.has(inner)) return Chart.byElement.get(inner);
    }
    return undefined;
  }
  private readonly listeners = new Map<ChartEvent, Set<Listener>>();
  private readonly resizeObserver: ResizeObserver;
  private readonly offImages: () => void;
  private annotationHover: AxisAnnotationBox | null = null;

  private device: GpuDevice | null = null;
  private surface: GpuSurface | null = null;
  private options: ChartOptions;
  private theme: ChartTheme = getTheme('light');
  private formatter: Formatter = getFormatter();
  private series: ResolvedSeries[] = [];
  private cartesian: CartesianLayout | null = null;
  private ctx: LayoutContext | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private firstRender = true;
  private destroyed = false;
  private hiddenInternal = new Set<string>();
  private hidden = new Set<string>();
  private legendEntries: LegendEntry[] = [];

  private grid: RectMark | null = null;
  private axisHighlight: RectMark | null = null;
  /** Active plugins (see `addPlugin`). */
  readonly plugins: ChartPlugin[];

  private hl: HighlightState | null = null;
  private fadeFrom = 0;
  private fadeTo = 0;
  private fadeStart = 0;
  private pointer: { x: number; y: number } | null = null;
  private axisHover: { axis: ResolvedAxis; index: number; value: DomainValue } | null = null;
  private focusIndex: { series: number; point: number } | null = null;
  private zoom = new Map<string, [number, number]>();
  /** In-flight transition, so resizes can continue it instead of cancelling it. */
  /** Tick label transitions: each tick slides from its old to its new position. */
  private tickAnim: { start: number; t: TransitionOptions; axes: Map<string, { tick: AxisTick; from: number; to: number; a0: number; a1: number }[]> } | null = null;
  private activeTransition: TransitionOptions = { duration: 0, easing: 'linear', stagger: 0 };
  /** Options that affect HTML chrome (title, legend layout, theme); data updates leave it alone. */
  private chromeKey = '';
  private chromeDirty = true;
  /** Text widths by font, reused across layouts (category axes can have thousands of labels). */
  private textWidths = new Map<string, number>();
  private textFont = '';
  private transitionEnd = 0;

  constructor(container: HTMLElement, options: ChartOptions, config: ChartConfig) {
    injectStyles(container.ownerDocument);
    this.options = options;
    for (const d of config.series) this.defs.set(d.type, d);
    this.plugins = config.plugins ?? [];
    this.engine = config.engine instanceof RenderEngine ? config.engine : RenderEngine.get(config.engine);
    this.hiddenInternal = new Set(options.defaultHiddenSeries ?? []);

    this.root = document.createElement('div');
    this.root.className = 'rgl-root';
    this.root.setAttribute('role', 'graphics-document');
    this.root.setAttribute('aria-roledescription', 'visualization');
    this.root.tabIndex = options.keyboardNavigation === false ? -1 : 0;
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'rgl-title';
    this.plotEl = document.createElement('div');
    this.plotEl.className = 'rgl-plot';
    this.gpuCanvas = document.createElement('canvas');
    this.gpuCanvas.setAttribute('aria-hidden', 'true');
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'rgl-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.stateEl = document.createElement('div');
    this.stateEl.className = 'rgl-state';
    this.liveRegion = document.createElement('div');
    this.liveRegion.className = 'rgl-sr';
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.tooltipEl = this.tooltip.el;
    this.plotEl.append(this.gpuCanvas, this.overlay, this.tooltip.el, this.stateEl, this.liveRegion);
    this.legend = new LegendView({
      onToggle: (e) => this.toggleEntry(e.id),
      onHover: (e) => {
        if (!e) {
          if (this.hl?.source === 'legend') this.setHighlight(null);
          return;
        }
        this.setHighlight({ seriesIndex: e.seriesIndex, dataIndex: e.dataIndex ?? -1, source: 'legend' });
      },
    });
    this.root.append(this.titleEl, this.plotEl, this.legend.el);
    container.appendChild(this.root);
    Chart.byElement.set(this.root, this);

    this.bindEvents();
    for (const p of this.plugins) p.attach?.(this);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.plotEl);
    this.engine.add(this);
    this.offImages = onImageLoad(() => this.engine.invalidate(this));

    this.applyChrome();
    this.engine
      .getDevice()
      .then((device) => {
        if (this.destroyed) return;
        this.attachDevice(device);
        this.emit('backend', device.type);
        this.emit('ready', this);
      })
      .catch((e) => {
        this.stateEl.textContent = `GPU rendering unavailable: ${(e as Error).message}`;
      });
  }

  /* ------------------------------------------------------------------ public API */

  get backend(): string | null {
    return this.device?.type ?? null;
  }

  get fps(): number {
    return this.engine.fps;
  }

  on(event: ChartEvent, cb: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  /** @internal Emits a chart event (used by plugins). */
  emit(event: ChartEvent, payload: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }

  setOptions(options: ChartOptions): void {
    const prev = this.options;
    this.options = options;
    this.applyChrome(false);
    if (options.highlightedItem !== undefined && options.highlightedItem !== prev.highlightedItem) this.applyControlledHighlight();
    this.relayout(true);
  }

  /**
   * Replaces the options without re-running layout. Hosts use this when only
   * callbacks changed identity (e.g. inline handlers in a re-render).
   */
  updateOptionsQuietly(options: ChartOptions): void {
    this.options = options;
  }

  getOptions(): ChartOptions {
    return this.options;
  }

  /** Programmatic highlight (null clears). */
  highlight(item: ItemIdentifier | null): void {
    if (!item) return this.setHighlight(null);
    const s = this.series.find((x) => x.id === item.seriesId);
    if (s) this.setHighlight({ seriesIndex: s.index, dataIndex: item.dataIndex ?? -1, source: 'controlled' });
  }

  /** Hidden series / legend entry ids. */
  get hiddenSeries(): string[] {
    return [...this.hidden];
  }

  /** Toggles a series / legend entry (same as clicking its legend item). */
  toggleSeries(id: string): void {
    this.toggleEntry(id);
  }

  /** Highlights a series or legend entry by id (null clears). */
  highlightSeries(id: string | null): void {
    if (id === null) return this.setHighlight(null);
    const e = this.legendEntries.find((x) => x.id === id);
    if (e) this.setHighlight({ seriesIndex: e.seriesIndex, dataIndex: e.dataIndex ?? -1, source: 'legend' });
  }

  /**
   * Attaches a plugin after creation (e.g. one loaded on demand). Plugins with
   * a name already present are ignored.
   */
  addPlugin(plugin: ChartPlugin): void {
    if (this.destroyed || this.plugins.some((p) => p.name === plugin.name)) return;
    this.plugins.push(plugin);
    plugin.attach?.(this);
    if (this.device) plugin.setDevice?.(this.device);
    this.relayout(false);
  }

  /** Legend entries (all series, including hidden ones). */
  get legendItems(): LegendEntry[] {
    return this.legendEntries;
  }

  /**
   * The chart's data as rows: one row per x value with a column per series
   * when the series share an x axis, otherwise one row per point.
   */
  getDataRows(): { columns: string[]; rows: unknown[][] } {
    return exportRows(this.series, this.ctx, this.formatter);
  }

  /** Serializes the chart's data as CSV, TSV or JSON. */
  exportData(format: TextExportFormat = 'csv'): string {
    const { columns, rows } = this.getDataRows();
    return serializeRows(columns, rows, format);
  }

  /** The chart's data as an .xlsx workbook (bytes). */
  exportXlsx(): Uint8Array {
    const { columns, rows } = this.getDataRows();
    return toXlsx(columns, rows, this.titleText() ?? 'Chart');
  }

  /** Downloads the chart's data as CSV, TSV, JSON or an .xlsx spreadsheet. */
  downloadData(format: DataExportFormat = 'csv', fileName?: string): void {
    const blob =
      format === 'xlsx'
        ? new Blob([this.exportXlsx() as BlobPart], { type: XLSX_MIME })
        : new Blob([format === 'csv' ? '\ufeff' + this.exportData(format) : this.exportData(format)], { type: `${format === 'json' ? 'application/json' : format === 'tsv' ? 'text/tab-separated-values' : 'text/csv'};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName ?? this.titleText() ?? 'chart_data'}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Downloads a vector SVG of the chart. */
  downloadSvg(fileName?: string): void {
    const url = URL.createObjectURL(new Blob([this.toSVG()], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName ?? this.titleText() ?? 'chart_export'}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Prints the chart (vector) through a hidden frame. */
  print(): void {
    const svg = this.toSVG();
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' });
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><title>${xml(this.titleText() ?? 'Chart')}</title><style>@page{margin:12mm}body{margin:0;display:flex;justify-content:center}svg{max-width:100%;height:auto}</style></head><body>${svg}</body></html>`);
    doc.close();
    const w = frame.contentWindow!;
    const done = () => setTimeout(() => frame.remove(), 500);
    w.addEventListener('afterprint', done);
    setTimeout(() => {
      w.focus();
      w.print();
      // Some browsers do not fire afterprint for frames.
      setTimeout(done, 60_000);
    }, 50);
  }

  private titleText(): string | undefined {
    const t = this.options.title;
    return typeof t === 'string' ? t : t?.text;
  }

  /** Composites the GPU canvas, overlay and chrome into an image. */
  async toDataURL(type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png', quality = 0.92): Promise<string> {
    const canvas = await this.toCanvas();
    return canvas.toDataURL(type, quality);
  }

  async toBlob(type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png', quality = 0.92): Promise<Blob> {
    const canvas = await this.toCanvas();
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), type, quality));
  }

  async toCanvas(): Promise<HTMLCanvasElement> {
    if (!this.surface) throw new Error('Chart is not rendered yet');
    const rootRect = this.root.getBoundingClientRect();
    const plotRect = this.plotEl.getBoundingClientRect();
    const dpr = this.dpr;
    const out = document.createElement('canvas');
    out.width = Math.round(rootRect.width * dpr);
    out.height = Math.round(rootRect.height * dpr);
    const g = out.getContext('2d')!;
    g.scale(dpr, dpr);
    const bg = this.options.backgroundColor && this.options.backgroundColor !== 'transparent' ? this.options.backgroundColor : this.theme.scheme === 'dark' ? '#1b1b1f' : '#ffffff';
    g.fillStyle = bg;
    g.fillRect(0, 0, rootRect.width, rootRect.height);
    // Render synchronously so the drawing buffer is valid for the copy.
    this.renderFrame(performance.now() + 1e6, true);
    const ox = plotRect.left - rootRect.left;
    const oy = plotRect.top - rootRect.top;
    g.drawImage(this.gpuCanvas, ox, oy, plotRect.width, plotRect.height);
    g.drawImage(this.overlay, ox, oy, plotRect.width, plotRect.height);
    // Title and legend (simplified re-draw of the HTML chrome).
    g.fillStyle = this.theme.textColor;
    g.textBaseline = 'top';
    const tr = this.titleEl.getBoundingClientRect();
    if (this.titleEl.textContent) {
      g.font = `700 ${this.theme.titleFontSize}px ${this.theme.fontFamily}`;
      g.fillText(this.titleEl.querySelector('.rgl-title-main')?.textContent ?? '', tr.left - rootRect.left + 8, tr.top - rootRect.top + 2);
    }
    g.font = `${this.theme.fontSize}px ${this.theme.fontFamily}`;
    this.legend.el.querySelectorAll<HTMLElement>('.rgl-legend-item').forEach((node) => {
      const r = node.getBoundingClientRect();
      const e = this.legendEntries.find((x) => (this.legendOptions().labels?.[x.id] ?? x.label) === node.textContent);
      g.globalAlpha = node.hasAttribute('data-hidden') ? 0.38 : 1;
      g.fillStyle = e?.color ?? this.theme.textColor;
      g.beginPath();
      g.roundRect(r.left - rootRect.left + 4, r.top - rootRect.top + r.height / 2 - 6, 12, 12, 3);
      g.fill();
      g.fillStyle = this.theme.textColor;
      g.textBaseline = 'middle';
      g.fillText(node.textContent ?? '', r.left - rootRect.left + 22, r.top - rootRect.top + r.height / 2);
    });
    g.globalAlpha = 1;
    return out;
  }

  /**
   * True vector export: marks, axes, labels, annotations, title and legend
   * as an SVG document (final animation state).
   */
  toSVG(): string {
    const ctx = this.ctx;
    if (!ctx) throw new Error('Chart is not rendered yet');
    const now = performance.now() + 1e6;
    const rootRect = this.root.getBoundingClientRect();
    const plotRect = this.plotEl.getBoundingClientRect();
    const W = Math.round(rootRect.width);
    const H = Math.round(rootRect.height);
    const ox = plotRect.left - rootRect.left;
    const oy = plotRect.top - rootRect.top;
    const t = this.theme;
    const bg = this.options.backgroundColor && this.options.backgroundColor !== 'transparent' ? this.options.backgroundColor : t.scheme === 'dark' ? '#1b1b1f' : '#ffffff';
    const parts: string[] = [`<rect width="${W}" height="${H}" fill="${xml(bg)}"/>`];
    const title = this.titleEl.querySelector('.rgl-title-main')?.textContent;
    if (title) parts.push(`<text x="8" y="18" font-family="${xml(t.fontFamily)}" font-size="${t.titleFontSize}" font-weight="700" fill="${xml(t.textColor)}">${xml(title)}</text>`);
    const plot = ctx.plot;
    const body: string[] = [this.grid?.toSvg(now) ?? ''];
    for (const p of this.plugins) body.push(p.toSvg?.(now, 'back') ?? '');
    const series: string[] = [];
    for (const r of this.renderers.values()) series.push(r.toSvg?.(now) ?? '');
    const clipId = `rgl-clip-${Math.random().toString(36).slice(2, 8)}`;
    body.push(this.cartesian ? `<defs><clipPath id="${clipId}"><rect x="${plot.x - 8}" y="${plot.y - 8}" width="${plot.width + 16}" height="${plot.height + 16}"/></clipPath></defs><g clip-path="url(#${clipId})">${series.join('')}</g>` : series.join(''));
    for (const p of this.plugins) body.push(p.toSvg?.(now, 'front') ?? '');
    const text = new SvgContext(this.overlay.getContext('2d'));
    const g = text as unknown as CanvasRenderingContext2D;
    if (this.cartesian) drawAxes(g, this.cartesian, t);
    for (const r of this.renderers.values()) r.drawOverlay?.(g, ctx, now);
    for (const p of this.plugins) p.drawOverlay?.(g, ctx, now);
    parts.push(`<g transform="translate(${ox.toFixed(1)},${oy.toFixed(1)})">${body.join('')}${text}</g>`);
    // Legend entries as swatch + label at their on-screen positions.
    this.legend.el.querySelectorAll<HTMLElement>('.rgl-legend-item').forEach((node) => {
      const r = node.getBoundingClientRect();
      const label = node.querySelector('.rgl-legend-label')?.textContent ?? '';
      const e = this.legendEntries.find((x) => (this.legendOptions().labels?.[x.id] ?? x.label) === label);
      const x = r.left - rootRect.left + 4;
      const y = r.top - rootRect.top + r.height / 2;
      const op = node.hasAttribute('data-hidden') ? ' opacity="0.38"' : '';
      parts.push(`<g${op}><rect x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12" rx="3" fill="${xml(e?.color ?? t.textColor)}"/><text x="${(x + 18).toFixed(1)}" y="${y.toFixed(1)}" dominant-baseline="central" font-family="${xml(t.fontFamily)}" font-size="${t.fontSize}" fill="${xml(t.textColor)}">${xml(label)}</text></g>`);
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xml(this.root.getAttribute('aria-label') ?? '')}">${parts.join('')}</svg>`;
  }

  async copyToClipboard(): Promise<void> {
    const blob = await this.toBlob('image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  async download(fileName?: string): Promise<void> {
    const url = await this.toDataURL('image/png');
    const a = document.createElement('a');
    const title = typeof this.options.title === 'string' ? this.options.title : this.options.title?.text;
    a.download = `${fileName ?? title ?? 'chart_export'}.png`;
    a.href = url;
    a.click();
  }

  destroy(): void {
    this.destroyed = true;
    this.offImages();
    this.engine.remove(this);
    this.resizeObserver.disconnect();
    for (const r of this.renderers.values()) r.destroy();
    this.renderers.clear();
    this.grid?.destroy();
    this.axisHighlight?.destroy();
    for (const p of this.plugins) p.destroy?.();
    this.surface?.destroy();
    this.root.remove();
  }

  /* ------------------------------------------------------------------ device */

  private attachDevice(device: GpuDevice): void {
    this.device = device;
    this.surface = device.createSurface(this.gpuCanvas);
    this.grid = new RectMark(device);
    this.axisHighlight = new RectMark(device);
    const r = this.plotEl.getBoundingClientRect();
    this.width = r.width;
    this.height = r.height;
    this.dpr = window.devicePixelRatio || 1;
    this.relayout(true);
  }

  onDeviceChanged(device: GpuDevice): void {
    this.surface?.destroy();
    this.device = device;
    // WebGL surfaces keep a 2D context on the canvas; WebGPU needs a fresh canvas element.
    this.surface = device.createSurface(this.gpuCanvas);
    for (const r of this.renderers.values()) r.setDevice(device);
    this.grid?.setDevice(device);
    this.axisHighlight?.setDevice(device);
    for (const p of this.plugins) p.setDevice?.(device);
    this.relayout(false);
  }

  /* ------------------------------------------------------------------ chrome */

  private legendOptions(): LegendOptions {
    const l = this.options.legend;
    return typeof l === 'object' ? l : {};
  }

  private tooltipOptions(): TooltipOptions {
    const t = this.options.tooltip;
    return typeof t === 'object' ? t : {};
  }

  private applyChrome(force = true): void {
    const o = this.options;
    const key = JSON.stringify([o.colorScheme, o.theme, o.locale, o.backgroundColor, o.title, o.legend, o.loading, o.loadingText]);
    if (!force && key === this.chromeKey) return;
    this.chromeKey = key;
    this.chromeDirty = true;
    this.theme = getTheme(o.colorScheme ?? 'light', o.theme);
    this.formatter = getFormatter(o.locale);
    const t = this.theme;
    const st = this.root.style;
    st.setProperty('--rgl-font', t.fontFamily);
    st.setProperty('--rgl-font-size', `${t.fontSize}px`);
    st.setProperty('--rgl-title-size', `${t.titleFontSize}px`);
    st.setProperty('--rgl-text', t.textColor);
    st.setProperty('--rgl-muted', t.mutedTextColor);
    st.setProperty('--rgl-focus', t.focusRing);
    st.setProperty('--rgl-hover', t.scheme === 'dark' ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)');
    st.setProperty('--rgl-tooltip-bg', t.tooltipBackground);
    st.setProperty('--rgl-tooltip-text', t.tooltipText);
    st.setProperty('--rgl-tooltip-border', t.tooltipBorder);
    st.background = o.backgroundColor && o.backgroundColor !== 'transparent' ? o.backgroundColor : '';

    const title: TitleOptions | undefined = typeof o.title === 'string' ? { text: o.title } : o.title;
    this.titleEl.style.display = title ? '' : 'none';
    this.titleEl.style.textAlign = title?.align === 'middle' ? 'center' : title?.align === 'end' ? 'right' : 'left';
    this.titleEl.innerHTML = title ? `<div class="rgl-title-main"></div>${title.subtitle ? '<div class="rgl-title-sub"></div>' : ''}` : '';
    if (title) {
      this.titleEl.querySelector('.rgl-title-main')!.textContent = title.text;
      if (title.subtitle) this.titleEl.querySelector('.rgl-title-sub')!.textContent = title.subtitle;
    }

    const showLegend = o.legend !== false && o.legend !== undefined;
    const lpos = this.legendOptions().position ?? 'bottom';
    this.legend.el.style.display = showLegend ? '' : 'none';
    if (!showLegend) {
      st.gridTemplateAreas = '"title" "plot"';
      st.gridTemplateRows = 'auto minmax(0, 1fr)';
      st.gridTemplateColumns = 'minmax(0, 1fr)';
    } else if (lpos === 'top' || lpos === 'bottom') {
      st.gridTemplateAreas = lpos === 'top' ? '"title" "legend" "plot"' : '"title" "plot" "legend"';
      st.gridTemplateRows = lpos === 'top' ? 'auto auto minmax(0, 1fr)' : 'auto minmax(0, 1fr) auto';
      st.gridTemplateColumns = 'minmax(0, 1fr)';
    } else {
      st.gridTemplateAreas = lpos === 'left' ? '"title title" "legend plot"' : '"title title" "plot legend"';
      st.gridTemplateRows = 'auto minmax(0, 1fr)';
      st.gridTemplateColumns = lpos === 'left' ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr) auto';
    }

    if (o.loading) {
      this.stateEl.innerHTML = `<div class="rgl-spinner"></div><div>${o.loadingText ?? 'Loading…'}</div>`;
      this.stateEl.style.display = '';
    } else {
      this.stateEl.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------------ layout */

  private handleResize(): void {
    const r = this.plotEl.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const changed = r.width !== this.width || r.height !== this.height || dpr !== this.dpr;
    this.width = r.width;
    this.height = r.height;
    this.dpr = dpr;
    if (changed) this.relayout(false);
  }

  private transition(animate: boolean): TransitionOptions {
    const a = this.options.animation;
    const t = resolveTransition(typeof a === 'object' ? a : a);
    if (!animate || prefersReducedMotion() || a === false) return { ...t, duration: 0 };
    return t;
  }

  private relayout(animate: boolean, override?: TransitionOptions): void {
    if (!this.device || this.width <= 0 || this.height <= 0) return;
    const o = this.options;
    const now = performance.now();
    const scheme = this.theme.scheme;
    const palette = resolvePalette(o.colors, scheme);
    let colorCursor = 0;
    let indexCursor = 0;
    this.hidden = new Set(o.hiddenSeries ?? this.hiddenInternal);
    const nctx: NormalizeContext = {
      data: o.data,
      dataset: o.dataset,
      axisData: (dir, id) => {
        const list = dir === 'x' ? o.xAxis : o.yAxis;
        const axis = list?.find((a) => (a.id ?? (list.indexOf(a) === 0 ? dir : '')) === (id ?? dir)) ?? (id === undefined || id === dir ? list?.[0] : undefined);
        return axisCategories(axis, o.dataset);
      },
      nextColor: () => palette[colorCursor++ % palette.length],
      scheme,
      nextIndex: () => indexCursor++,
      isHidden: (id) => this.hidden.has(id),
    };

    const all: ResolvedSeries[] = [];
    for (const so of o.series) {
      const def = this.defs.get(so.type);
      if (!def) {
        console.warn(`[rsc-gl] series type "${so.type}" is not registered for this chart`);
        continue;
      }
      for (const s of def.normalize(so as never, nctx)) {
        s.hidden = this.hidden.has(s.id);
        all.push(s);
      }
    }
    // Per-type processing (stacking) on visible series.
    const byType = new Map<string, ResolvedSeries[]>();
    for (const s of all) {
      if (!byType.has(s.type)) byType.set(s.type, []);
      byType.get(s.type)!.push(s);
    }
    for (const [type, list] of byType) this.defs.get(type)?.process?.(list.filter((s) => !s.hidden) as never);
    this.series = all;

    // Legend entries (all series, including hidden).
    this.legendEntries = [];
    for (const [type, list] of byType) {
      const def = this.defs.get(type)!;
      if (def.legendEntries) this.legendEntries.push(...def.legendEntries(list as never));
      else
        for (const s of list)
          this.legendEntries.push({ id: s.id, label: s.label, color: s.colorCss, shape: s.legendShape, dash: s.dash, seriesIndex: s.index });
    }

    // The legend (and title) take space from the plot. Fill them in first and
    // re-measure synchronously; otherwise the resulting resize would re-run
    // layout without animation and cut the entrance short.
    const legendChanged = this.legend.update(this.legendEntries, this.legendOptions(), this.hidden);
    // Reading layout forces a synchronous reflow: only do it when the chrome around the plot changed.
    if (legendChanged || this.chromeDirty || this.firstRender) {
      const pr = this.plotEl.getBoundingClientRect();
      if (pr.width > 0 && pr.height > 0) {
        this.width = pr.width;
        this.height = pr.height;
      }
      this.chromeDirty = false;
    }

    // Layout.
    const measureCtx = this.overlay.getContext('2d')!;
    const font = `${this.theme.fontSize}px ${this.theme.fontFamily}`;
    measureCtx.font = font;
    if (font !== this.textFont || this.textWidths.size > 50_000) {
      this.textWidths.clear();
      this.textFont = font;
    }
    const widths = this.textWidths;
    const measure = (t: string) => {
      let w = widths.get(t);
      if (w === undefined) {
        w = measureCtx.measureText(t).width;
        widths.set(t, w);
      }
      return w;
    };
    const hasCartesian = all.some((s) => this.defs.get(s.type)?.coordinates === 'cartesian');
    let plot: Rect;
    const reserve = this.plugins.reduce((acc, p) => acc + (p.reserveBottom?.(this) ?? 0), 0);
    const margin = reserve ? { ...o.margin, bottom: (o.margin?.bottom ?? 8) + reserve } : o.margin;
    if (hasCartesian) {
      this.cartesian = layoutCartesian({
        defs: this.defs,
        series: all,
        xAxis: o.xAxis,
        yAxis: o.yAxis,
        dataset: o.dataset,
        width: this.width,
        height: this.height,
        margin,
        formatter: this.formatter,
        theme: this.theme,
        measure,
        zoom: this.zoom,
      });
      plot = this.cartesian.plot;
    } else {
      this.cartesian = null;
      const m = { top: 8, right: 8, bottom: 8, left: 8, ...o.margin };
      plot = { x: m.left, y: m.top, width: Math.max(1, this.width - m.left - m.right), height: Math.max(1, this.height - m.top - m.bottom) };
    }
    const prevCart = this.prevCartesian;
    this.prevCartesian = this.cartesian;
    const cart = this.cartesian;
    const anim = typeof o.animation === 'object' ? o.animation : {};
    let transition = this.transition(animate || this.firstRender);
    if (override && !this.firstRender) {
      transition = prefersReducedMotion() || this.options.animation === false ? { ...override, duration: 0 } : override;
      this.activeTransition = transition;
      this.transitionEnd = now + transition.duration;
    } else if (!animate && !this.firstRender && now < this.transitionEnd) {
      // Resized mid-transition: retarget over the remaining time instead of snapping to the end.
      transition = { ...this.activeTransition, duration: this.transitionEnd - now, stagger: 0 };
    } else if (transition.duration > 0) {
      this.activeTransition = transition;
      // Entrances run a little longer (pie sweeps, line reveals).
      this.transitionEnd = now + transition.duration * (this.firstRender ? 1.3 : 1);
    }
    const ctx: LayoutContext = {
      now,
      transition,
      firstRender: this.firstRender,
      enterAnimation: this.firstRender && anim.enter !== false && transition.duration > 0,
      theme: this.theme,
      scheme,
      formatter: this.formatter,
      plot,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      xAxis: (id) => cart?.xAxes.find((a) => a.id === (id ?? 'x')) ?? cart?.xAxes[0],
      yAxis: (id) => cart?.yAxes.find((a) => a.id === (id ?? 'y')) ?? cart?.yAxes[0],
    };
    this.ctx = ctx;
    this.animateTicks(prevCart, cart, transition, now);

    // Renderers per type, in first-appearance order.
    for (const [type, list] of byType) {
      let r = this.renderers.get(type);
      if (!r) {
        r = this.defs.get(type)!.createRenderer(this.device);
        this.renderers.set(type, r);
      }
      r.layout(list, ctx);
    }
    for (const [type, r] of this.renderers) {
      if (!byType.has(type)) {
        r.destroy();
        this.renderers.delete(type);
      }
    }

    this.layoutGrid(ctx);
    for (const p of this.plugins) p.layout?.(this, ctx);
    this.updateDescription();
    if (o.series.length === 0 || all.every((s) => s.points.length === 0 && !(s.options as { positions?: unknown }).positions)) {
      if (!o.loading) {
        this.stateEl.textContent = o.noDataText ?? 'No data found';
        this.stateEl.style.display = '';
      }
    } else if (!o.loading) this.stateEl.style.display = 'none';
    this.firstRender = false;
    this.engine.invalidate(this);
    this.emit('layout', ctx);
  }

  private prevCartesian: CartesianLayout | null = null;

  /** Builds tick label transitions between the previous and new axis layouts. */
  private animateTicks(prev: CartesianLayout | null, next: CartesianLayout | null, t: TransitionOptions, now: number): void {
    if (!next || t.duration <= 0) {
      this.tickAnim = null;
      return;
    }
    if (!prev) {
      // First render: labels fade in with the marks.
      const axes = new Map([...next.xAxes, ...next.yAxes].map((a) => [`${a.direction}:${a.id}`, a.ticks.map((tick) => ({ tick, from: tick.pos, to: tick.pos, a0: 0, a1: 1 }))]));
      this.tickAnim = { start: now, t: { ...t, easing: 'cubicOut' }, axes };
      return;
    }
    const axes = new Map<string, { tick: AxisTick; from: number; to: number; a0: number; a1: number }[]>();
    const all = (c: CartesianLayout) => [...c.xAxes, ...c.yAxes];
    const key = (a: AxisLayout) => `${a.direction}:${a.id}`;
    const prevByKey = new Map(all(prev).map((a) => [key(a), a]));
    const posIn = (a: AxisLayout, v: AxisTick['value']) => {
      const p = a.scale.map(v) + a.scale.bandwidth() / 2;
      return Number.isFinite(p) ? p : null;
    };
    for (const a of all(next)) {
      const old = prevByKey.get(key(a));
      const list: { tick: AxisTick; from: number; to: number; a0: number; a1: number }[] = [];
      const oldLabels = new Map((old?.ticks ?? []).map((tk) => [String(tk.value), tk]));
      const newLabels = new Set(a.ticks.map((tk) => String(tk.value)));
      for (const tk of a.ticks) {
        const had = oldLabels.get(String(tk.value));
        const from = had ? had.pos : old ? (posIn(old, tk.value) ?? tk.pos) : tk.pos;
        list.push({ tick: tk, from, to: tk.pos, a0: had ? 1 : 0, a1: 1 });
      }
      for (const tk of old?.ticks ?? []) {
        if (newLabels.has(String(tk.value))) continue;
        list.push({ tick: tk, from: tk.pos, to: posIn(a, tk.value) ?? tk.pos, a0: 1, a1: 0 });
      }
      axes.set(key(a), list);
    }
    this.tickAnim = { start: now, t, axes };
  }

  /** Axis layout with tick positions / opacity interpolated for the current frame. */
  private displayAxes(now: number): CartesianLayout | null {
    const cart = this.cartesian;
    const ta = this.tickAnim;
    if (!cart || !ta) return cart;
    const raw = Math.min(1, (now - ta.start) / ta.t.duration);
    if (raw >= 1) {
      this.tickAnim = null;
      return cart;
    }
    const e = ease(raw, EASING_ID[ta.t.easing]);
    const map = (a: AxisLayout): AxisLayout => {
      const list = ta.axes.get(`${a.direction}:${a.id}`);
      if (!list) return a;
      return { ...a, ticks: list.map((x) => ({ ...x.tick, pos: x.from + (x.to - x.from) * e, alpha: x.a0 + (x.a1 - x.a0) * e })) };
    };
    return { ...cart, xAxes: cart.xAxes.map(map), yAxes: cart.yAxes.map(map) };
  }

  private layoutGrid(ctx: LayoutContext): void {
    if (!this.grid) return;
    const items: MarkItem<RectAttrs>[] = [];
    const cart = this.cartesian;
    if (cart) {
      const g = this.options.grid;
      const anyHorizontalBars = this.series.some((s) => s.type === 'bar' && (s.options as { layout?: string }).layout === 'horizontal');
      const horizontal = g ? !!g.horizontal : !anyHorizontalBars;
      const vertical = g ? !!g.vertical : anyHorizontalBars;
      const color = resolveColor(this.theme.gridColor);
      const strong = withAlpha(resolveColor(this.theme.axisColor), 0.9);
      const p = cart.plot;
      const ya = cart.yAxes[0];
      const xa = cart.xAxes[0];
      if ((horizontal || ya?.options.grid) && ya) {
        for (const t of ya.ticks) {
          if (t.pos < p.y - 0.5 || t.pos > p.y + p.height + 0.5) continue;
          const isZero = !isOrdinal(ya.scaleType) && Number(t.value) === 0;
          const value: RectAttrs = { x: p.x, y: t.pos - 0.5, width: p.width, height: 1, color: isZero && ya.options.baseline !== false ? strong : color, radius: 0, corners: 0 };
          items.push({ key: `gy|${String(t.value)}`, seriesIndex: -1, dataIndex: -1, value, enter: { ...value, color: [color[0], color[1], color[2], 0] } });
        }
      }
      if ((vertical || xa?.options.grid) && xa) {
        for (const t of xa.ticks) {
          if (t.pos < p.x - 0.5 || t.pos > p.x + p.width + 0.5) continue;
          const isZero = !isOrdinal(xa.scaleType) && Number(t.value) === 0;
          const value: RectAttrs = { x: t.pos - 0.5, y: p.y, width: 1, height: p.height, color: isZero ? strong : color, radius: 0, corners: 0 };
          items.push({ key: `gx|${String(t.value)}`, seriesIndex: -1, dataIndex: -1, value, enter: { ...value, color: [color[0], color[1], color[2], 0] } });
        }
      }
    }
    this.grid.update(items, { ...ctx.transition, stagger: 0 }, ctx.now);
  }

  private updateDescription(): void {
    const o = this.options;
    const set = (label: string) => {
      if (this.root.getAttribute('aria-label') !== label) this.root.setAttribute('aria-label', label);
    };
    if (o.description) return set(o.description);
    const types = [...new Set(this.series.map((s) => s.type))].join(' and ');
    const names = this.series.filter((s) => !s.hidden).map((s) => s.label);
    const title = typeof o.title === 'string' ? o.title : o.title?.text;
    set(`${title ? `${title}. ` : ''}${types} chart with ${names.length} series${names.length ? `: ${names.slice(0, 8).join(', ')}` : ''}.`);
  }

  /* ------------------------------------------------------------------ rendering */

  private highlightUniform(now: number): [number, number, number, number] {
    const t = this.fadeStart > 0 ? Math.min(1, (now - this.fadeStart) / FADE_MS) : 1;
    const f = this.fadeFrom + (this.fadeTo - this.fadeFrom) * ease(t, EASING_ID.cubicOut);
    const hl = this.hl;
    if (!hl && f <= 0.001) return [-1, -1, 1, 0];
    const scope = this.scopeFor(hl ? this.series.find((s) => s.index === hl.seriesIndex) : undefined);
    const fadeAlpha = scope.fade === 'none' ? 1 : 1 - f * (1 - this.theme.fadeOpacity);
    const idx = scope.highlight === 'series' || !hl ? -1 : hl.dataIndex;
    return [hl?.seriesIndex ?? this.lastHl.seriesIndex, hl ? idx : this.lastHl.dataIndex, fadeAlpha, 1];
  }

  private lastHl: { seriesIndex: number; dataIndex: number } = { seriesIndex: -1, dataIndex: -1 };

  renderFrame(now: number, force = false): boolean {
    if (!this.surface || !this.ctx || this.width <= 0) return false;
    const ctx = this.ctx;
    const dpr = this.dpr;
    const pw = Math.round(this.width * dpr);
    const ph = Math.round(this.height * dpr);
    this.surface.resize(pw, ph);
    const highlight = this.highlightUniform(now);
    const frame: FrameState = { now, width: this.width, height: this.height, dpr, highlight };
    const pass = this.surface.beginFrame({ clearColor: [0, 0, 0, 0] });
    pass.setViewport({ x: 0, y: 0, width: pw, height: ph });
    pass.setScissor(null);
    const noHl: FrameState = { ...frame, highlight: [-1, -1, 1, 0] };
    this.grid?.draw(pass, noHl);
    for (const p of this.plugins) p.drawBack?.(pass, noHl, ctx);
    if (this.cartesian) {
      const p = this.cartesian.plot;
      // Small slack so edge markers are not cut; exact clipping while zoomed.
      const m = this.zoom.size ? 0 : 8;
      pass.setScissor({ x: Math.floor((p.x - m) * dpr), y: Math.floor((p.y - m) * dpr), width: Math.ceil((p.width + 2 * m) * dpr), height: Math.ceil((p.height + 2 * m) * dpr) });
    }
    this.drawAxisHighlight(pass, noHl);
    for (const r of this.renderers.values()) r.draw(pass, frame, ctx);
    for (const p of this.plugins) p.drawPlot?.(pass, frame, ctx);
    pass.setScissor(null);
    for (const p of this.plugins) p.drawFront?.(pass, noHl, ctx);
    pass.end();

    // Overlay.
    const ov = this.overlay;
    if (ov.width !== pw || ov.height !== ph) {
      ov.width = pw;
      ov.height = ph;
    }
    const g = ov.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pw, ph);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const axesNow = this.displayAxes(now);
    if (axesNow) drawAxes(g, axesNow, this.theme);
    for (const r of this.renderers.values()) r.drawOverlay?.(g, ctx, now);
    for (const p of this.plugins) p.drawOverlay?.(g, ctx, now);
    this.drawFocusRing(g, now);

    let animating = false;
    for (const r of this.renderers.values()) animating ||= r.isAnimating(now);
    animating ||= !!this.grid?.isAnimating(now);
    for (const p of this.plugins) animating ||= !!p.isAnimating?.(now);
    animating ||= !!this.tickAnim;
    animating ||= this.fadeStart > 0 && now - this.fadeStart < FADE_MS;
    if (!animating && this.fadeStart > 0) {
      this.fadeStart = 0;
      this.fadeFrom = this.fadeTo;
    }
    this.emit('render', now);
    return force ? false : animating;
  }

  private drawAxisHighlight(pass: Parameters<RectMark['draw']>[0], frame: FrameState): void {
    if (!this.axisHighlight || !this.cartesian) return;
    const hov = this.axisHover;
    const items: MarkItem<RectAttrs>[] = [];
    const mode = this.options.axisHighlight?.x;
    if (hov && mode !== 'none') {
      const p = this.cartesian.plot;
      const a = hov.axis;
      const band = a.scale.bandwidth();
      const color = this.theme.scheme === 'dark' ? [1, 1, 1, 0.07] : [0, 0, 0, 0.05];
      const lineColor = withAlpha(resolveColor(this.theme.axisColor), 0.8);
      if (a.direction === 'x') {
        const x = a.scale.map(hov.value);
        if (band > 0 && mode !== 'line') items.push({ key: 'ah', seriesIndex: -1, dataIndex: -1, value: { x: x - a.scale.step() * 0.1, y: p.y, width: band + a.scale.step() * 0.2, height: p.height, color: color as never, radius: 0, corners: 0 } });
        else items.push({ key: 'ah', seriesIndex: -1, dataIndex: -1, value: { x: x + band / 2 - 0.5, y: p.y, width: 1, height: p.height, color: lineColor, radius: 0, corners: 0 } });
      } else {
        const y = a.scale.map(hov.value);
        items.push({ key: 'ah', seriesIndex: -1, dataIndex: -1, value: { x: p.x, y: y - a.scale.step() * 0.1, width: p.width, height: band + a.scale.step() * 0.2, color: color as never, radius: 0, corners: 0 } });
      }
    }
    this.axisHighlight.update(items, { duration: 0, easing: 'linear', stagger: 0 }, frame.now);
    this.axisHighlight.draw(pass, frame);
  }

  private drawFocusRing(g: CanvasRenderingContext2D, now: number): void {
    if (!this.focusIndex || this.hl?.source !== 'keyboard' || document.activeElement !== this.root) return;
    const s = this.visibleSeries()[this.focusIndex.series];
    const pt = s?.points[this.focusIndex.point];
    if (!s || !pt) return;
    const a = this.renderers.get(s.type)?.itemAnchor?.(s.id, pt.index, now);
    if (!a) return;
    g.save();
    g.strokeStyle = this.theme.focusRing;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(a.x, a.y, 9, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  /* ------------------------------------------------------------------ interaction */

  private scopeFor(s?: ResolvedSeries): Required<HighlightScopeOptions> {
    const own = s?.options.highlightScope ?? this.options.highlightScope ?? {};
    return { highlight: own.highlight ?? 'item', fade: own.fade ?? 'global' };
  }

  private setHighlight(next: HighlightState | null): void {
    const prev = this.hl;
    const same = prev && next && prev.seriesIndex === next.seriesIndex && prev.dataIndex === next.dataIndex;
    if (same) {
      this.hl = next;
      return;
    }
    if (!next && this.options.highlightedItem) {
      // Fall back to the controlled highlight when the pointer leaves.
      this.hl = null;
      this.applyControlledHighlight();
      return;
    }
    const now = performance.now();
    const cur = this.currentFade(now);
    if (prev) this.lastHl = { seriesIndex: prev.seriesIndex, dataIndex: prev.dataIndex };
    this.hl = next;
    if (!!prev !== !!next) {
      this.fadeFrom = cur;
      this.fadeTo = next ? 1 : 0;
      this.fadeStart = now;
    }
    const s = next ? this.series.find((x) => x.index === next.seriesIndex) : null;
    this.legend.setFaded(next ? next.seriesIndex : null, next?.dataIndex);
    const id: ItemIdentifier | null = s ? { seriesId: s.id, dataIndex: next!.dataIndex >= 0 ? next!.dataIndex : undefined } : null;
    if (next?.source !== 'controlled') this.options.onHighlightChange?.(id);
    this.emit('highlight', id);
    this.engine.invalidate(this);
  }

  private currentFade(now: number): number {
    if (this.fadeStart <= 0) return this.fadeTo;
    const t = Math.min(1, (now - this.fadeStart) / FADE_MS);
    return this.fadeFrom + (this.fadeTo - this.fadeFrom) * ease(t, EASING_ID.cubicOut);
  }

  private applyControlledHighlight(): void {
    const h = this.options.highlightedItem;
    if (h === undefined) return;
    if (h === null) {
      if (this.hl?.source === 'controlled') this.setHighlight(null);
      return;
    }
    const s = this.series.find((x) => x.id === h.seriesId);
    if (s) this.setHighlight({ seriesIndex: s.index, dataIndex: h.dataIndex ?? -1, source: 'controlled' });
  }

  private toggleEntry(id: string): void {
    this.options.onLegendClick?.(id);
    const lo = this.legendOptions();
    if (lo.toggleable === false) return;
    const next = new Set(this.hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Never hide everything.
    if (next.size >= this.legendEntries.length) return;
    this.options.onHiddenSeriesChange?.([...next]);
    if (!this.options.hiddenSeries) {
      this.hiddenInternal = next;
      this.setHighlight(null);
      this.relayout(true);
    }
  }

  private visibleSeries(): ResolvedSeries[] {
    return this.series.filter((s) => !s.hidden && !s.options.excludeFromInteraction);
  }

  private localPoint(e: { clientX: number; clientY: number }) {
    const r = this.plotEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private bindEvents(): void {
    const el = this.plotEl;
    type Hook = 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onWheel' | 'onDoubleClick';
    const dispatch = (hook: Hook, e: Event, p: PlotPoint) =>
      this.plugins.some((pl) => (pl[hook] as ((e: Event, p: PlotPoint) => boolean | void) | undefined)?.call(pl, e, p) === true);
    el.addEventListener('pointermove', (e) => {
      const p = this.localPoint(e);
      if (dispatch('onPointerMove', e, p)) {
        this.tooltip.hide();
        return;
      }
      this.pointer = p;
      this.handlePointer(p.x, p.y);
    });
    el.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.axisHover = null;
      this.tooltip.hide();
      this.emit('tooltip', null);
      if (this.hl?.source === 'pointer') this.setHighlight(null);
      this.engine.invalidate(this);
    });
    el.addEventListener('click', (e) => {
      const p = this.localPoint(e);
      const ann = this.annotationAt(p.x, p.y);
      if (ann) {
        for (const a of ann.annotations) this.options.onAxisAnnotationClick?.(a, ann.axisId);
        this.emit('axisAnnotation', { axisId: ann.axisId, annotations: ann.annotations });
        return;
      }
      const hit = this.hitTest(p.x, p.y);
      if (hit && hit.distance < 30) {
        const pt = hit.series.points.find((x) => x.index === hit.dataIndex);
        this.options.onItemClick?.({ seriesId: hit.series.id, dataIndex: hit.dataIndex, datum: pt?.datum, value: pt?.y }, e as PointerEvent);
      }
      if (this.axisHover && this.options.onAxisClick) this.options.onAxisClick({ axisValue: this.axisHover.value, dataIndex: this.axisHover.index }, e as PointerEvent);
    });
    el.addEventListener('contextmenu', (e) => {
      if (!this.options.onItemContextMenu) return;
      const p = this.localPoint(e);
      const hit = this.hitTest(p.x, p.y);
      if (hit) {
        e.preventDefault();
        const pt = hit.series.points.find((x) => x.index === hit.dataIndex);
        this.options.onItemContextMenu({ seriesId: hit.series.id, dataIndex: hit.dataIndex, datum: pt?.datum }, e);
      }
    });
    el.addEventListener('wheel', (e) => dispatch('onWheel', e, this.localPoint(e)) && e.preventDefault(), { passive: false });
    el.addEventListener('pointerdown', (e) => {
      if (dispatch('onPointerDown', e, this.localPoint(e))) {
        // Capture can fail for pointers that are already gone (or synthetic ones).
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* keep going without capture */
        }
      }
    });
    el.addEventListener('pointerup', (e) => {
      dispatch('onPointerUp', e, this.localPoint(e));
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    });
    el.addEventListener('dblclick', (e) => dispatch('onDoubleClick', e, this.localPoint(e)));

    // Keyboard navigation.
    this.root.addEventListener('keydown', (e) => {
      if (this.plugins.some((p) => p.onKeyDown?.(e) === true)) return;
      this.handleKey(e);
    });
    this.root.addEventListener('blur', () => {
      if (this.hl?.source === 'keyboard') {
        this.setHighlight(null);
        this.tooltip.hide();
      }
    });
  }

  /* ------------------------------------------------------------------ plugin API */

  get layoutContext(): LayoutContext | null {
    return this.ctx;
  }

  get cartesianLayout(): CartesianLayout | null {
    return this.cartesian;
  }

  get resolvedSeries(): ResolvedSeries[] {
    return this.series;
  }

  get gpuDevice(): GpuDevice | null {
    return this.device;
  }

  get chartTheme(): ChartTheme {
    return this.theme;
  }

  get chartFormatter(): Formatter {
    return this.formatter;
  }

  get size(): { width: number; height: number; dpr: number } {
    return { width: this.width, height: this.height, dpr: this.dpr };
  }

  /** Schedules a frame. */
  invalidate(): void {
    this.engine.invalidate(this);
  }

  /** Re-runs layout (e.g. after a plugin changed state). */
  refresh(animate = false): void {
    this.relayout(animate);
  }

  /** Continuous x axes that opted into zoom. */
  zoomableAxes(): ResolvedAxis[] {
    return (this.cartesian?.xAxes ?? []).filter((a) => a.options.zoom && !isOrdinal(a.scaleType));
  }

  /** Current zoom window of an axis, if zoomed. */
  getZoom(axisId: string): [number, number] | undefined {
    return this.zoom.get(axisId);
  }

  /** Sets (or clears with null) the visible window of an axis. */
  setZoom(axisId: string, range: [number, number] | null, animate = false): void {
    if (range) this.zoom.set(axisId, range);
    else this.zoom.delete(axisId);
    this.relayout(animate);
    const state = [...this.zoom].map(([id, [start, end]]) => ({ axisId: id, start, end }));
    this.options.onZoomChange?.(state);
    this.emit('zoom', state);
  }

  /**
   * Streams data into a series: appends values (and optional x values / axis
   * categories), keeps at most `maxPoints`, and re-renders without animation.
   * Works with value arrays, row arrays and scatter `positions`.
   */
  appendData(target: { seriesId?: string; seriesIndex?: number }, values: unknown[], opts: { x?: unknown[]; maxPoints?: number; axisId?: string } = {}): void {
    const list = this.options.series;
    const i = target.seriesIndex ?? list.findIndex((s) => s.id === target.seriesId);
    const s = list[i] as { data?: unknown[]; positions?: Float32Array | Float64Array } | undefined;
    if (!s) return;
    const max = opts.maxPoints ?? Infinity;
    if (s.positions) {
      const next = new Float32Array(Math.min(s.positions.length + values.length, max * 2));
      const merged = [...s.positions, ...(values as number[])];
      next.set(merged.slice(Math.max(0, merged.length - next.length)));
      s.positions = next;
    } else {
      const merged = [...(s.data ?? []), ...values];
      s.data = merged.slice(Math.max(0, merged.length - max));
    }
    if (opts.x) {
      const axes = this.options.xAxis ?? [];
      const a = axes.find((ax) => (ax.id ?? 'x') === (opts.axisId ?? 'x')) ?? axes[0];
      if (a?.data) {
        const merged = [...a.data, ...(opts.x as never[])];
        a.data = merged.slice(Math.max(0, merged.length - max));
      }
    }
    this.relayout(false);
  }

  /**
   * Real-time updates for row-based series (candles, bars, lines): append
   * rows and / or replace the last row (a forming candle), keep a sliding
   * window, and animate briefly so prices move and the window slides smoothly
   * instead of jumping. Pass `animation: 0` to update instantly.
   */
  streamData(
    target: { seriesId?: string; seriesIndex?: number },
    update: { append?: unknown[]; replaceLast?: unknown; maxPoints?: number },
    animation: number | Partial<TransitionOptions> = 220,
  ): void {
    const list = this.options.series;
    const i = target.seriesIndex ?? list.findIndex((s) => s.id === target.seriesId);
    const s = list[i] as { data?: unknown[] } | undefined;
    if (!s) return;
    let rows = [...(s.data ?? [])];
    if (update.replaceLast !== undefined && rows.length) rows[rows.length - 1] = update.replaceLast;
    if (update.append?.length) rows = rows.concat(update.append);
    const max = update.maxPoints ?? Infinity;
    if (rows.length > max) rows = rows.slice(rows.length - max);
    s.data = rows;
    const t: TransitionOptions = typeof animation === 'number' ? { duration: animation, easing: 'cubicOut', stagger: 0 } : { duration: 220, easing: 'cubicOut', stagger: 0, ...animation };
    this.relayout(t.duration > 0, t);
  }

  /** Public hit test in plot coordinates. */
  hitTestAt(x: number, y: number): HitResult | null {
    return this.hitTest(x, y);
  }

  /** Screen anchor of an item. */
  anchorOf(seriesId: string, dataIndex: number): { x: number; y: number } | null {
    const s = this.series.find((x) => x.id === seriesId);
    return (s && this.renderers.get(s.type)?.itemAnchor?.(s.id, dataIndex, performance.now())) || null;
  }

  /** Domain of an axis ignoring zoom. */
  fullDomain(axisId: string): [number, number] {
    const saved = this.zoom.get(axisId);
    this.zoom.delete(axisId);
    const layout = layoutCartesian({
      defs: this.defs,
      series: this.series,
      xAxis: this.options.xAxis,
      yAxis: this.options.yAxis,
      dataset: this.options.dataset,
      width: this.width,
      height: this.height,
      formatter: this.formatter,
      theme: this.theme,
      measure: (t) => t.length * 7,
    });
    if (saved) this.zoom.set(axisId, saved);
    const a = layout.xAxes.find((x) => x.id === axisId);
    return (a?.scale.domain().map(Number) as [number, number]) ?? [0, 1];
  }

  private hitTest(x: number, y: number): HitResult | null {
    if (!this.ctx) return null;
    const now = performance.now();
    let best: HitResult | null = null;
    for (const r of this.renderers.values()) {
      const hit = r.hitTest(x, y, this.ctx, now);
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    return best;
  }

  private tooltipTrigger(): 'item' | 'axis' | 'none' {
    const t = this.tooltipOptions().trigger;
    if (this.options.tooltip === false) return 'none';
    if (t) return t;
    const types = new Set(this.visibleSeries().map((s) => s.type));
    return [...types].every((x) => x === 'line' || x === 'area') && types.size > 0 ? 'axis' : 'item';
  }

  /** Axis annotation under a plot-element point. */
  private annotationAt(x: number, y: number): AxisAnnotationBox | null {
    if (!this.cartesian) return null;
    const boxes = axisAnnotationBoxes(this.cartesian, this.theme);
    return boxes.find((b) => x >= b.x - 2 && x <= b.x + b.width + 2 && y >= b.y - 2 && y <= b.y + b.height + 2) ?? null;
  }

  private handlePointer(x: number, y: number): void {
    if (!this.ctx) return;
    const ann = this.annotationAt(x, y);
    this.annotationHover = ann;
    this.plotEl.style.cursor = ann ? 'pointer' : '';
    if (ann) {
      const fmt = (v: unknown) => (v === undefined ? '' : (this.cartesian ? [...this.cartesian.xAxes, ...this.cartesian.yAxes].find((a) => a.id === ann.axisId)?.format(v as DomainValue, 'tooltip') : undefined) ?? String(v));
      const items: TooltipItem[] = ann.annotations.map((a, i) => ({
        seriesId: `annotation-${i}`,
        seriesLabel: a.label ?? 'Annotation',
        dataIndex: i,
        color: ann.color,
        value: null,
        formattedValue: a.description ?? (a.start !== undefined || a.end !== undefined ? `${fmt(a.start)} – ${fmt(a.end)}` : fmt(a.value)),
      }));
      const tip: TooltipContext = { trigger: 'item', axisLabel: ann.summary ? ann.label : undefined, items, x: ann.x + ann.width / 2, y: ann.direction === 'x' ? ann.y : ann.y + ann.height / 2 };
      this.tooltip.show(tip, { ...this.tooltipOptions(), placement: ann.direction === 'x' ? 'top' : 'right' }, { width: this.width, height: this.height });
      this.emit('tooltip', tip);
      if (this.hl?.source === 'pointer') this.setHighlight(null);
      return;
    }
    const plot = this.ctx.plot;
    const inside = x >= plot.x - 4 && x <= plot.x + plot.width + 4 && y >= plot.y - 4 && y <= plot.y + plot.height + 4;
    const trigger = this.tooltipTrigger();
    const hit = inside || !this.cartesian ? this.hitTest(x, y) : null;
    this.axisHover = null;

    if (this.cartesian && inside) {
      // Category under the pointer on the primary category axis.
      const horizontalBars = this.visibleSeries().some((s) => s.type === 'bar' && (s.options as { layout?: string }).layout === 'horizontal');
      const axis = horizontalBars ? this.cartesian.yAxes[0] : this.cartesian.xAxes[0];
      if (axis) {
        if (isOrdinal(axis.scaleType)) {
          const idx = axis.scale.invertIndex(horizontalBars ? y : x);
          if (idx >= 0) this.axisHover = { axis, index: idx, value: axis.scale.domain()[idx] };
        } else if (hit) {
          const pt = hit.series.points.find((p) => p.index === hit.dataIndex);
          if (pt) this.axisHover = { axis, index: hit.dataIndex, value: pt.x };
        }
      }
      if (trigger !== 'axis' && !this.options.axisHighlight?.x) this.axisHover = trigger === 'item' && this.visibleSeries().some((s) => s.type === 'bar') ? this.axisHover : null;
      if (this.options.axisHighlight?.x === 'none') this.axisHover = null;
    }

    const isLine = (s: ResolvedSeries) => s.type === 'line' || s.type === 'area';
    const accept = hit && (hit.distance === 0 || (isLine(hit.series) ? hit.distance < 80 : hit.distance < 30));
    if (accept && hit) this.setHighlight({ seriesIndex: hit.series.index, dataIndex: hit.dataIndex, source: 'pointer' });
    else if (this.hl?.source === 'pointer') this.setHighlight(null);

    if (trigger === 'none') {
      this.tooltip.hide();
      this.engine.invalidate(this);
      return;
    }
    let tip: TooltipContext | null = null;
    const opts = this.tooltipOptions();
    if (trigger === 'axis' && this.axisHover) {
      const items: TooltipItem[] = [];
      for (const r of this.renderers.values()) items.push(...(r.itemsAtIndex?.(this.axisHover.index, this.axisHover.value, this.ctx) ?? []));
      if (items.length) {
        const anchor = opts.anchor === 'mark' && hit ? hit.anchor : { x, y };
        tip = { trigger: 'axis', axisValue: this.axisHover.value, axisLabel: this.axisHover.axis.format(this.axisHover.value, 'tooltip'), items, x: anchor.x, y: anchor.y };
      }
    } else if (accept && hit) {
      tip = this.itemTooltip(hit, opts.anchor === 'mark' ? hit.anchor : { x, y });
    }
    if (tip) {
      this.tooltip.show(tip, opts, { width: this.width, height: this.height }, hit?.series.id);
      this.emit('tooltip', tip);
    } else {
      this.tooltip.hide();
      this.emit('tooltip', null);
    }
    this.engine.invalidate(this);
  }

  private itemTooltip(hit: HitResult, at: { x: number; y: number }): TooltipContext {
    const s = hit.series;
    const pt = s.points.find((p) => p.index === hit.dataIndex);
    const def = this.defs.get(s.type);
    const value = pt?.y ?? null;
    let formatted: string;
    if (def?.formatValue && pt) formatted = def.formatValue(s, pt, this.formatter);
    else formatted = formatSeriesValue(s, value, this.formatter, 'tooltip', hit.dataIndex);
    const xa = this.ctx?.xAxis(s.xAxisId);
    const header = def?.coordinates === 'cartesian' && s.type !== 'scatter' && pt && xa ? xa.format(pt.x, 'tooltip') : undefined;
    return {
      trigger: 'item',
      axisLabel: header,
      axisValue: pt?.x,
      items: [
        {
          seriesId: s.id,
          seriesLabel: s.label,
          dataIndex: hit.dataIndex,
          color: pt?.color ? `rgba(${pt.color.map((c, i) => (i < 3 ? Math.round(c * 255) : c)).join(',')})` : s.colorCss,
          value,
          formattedValue: formatted,
          datum: pt?.datum,
          label: s.type === 'pie' ? pt?.label : undefined,
        },
      ],
      x: at.x,
      y: at.y,
    };
  }

  private handleKey(e: KeyboardEvent): void {
    if (this.options.keyboardNavigation === false) return;
    const vis = this.visibleSeries();
    if (!vis.length) return;
    let f = this.focusIndex ?? { series: 0, point: -1 };
    const len = (i: number) => vis[i]?.points.length ?? 0;
    switch (e.key) {
      case 'ArrowRight':
        f = { series: f.series, point: Math.min(len(f.series) - 1, f.point + 1) };
        break;
      case 'ArrowLeft':
        f = { series: f.series, point: Math.max(0, f.point - 1) };
        break;
      case 'ArrowDown':
        f = { series: (f.series + 1) % vis.length, point: Math.max(0, Math.min(len((f.series + 1) % vis.length) - 1, f.point)) };
        break;
      case 'ArrowUp':
        f = { series: (f.series - 1 + vis.length) % vis.length, point: Math.max(0, Math.min(len((f.series - 1 + vis.length) % vis.length) - 1, f.point)) };
        break;
      case 'Home':
        f = e.ctrlKey || e.metaKey ? { series: 0, point: 0 } : { series: f.series, point: 0 };
        break;
      case 'End':
        f = e.ctrlKey || e.metaKey ? { series: vis.length - 1, point: len(vis.length - 1) - 1 } : { series: f.series, point: len(f.series) - 1 };
        break;
      case 'PageDown':
        f = { series: f.series, point: Math.min(len(f.series) - 1, f.point + Math.max(1, Math.round(len(f.series) / 10))) };
        break;
      case 'PageUp':
        f = { series: f.series, point: Math.max(0, f.point - Math.max(1, Math.round(len(f.series) / 10))) };
        break;
      case 'Escape':
        this.focusIndex = null;
        this.setHighlight(null);
        this.tooltip.hide();
        return;
      case 'Enter':
      case ' ': {
        if (!this.focusIndex) return;
        const s = vis[f.series];
        const pt = s.points[f.point];
        if (pt) this.options.onItemClick?.({ seriesId: s.id, dataIndex: pt.index, datum: pt.datum, value: pt.y }, e as unknown as PointerEvent);
        e.preventDefault();
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    if (f.point < 0) f.point = 0;
    this.focusIndex = f;
    const s = vis[f.series];
    const pt = s.points[f.point];
    if (!pt) return;
    this.setHighlight({ seriesIndex: s.index, dataIndex: pt.index, source: 'keyboard' });
    const anchor = this.renderers.get(s.type)?.itemAnchor?.(s.id, pt.index, performance.now());
    if (anchor) {
      const tip = this.itemTooltip({ series: s, dataIndex: pt.index, anchor, distance: 0 }, anchor);
      this.tooltip.show(tip, { ...this.tooltipOptions(), placement: 'top' }, { width: this.width, height: this.height });
      this.emit('tooltip', tip);
      this.liveRegion.textContent = `${s.label}, ${tip.axisLabel ? `${tip.axisLabel}, ` : ''}${tip.items[0]?.label ? `${tip.items[0].label}, ` : ''}${tip.items[0]?.formattedValue ?? ''}. ${f.point + 1} of ${s.points.length}.`;
    }
  }
}
