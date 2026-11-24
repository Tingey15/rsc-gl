import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Chart,
  RenderEngine,
  withoutEntrance,
  annotationsPlugin,
  marqueePlugin,
  referenceLinesPlugin,
  toolbarPlugin,
  zoomPlugin,
  type ChartOptions,
  type LegendEntry,
  type ChartPlugin,
  type SeriesDefinition,
  type TooltipContext,
} from '@rsc-gl/core';

/** Optional plugins the options ask for (loaded on demand by charts). */
export function lazyPluginNames(o: ChartOptions): string[] {
  const names: string[] = [];
  // Marquee first so it receives drags before zoom panning.
  if (o.marquee && (typeof o.marquee !== 'object' || o.marquee.enabled !== false)) names.push('marquee');
  if ((o.xAxis ?? []).some((a) => a.zoom)) names.push('zoom');
  if (o.trendlines?.length || o.pointAnnotations?.length || o.scatterPaths?.length || o.scatterLabels?.length || o.directLabels) names.push('annotations');
  if (o.toolbar) names.push('toolbar');
  return names;
}

/**
 * Plugins implied by the options, created eagerly: reference lines always,
 * zoom when an axis opts in, annotations for trendlines / callouts, the
 * toolbar when requested. Charts themselves load the optional ones lazily;
 * use this when constructing a core `Chart` directly.
 */
export function autoPlugins(o: ChartOptions): ChartPlugin[] {
  const list: ChartPlugin[] = [referenceLinesPlugin()];
  const zoomAxes = (o.xAxis ?? []).filter((a) => a.zoom);
  if (zoomAxes.length) list.push(zoomPlugin({ slider: zoomAxes.some((a) => typeof a.zoom === 'object' && a.zoom.slider) }));
  if (o.trendlines?.length || o.pointAnnotations?.length || o.scatterPaths?.length || o.scatterLabels?.length || o.directLabels) list.push(annotationsPlugin());
  if (o.toolbar) list.push(toolbarPlugin(typeof o.toolbar === 'object' ? o.toolbar : {}));
  if (o.marquee && (typeof o.marquee !== 'object' || o.marquee.enabled !== false)) list.unshift(marqueePlugin(typeof o.marquee === 'object' ? o.marquee : {}));
  return list;
}

/** Props a custom legend slot receives. */
export interface LegendSlotProps {
  items: LegendEntry[];
  hidden: string[];
  toggle: (id: string) => void;
  highlight: (id: string | null) => void;
}

/** Replaceable pieces of a chart (rendered with React). */
export interface ChartSlots {
  /** Tooltip content. Receives `context` plus `slotProps.tooltip`. */
  tooltip?: ComponentType<{ context: TooltipContext } & Record<string, unknown>>;
  /** Replaces the built-in legend; rendered under the chart. */
  legend?: ComponentType<LegendSlotProps & Record<string, unknown>>;
  /** Shown over the plot while `loading` is true. */
  loadingOverlay?: ComponentType<Record<string, unknown>>;
  /** Shown over the plot when there is no data. */
  noDataOverlay?: ComponentType<Record<string, unknown>>;
}

export type ChartSlotProps = { [K in keyof ChartSlots]?: Record<string, unknown> };
import { ChartInstanceContext, useEngineOptions } from './context';
import { optionsEqual } from './equal';

export interface ChartHandle {
  /** Copies a PNG of the chart to the clipboard. */
  copy(): Promise<string>;
  /** Downloads a PNG. */
  download(fileName?: string): Promise<string>;
  /** PNG data URL. */
  getBase64Png(): Promise<string>;
  /** Vector SVG document of the chart. */
  getSvg(): Promise<string>;
  exportAsImage(options?: { type?: 'image/png' | 'image/jpeg' | 'image/webp'; quality?: number; fileName?: string }): Promise<void>;
  /** Underlying engine chart. */
  readonly chart: Chart | null;
}

export type ChartSize = number | `${number}%` | 'auto';

