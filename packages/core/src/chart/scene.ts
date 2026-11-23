import { axisCategories, layoutCartesian, type CartesianLayout } from '../components/axes';
import type { Formatter } from '../format/format';
import type { LegendEntry, NormalizeContext, Rect, ResolvedSeries, SeriesDefinition } from '../series/types';
import { resolvePalette } from '../theme/colors';
import type { ChartTheme } from '../theme/theme';
import type { ChartOptions } from '../types';

export interface SceneInput {
  options: ChartOptions;
  defs: Map<string, SeriesDefinition>;
  /** Plot-area size in CSS px (excluding title and legend). */
  width: number;
  height: number;
  theme: ChartTheme;
  formatter: Formatter;
  measure: (text: string) => number;
  hidden: Set<string>;
}

export interface Scene {
  all: ResolvedSeries[];
  byType: Map<string, ResolvedSeries[]>;
  legend: LegendEntry[];
  cartesian: CartesianLayout | null;
  plot: Rect;
}

/**
 * DOM-free part of a chart update: normalize series, stack, collect legend
 * entries and lay out axes. Shared by server rendering and worker rendering.
 */
export function buildScene(input: SceneInput): Scene {
  const { options, defs, theme, hidden } = input;
  const palette = resolvePalette(options.colors, theme.scheme);
  let colorCursor = 0;
  let indexCursor = 0;
  const nctx: NormalizeContext = {
    data: options.data,
    dataset: options.dataset,
    axisData: (dir, id) => {
      const list = dir === 'x' ? options.xAxis : options.yAxis;
      const axis = list?.find((a, i) => (a.id ?? (i === 0 ? dir : '')) === (id ?? dir)) ?? (id === undefined || id === dir ? list?.[0] : undefined);
      return axisCategories(axis, options.dataset);
    },
    nextColor: () => palette[colorCursor++ % palette.length],
    scheme: theme.scheme,
    nextIndex: () => indexCursor++,
    isHidden: (id) => hidden.has(id),
  };
  const all: ResolvedSeries[] = [];
  for (const so of options.series) {
    const def = defs.get(so.type);
    if (!def) continue;
    for (const s of def.normalize(so as never, nctx)) {
      s.hidden = hidden.has(s.id);
      all.push(s);
    }
  }
  const byType = new Map<string, ResolvedSeries[]>();
  for (const s of all) {
    if (!byType.has(s.type)) byType.set(s.type, []);
    byType.get(s.type)!.push(s);
  }
  for (const [type, list] of byType) defs.get(type)?.process?.(list.filter((s) => !s.hidden) as never);

  const legend: LegendEntry[] = [];
  for (const [type, list] of byType) {
    const def = defs.get(type)!;
    if (def.legendEntries) legend.push(...def.legendEntries(list as never));
    else for (const s of list) legend.push({ id: s.id, label: s.label, color: s.colorCss, shape: s.legendShape, dash: s.dash, seriesIndex: s.index });
  }

  const hasCartesian = all.some((s) => defs.get(s.type)?.coordinates === 'cartesian');
  const cartesian = hasCartesian
    ? layoutCartesian({ defs, series: all, xAxis: options.xAxis, yAxis: options.yAxis, dataset: options.dataset, width: input.width, height: input.height, margin: options.margin, formatter: input.formatter, theme, measure: input.measure })
    : null;
  let plot: Rect;
  if (cartesian) plot = cartesian.plot;
  else {
    const m = { top: 8, right: 8, bottom: 8, left: 8, ...options.margin };
    plot = { x: m.left, y: m.top, width: Math.max(1, input.width - m.left - m.right), height: Math.max(1, input.height - m.top - m.bottom) };
  }
  return { all, byType, legend, cartesian, plot };
}
