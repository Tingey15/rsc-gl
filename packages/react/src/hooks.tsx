import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { MarqueeState, CartesianLayout, LayoutContext, LegendEntry, ResolvedSeries } from '@rsc-gl/core';
import { useChartInstance } from './context';

/** Re-renders when the surrounding chart lays out (data, size or zoom changes). */
function useLayoutVersion(): number {
  const chart = useChartInstance();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!chart) return;
    setV((x) => x + 1);
    return chart.on('layout', () => setV((x) => x + 1));
  }, [chart]);
  return v;
}

/** Layout of the surrounding chart: plot rectangle and axes with their scales. */
export function useChartLayout(): { plot: LayoutContext['plot']; cartesian: CartesianLayout | null; context: LayoutContext } | null {
  const chart = useChartInstance();
  useLayoutVersion();
  const ctx = chart?.layoutContext;
  return ctx ? { plot: ctx.plot, cartesian: chart!.cartesianLayout, context: ctx } : null;
}

/** The plot rectangle in pixels relative to the plot element. */
export function useDrawingArea(): { left: number; top: number; width: number; height: number } {
  const l = useChartLayout();
  const p = l?.plot ?? { x: 0, y: 0, width: 0, height: 0 };
  return { left: p.x, top: p.y, width: p.width, height: p.height };
}

type Scale = NonNullable<ReturnType<LayoutContext['xAxis']>>['scale'];

/** Scale of an x axis (`scale.map(value)` gives a pixel position). */
export function useXScale(axisId?: string): Scale | null {
  const l = useChartLayout();
  return l?.context.xAxis(axisId)?.scale ?? null;
}

/** Scale of a y axis. */
export function useYScale(axisId?: string): Scale | null {
  const l = useChartLayout();
  return l?.context.yAxis(axisId)?.scale ?? null;
}

/** Resolved series (after grouping and stacking). */
export function useSeries(): ResolvedSeries[] {
  const chart = useChartInstance();
  useLayoutVersion();
  return chart?.resolvedSeries ?? [];
}

/** Legend entries plus actions, for building a custom legend. */
export function useLegend(): { items: LegendEntry[]; hidden: string[]; toggle: (id: string) => void; highlight: (id: string | null) => void } {
  const chart = useChartInstance();
  useLayoutVersion();
  return {
    items: chart?.legendItems ?? [],
    hidden: chart?.hiddenSeries ?? [],
    toggle: (id) => chart?.toggleSeries(id),
    highlight: (id) => chart?.highlightSeries(id),
  };
}

/**
 * An SVG layer over the plot for custom drawing with the chart's scales.
 * Children typically use `useXScale` / `useYScale` / `useDrawingArea`.
 */
export function ChartsSvgLayer({ children, style, interactive = false }: { children?: ReactNode; style?: CSSProperties; interactive?: boolean }) {
  useLayoutVersion();
  return (
    <svg className="rgl-svg-layer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: interactive ? 'auto' : 'none', zIndex: 2, ...style }}>
      {children}
    </svg>
  );
}

/**
 * The marquee of the surrounding chart: pixel `start` / `current` (plot
 * coordinates), whether a drag is in progress, and the selection (ranges and
 * items). Null when nothing is selected. Use with `ChartsSvgLayer` for custom
 * overlays.
 */
export function useMarquee(): MarqueeState | null {
  const chart = useChartInstance();
  const [state, setState] = useState<MarqueeState | null>(null);
  useEffect(() => {
    if (!chart) return;
    return chart.on('marquee', (s: MarqueeState | null) => setState(s));
  }, [chart]);
  return state;
}