export interface GLChartProps {
  options: ChartOptions;
  seriesTypes: SeriesDefinition<any>[];
  /** Chart plugins. Defaults to the plugins implied by the options (see `autoPlugins`). */
  plugins?: ChartPlugin[];
  width?: ChartSize;
  height?: ChartSize;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  style?: CSSProperties;
  /** Renders tooltip content with React (the engine only positions it). */
  renderTooltip?: (ctx: TooltipContext) => ReactNode;
  /** Extra React content layered over the plot (popovers, custom overlays). */
  overlay?: ReactNode;
  onReady?: (chart: Chart) => void;
  onBackend?: (backend: string) => void;
  dataTestId?: string;
  slots?: ChartSlots;
  slotProps?: ChartSlotProps;
  /** React children layered over the plot; they can use the chart hooks (`useXScale`, ...). */
  children?: ReactNode;
  /**
   * SVG from `renderToSVGString` (server rendering). It is shown immediately
   * and the GPU chart takes over without an entrance animation.
   */
  serverSvg?: string;
}

const toCss = (v: ChartSize | undefined, fallback: string) => (v === undefined || v === 'auto' ? fallback : typeof v === 'number' ? `${v}px` : v);

/**
 * Hosts an engine chart in a React tree. All higher-level components (both
 * the children API and the props API) render through this.
 */
export const GLChart = /*#__PURE__*/ forwardRef<ChartHandle, GLChartProps>(function GLChart(props, ref) {
  const { seriesTypes, width, height, className, style, overlay, onReady, onBackend, dataTestId, slots, slotProps } = props;
  const TooltipSlot = slots?.tooltip;
  const renderTooltip = props.renderTooltip ?? (TooltipSlot ? (ctx: TooltipContext) => <TooltipSlot context={ctx} {...(slotProps?.tooltip ?? {})} /> : undefined);
  // Slots replace built-in chrome, so turn the built-in versions off.
  const options: ChartOptions =
    slots?.legend || slots?.loadingOverlay || slots?.noDataOverlay
      ? { ...props.options, legend: slots.legend ? false : props.options.legend, loading: slots.loadingOverlay ? false : props.options.loading, noDataText: slots.noDataOverlay ? '' : props.options.noDataText }
      : props.options;
  const [legendState, setLegendState] = useState<{ items: LegendEntry[]; hidden: string[] }>({ items: [], hidden: [] });
  const [hydrated, setHydrated] = useState(!props.serverSvg);
  const [svgGone, setSvgGone] = useState(!props.serverSvg);
  const [empty, setEmpty] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const applied = useRef<ChartOptions | null>(null);
  const engineOpts = useEngineOptions();
  const [chart, setChart] = useState<Chart | null>(null);
  const [tip, setTip] = useState<TooltipContext | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const effectiveOptions: ChartOptions = renderTooltip
    ? { ...options, tooltip: { ...(typeof options.tooltip === 'object' ? options.tooltip : {}), customContent: true } }
    : options;

  useLayoutEffect(() => {
    if (!host.current) return;
    const engine = RenderEngine.get(engineOpts);
    const initial = latest.current.serverSvg ? withoutEntrance(effectiveOptions) : effectiveOptions;
    const c = new Chart(host.current, initial, { series: latest.current.seriesTypes, engine, plugins: latest.current.plugins ? [...latest.current.plugins] : [referenceLinesPlugin()] });
    if (latest.current.serverSvg) {
      const off = c.on('render', () => {
        off();
        setHydrated(true);
        setTimeout(() => setSvgGone(true), 200);
      });
    }
    applied.current = initial;
    chartRef.current = c;
    setChart(c);
    const offTip = c.on('tooltip', (t) => setTip(t));
    const offBackend = c.on('backend', (b) => latest.current.onBackend?.(b));
    const offReady = c.on('ready', () => latest.current.onReady?.(c));
    const offLayout = c.on('layout', () => {
      if (latest.current.slots?.legend) setLegendState({ items: c.legendItems, hidden: c.hiddenSeries });
      setEmpty(c.resolvedSeries.every((s) => s.points.length === 0 && !(s.options as { positions?: unknown }).positions));
    });
    return () => {
      offLayout();
      offTip();
      offBackend();
      offReady();
      c.destroy();
      chartRef.current = null;
      setChart(null);
    };
    // Series types are fixed per chart component; engine changes recreate the chart.
  }, [engineOpts]);

  // Optional plugins arrive in a separate chunk the first time options need them.
  const lazyKey = lazyPluginNames(effectiveOptions).join(',');
  useEffect(() => {
    const c = chart;
    if (!c || !lazyKey) return;
    const missing = lazyKey.split(',').filter((n) => !c.plugins.some((p) => p.name === n));
    if (!missing.length) return;
    let cancelled = false;
    import('./lazy-plugins').then((m) => {
      if (cancelled) return;
      const o = latest.current.options;
      m.trackOptions(o, () => c.getOptions());
      for (const p of m.createLazyPlugins(o, missing)) c.addPlugin(p);
    });
    return () => {
      cancelled = true;
    };
  }, [chart, lazyKey]);

  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    if (applied.current && optionsEqual(applied.current, effectiveOptions)) {
      c.updateOptionsQuietly(effectiveOptions);
    } else {
      c.setOptions(effectiveOptions);
    }
    applied.current = effectiveOptions;
  });

  useImperativeHandle(
    ref,
    () => ({
      get chart() {
        return chartRef.current;
      },
      async copy() {
        const c = chartRef.current;
        if (!c) throw new Error('Chart not ready');
        await c.copyToClipboard();
        return 'copied';
      },
      async download(fileName?: string) {
        const c = chartRef.current;
        if (!c) throw new Error('Chart not ready');
        await c.download(fileName);
        return 'downloaded';
      },
      async getBase64Png() {
        const c = chartRef.current;
        if (!c) throw new Error('Chart not ready');
        return c.toDataURL('image/png');
      },
      async getSvg() {
        const c = chartRef.current;
        if (!c) throw new Error('Chart not ready');
        return c.toSVG();
      },
      async exportAsImage(o) {
        const c = chartRef.current;
        if (!c) throw new Error('Chart not ready');
        const url = await c.toDataURL(o?.type ?? 'image/png', o?.quality ?? 0.92);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${o?.fileName ?? 'chart'}.${(o?.type ?? 'image/png').split('/')[1]}`;
        a.click();
      },
    }),
    [],
  );

  const css: CSSProperties = {
    position: 'relative',
    width: toCss(width, '100%'),
    height: toCss(height, '300px'),
    minWidth: props.minWidth,
    maxWidth: props.maxWidth,
    minHeight: props.minHeight,
    maxHeight: props.maxHeight,
    ...style,
  };

  return (
    <div ref={host} className={className} style={css} data-testid={dataTestId}>
      {props.serverSvg && !svgGone ? (
        <div
          className="rgl-ssr"
          aria-hidden={hydrated}
          style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', opacity: hydrated ? 0 : 1, transition: 'opacity 160ms ease' }}
          dangerouslySetInnerHTML={{ __html: props.serverSvg }}
        />
      ) : null}
      <ChartInstanceContext.Provider value={chart}>
        {chart && renderTooltip && tip ? createPortal(renderTooltip(tip), chart.tooltipEl) : null}
        {chart && overlay ? createPortal(overlay, chart.plotEl) : null}
        {chart && props.children ? createPortal(props.children, chart.plotEl) : null}
        {chart && slots?.loadingOverlay && props.options.loading ? createPortal(<SlotLayer><slots.loadingOverlay {...(slotProps?.loadingOverlay ?? {})} /></SlotLayer>, chart.plotEl) : null}
        {chart && slots?.noDataOverlay && !props.options.loading && empty ? createPortal(<SlotLayer><slots.noDataOverlay {...(slotProps?.noDataOverlay ?? {})} /></SlotLayer>, chart.plotEl) : null}
      </ChartInstanceContext.Provider>
      {chart && slots?.legend ? (
        <div className="rgl-legend-slot" style={{ position: 'absolute', left: 0, right: 0, top: '100%' }}>
          <slots.legend
            items={legendState.items}
            hidden={legendState.hidden}
            toggle={(id: string) => chart.toggleSeries(id)}
            highlight={(id: string | null) => chart.highlightSeries(id)}
            {...(slotProps?.legend ?? {})}
          />
        </div>
      ) : null}
    </div>
  );
});

function SlotLayer({ children }: { children: ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 5 }}>{children}</div>;
}
