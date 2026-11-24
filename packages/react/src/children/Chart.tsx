import { Children, forwardRef, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  areaSeries,
  barSeries,
  facetBy,
  niceExtent,
  resolvePalette,
  rgbaToCss,
  resolveColor,
  sharedExtent,
  type AxisAnnotation as AxisAnnotationSpec,
  type Chart as EngineChart,
  type DirectLabelOptions,
  type PointAnnotationOptions,
  type ScatterLabelOptions,
  type ScatterPathOptions,
  type ToolbarOptions,
  getFormatter,
  lineSeries,
  pieSeries,
  scatterSeries,
  bulletSeries,
  vennSeries,
  type AxisOptions,
  type TrendlineOptions,
  type ChartOptions,
  type Datum,
  type ItemIdentifier,
  type LegendOptions,
  type LineType,
  type NumberFormat,
  type PaletteInput,
  type ReferenceLineOptions,
  type SeriesDefinition,
  type SeriesOptions,
  type TooltipContext,
  type TooltipOptions,
} from '@rsc-gl/core';
import { GLChart, type ChartHandle, type ChartSize } from '../GLChart';
import { SparkLineChart } from '../props/charts';
import {
  kindOf,
  type AnnotationProps,
  type AreaProps,
  type AxisProps,
  type BarDirectLabelProps,
  type BarProps,
  type BigNumberProps,
  type AxisAnnotationProps,
  type AxisGroupProps,
  type AxisThumbnailProps,
  type ChartActionBarProps,
  type LineDirectLabelProps,
  type LineForecastProps,
  type LinePointAnnotationProps,
  type ScatterAnnotationProps,
  type ScatterPathProps,
  type ChartPopoverProps,
  type TrendlineAnnotationProps,
  type TrendlineProps,
  type MetricRangeProps,
  type BulletProps,
  type VennProps,
  type ChartTooltipProps,
  type DonutProps,
  type DonutSummaryProps,
  type LegendProps,
  type LineProps,
  type ReferenceLineProps,
  type ScatterProps,
  type SegmentLabelProps,
  type TitleProps,
} from './components';

/** A legacy `highlightedItem`: an item identifier, or the `idKey` value(s) of the highlighted row(s). */
export type HighlightedItem = ItemIdentifier | string | number | (string | number)[] | null;

export interface ChartProps {
  data: Datum[];
  children?: ReactNode;
  width?: ChartSize;
  /** Default 300. */
  height?: ChartSize;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  colors?: PaletteInput | PaletteInput[];
  colorScheme?: 'light' | 'dark';
  backgroundColor?: string;
  lineTypes?: LineType[];
  /** Space around the plot: one number for every side, or per side. */
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  title?: string;
  description?: string;
  /** A locale code ('de-DE'), or locale definitions (`{ number, time }`, as in the legacy library). */
  locale?: string | Record<string, unknown>;
  /** Row field that identifies a datum (used by `highlightedItem` values). Default `id`. */
  idKey?: string;
  hiddenSeries?: string[];
  highlightedSeries?: string | number;
  highlightedItem?: HighlightedItem;
  loading?: boolean;
  emptyStateText?: string;
  animations?: boolean;
  tooltipAnchor?: 'cursor' | 'mark';
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  style?: CSSProperties;
  onBackend?: (backend: string) => void;
  /** Called once the chart has a GPU device (replaces the legacy view-ready callback). */
  onReady?: (chart: EngineChart) => void;
  dataTestId?: string;
  /** Drag to zoom into a range (default), or `{ action: 'select' }` to select data. */
  marquee?: boolean | import('@rsc-gl/core').MarqueeOptions;
  /** @internal Set on the panels of a trellis (small multiples). */
  __panel?: { valueRange?: [number, number]; dimRange?: [number, number]; hideLegend?: boolean };
}

const ALL: Record<string, SeriesDefinition<any>> = { bar: barSeries, line: lineSeries, area: areaSeries, scatter: scatterSeries, pie: pieSeries, bullet: bulletSeries, venn: vennSeries };

type El = ReactElement<Record<string, unknown>>;

function flatten(children: ReactNode, out: El[] = []): El[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as El;
    if (!kindOf(el) && el.props && 'children' in el.props) flatten(el.props.children as ReactNode, out);
    else out.push(el);
  });
  return out;
}

const facetField = (f: unknown): string | undefined => (typeof f === 'string' ? f : undefined);
const facetValue = <T,>(f: unknown): T | undefined => (f && typeof f === 'object' && 'value' in (f as object) ? (f as { value: T }).value : undefined);
const KNOWN_LINE_TYPES = new Set(['solid', 'dashed', 'dotted', 'dotDash', 'shortDash', 'longDash', 'twoDash']);

const CURVE: Record<string, string> = {
  monotone: 'monotoneX',
  'catmull-rom': 'catmullRom',
  'step-after': 'stepAfter',
  'step-before': 'stepBefore',
  step: 'step',
  linear: 'linear',
  basis: 'basis',
  cardinal: 'cardinal',
  natural: 'natural',
};

/** Legacy point sizes are areas (px²); the engine takes diameters. Tokens pass through. */
const pointDiameter = (s: LineProps['pointSize']) => (typeof s === 'number' ? Math.sqrt(s) : s);

/** Group key the engine builds for a row (several fields are joined with ' | '). */
const groupKey = (row: Datum, fields: string[]) => fields.map((f) => String(row[f] ?? '')).join(' | ');

/** Distinct group keys in order of first appearance. */
const groupsOf = (rows: readonly Datum[], fields: string[]) => [...new Set(rows.map((r) => groupKey(r, fields)))];

interface MarkInteraction {
  tooltip?: ChartTooltipProps;
  popover?: ChartPopoverProps;
  actionBar?: ChartActionBarProps;
  onClick?: (datum: Datum) => void;
  onContextMenu?: (event: MouseEvent, datum: Datum) => void;
  onMouseOver?: (datum: Datum) => void;
  onMouseOut?: (datum: Datum) => void;
  seriesType: string;
}

interface AxisLabelHandlers {
  hasTooltip?: boolean;
  onClick?: (value: string | number, index: number) => void;
}

interface Compiled {
  options: ChartOptions;
  types: SeriesDefinition<any>[];
  /** One entry per series, aligned with `options.series` (the engine's `markIndex`). */
  interactions: MarkInteraction[];
  bigNumber?: { props: BigNumberProps; sparkline?: LineProps };
  axisLabels: Map<string, AxisLabelHandlers>;
}

/** Compiles the children tree into an engine spec. */
function compile(props: ChartProps): Compiled {
  const els = flatten(props.children);
  const series: SeriesOptions[] = [];
  const xAxis: AxisOptions[] = [];
  const yAxis: AxisOptions[] = [];
  const refs: ReferenceLineOptions[] = [];
  const trendlines: TrendlineOptions[] = [];
  const interactions: MarkInteraction[] = [];
  const axisLabels = new Map<string, AxisLabelHandlers>();
  let legend: LegendOptions | false = false;
  let legendProps: LegendProps | undefined;
  let title: ChartOptions['title'] = props.title ? { text: props.title, align: 'middle' } : undefined;
  let tooltip: TooltipOptions | false = false;
  let bigNumber: Compiled['bigNumber'];
  let directLabels: DirectLabelOptions | undefined;
  const palette = Array.isArray(props.colors) && Array.isArray(props.colors[0]) ? (props.colors[0] as PaletteInput) : (props.colors as PaletteInput | undefined);
  const scheme = props.colorScheme ?? 'light';
  const resolved = resolvePalette(palette as never, scheme);
  /** The legacy default mark color (the first palette color). */
  const firstColor = resolved[0];
  const f = getFormatter(props.locale as never);
  let horizontalBars = false;
  let lineScale: 'time' | 'linear' | 'point' | undefined;
  let barGap: number | undefined;
  let barGroupGap: number | undefined;
  let barOuter: number | undefined;
  let timeCategories = false;
  /** Series that go on the secondary metric axis once the axes are known. */
  const dualAxis: SeriesOptions[] = [];
  const hasField = (rows: readonly Datum[], field: string) => rows.some((d) => field in d);

  const childrenOf = (el: El) => flatten(el.props.children as ReactNode);
  const pushSeries = (s: SeriesOptions, inter: MarkInteraction) => {
    series.push(s);
    interactions.push(inter);
    return series.length - 1;
  };
  const collectInteraction = (el: El, seriesType: string): MarkInteraction & { kids: El[] } => {
    const kids = childrenOf(el);
    const t = kids.find((k) => kindOf(k) === 'tooltip')?.props as ChartTooltipProps | undefined;
    const pop = kids.find((k) => kindOf(k) === 'popover')?.props as ChartPopoverProps | undefined;
    const bar = kids.find((k) => kindOf(k) === 'actionBar')?.props as ChartActionBarProps | undefined;
    const p = el.props as Pick<BarProps, 'onClick' | 'onContextMenu' | 'onMouseOver' | 'onMouseOut'>;
    if (t) tooltip = { trigger: t.highlightBy === 'dimension' ? 'axis' : 'item', anchor: props.tooltipAnchor === 'mark' ? 'mark' : 'pointer', placement: props.tooltipPlacement };
    return { tooltip: t, popover: pop, actionBar: bar, onClick: p.onClick, onContextMenu: p.onContextMenu, onMouseOver: p.onMouseOver, onMouseOut: p.onMouseOut, seriesType, kids };
  };
  /** Options every mark shares: tooltip scoping, excluded rows, pointer cursor. */
  const markCommon = (inter: MarkInteraction) => ({
    excludeDataKeys: inter.tooltip?.excludeDataKeys,
    cursor: inter.onClick || inter.popover || inter.actionBar ? 'pointer' : undefined,
  });
  /** Trendline children, each fitted to the series of its own mark. */
  const trendsOf = (kids: El[], indices: number[]) =>
    kids
      .filter((k) => kindOf(k) === 'trendline')
      .forEach((k) => {
        const t = k.props as TrendlineProps;
        const ann = childrenOf(k).find((c) => kindOf(c) === 'trendlineAnnotation')?.props as TrendlineAnnotationProps | undefined;
        for (const markIndex of indices)
          trendlines.push({
            markIndex,
            method: t.method ?? 'linear',
            color: t.color,
            lineType: t.lineType ?? 'dashed',
            lineWidth: t.lineWidth ?? 2,
            opacity: t.opacity ?? 1,
            extend: t.dimensionExtent === 'domain',
            displayOnHover: t.displayOnHover,
            excludeDataKeys: t.excludeDataKeys,
            hidePartialWindows: t.hidePartialWindows ?? false,
            label: ann ? (v: number) => `${ann.prefix ?? ''}${f.number(v, ann.numberFormat ?? 'shortNumber')}` : undefined,
            labelBadge: ann?.badge,
          });
      });

  const pointAnnotations: PointAnnotationOptions[] = [];
  const scatterLabels: ScatterLabelOptions[] = [];
  const scatterPaths: ScatterPathOptions[] = [];
  const axisKids: { axis: AxisOptions; kids: El[] }[] = [];
  let toolbar: ToolbarOptions | undefined;
  let firstDimension: string | undefined;
  /** Callouts declared as children of a mark. */
  const annotate = (kids: El[], markIndex: number, dimension: string, metric: string, colorField: string | undefined, staticPoint: string | undefined) => {
    for (const k of kids) {
      if (kindOf(k) !== 'linePointAnnotation') continue;
      const a = k.props as unknown as LinePointAnnotationProps;
      const anchor = Array.isArray(a.anchor) ? a.anchor[0] : a.anchor;
      const text = (row: Datum, value: number) =>
        typeof a.label === 'function' ? a.label(value) : (a.label ?? (a.textKey ? String(row[a.textKey] ?? '') : f.number(value, 'shortNumber')));
      const base = { anchor, color: a.color, offset: a.offset, matchLineColor: a.matchLineColor, markIndex };
      if (a.dimensionValue === undefined) {
        // Legacy form: label every static point of the line.
        for (const row of props.data) {
          if (!staticPoint || !row[staticPoint]) continue;
          const value = Number(row[metric]);
          pointAnnotations.push({ ...base, x: row[dimension] as never, seriesId: colorField ? String(row[colorField]) : undefined, label: text(row, value) });
        }
        continue;
      }
      const group = a.series ?? (colorField ? (props.data.find((d) => colorField in d)?.[colorField] as string | undefined) : undefined);
      const rows = props.data.filter((d) => !colorField || group === undefined || String(d[colorField]) === String(group));
      const byDim = [...rows].sort((x, y) => (Number(x[dimension]) || 0) - (Number(y[dimension]) || 0));
      const byMetric = [...rows].sort((x, y) => Number(x[metric]) - Number(y[metric]));
      const row =
        a.dimensionValue === 'first'
          ? byDim[0]
          : a.dimensionValue === 'last'
            ? byDim[byDim.length - 1]
            : a.dimensionValue === 'max'
              ? byMetric[byMetric.length - 1]
              : a.dimensionValue === 'min'
                ? byMetric[0]
                : rows.find((d) => String(d[dimension]) === String(a.dimensionValue));
      if (!row) continue;
      const value = Number(row[metric]);
      pointAnnotations.push({
        ...base,
        x: row[dimension] as never,
        seriesId: colorField && group !== undefined ? String(group) : undefined,
        y: colorField && group === undefined ? value : undefined,
        label: text(row, value),
      });
    }
  };

  /**
   * Pushes a mark's series. With `dualMetricAxis`, its last series (by color) moves
   * to the secondary metric axis and keeps the color it would have had.
   */
  const pushMark = (s: SeriesOptions, inter: MarkInteraction, dual: boolean | undefined, colorFields: string[], horizontal = false): number[] => {
    const rows = (s.data as Datum[] | undefined) ?? props.data;
    if (!dual || !colorFields.length) return [pushSeries(s, inter)];
    const groups = groupsOf(rows, colorFields);
    if (groups.length < 2) return [pushSeries(s, inter)];
    const last = groups[groups.length - 1];
    const primary = pushSeries({ ...s, data: rows.filter((r) => groupKey(r, colorFields) !== last), colors: groups.slice(0, -1).map((_, i) => resolved[i % resolved.length]) } as SeriesOptions, inter);
    const secondary: SeriesOptions = {
      ...s,
      id: undefined,
      stack: undefined,
      data: rows.filter((r) => groupKey(r, colorFields) === last),
      colors: [resolved[(groups.length - 1) % resolved.length]],
    } as SeriesOptions;
    (secondary as { __horizontal?: boolean }).__horizontal = horizontal;
    dualAxis.push(secondary);
    return [primary, pushSeries(secondary, inter)];
  };

  const handle = (el: El, comboDimension?: string) => {
    switch (kindOf(el)) {
      case 'bar': {
        const p = el.props as BarProps;
        const inter = collectInteraction(el, 'bar');
        const { kids } = inter;
        const colorField = facetField(p.color);
        const dimension = p.dimension ?? comboDimension ?? 'category';
        const metric = p.metric ?? 'value';
        horizontalBars ||= p.orientation === 'horizontal';
        barGap = p.paddingRatio ?? 0.4;
        barGroupGap = p.groupedPadding ?? barGap;
        barOuter = p.paddingOuter ?? barOuter;
        timeCategories ||= p.dimensionDataType === 'time';
        const groupBy = colorField && hasField(props.data, colorField) ? colorField : undefined;
        firstDimension ??= dimension;
        // Stack order: rows sorted by the order key (stable), so segments stack in that order.
        const rows = p.order ? [...props.data].sort((a, b) => (Number(a[p.order!]) || 0) - (Number(b[p.order!]) || 0)) : undefined;
        const ann = kids.find((k) => kindOf(k) === 'annotation')?.props as AnnotationProps | undefined;
        const direct = kids.find((k) => kindOf(k) === 'barDirectLabel')?.props as BarDirectLabelProps | undefined;
        const textKey = ann ? (ann.textKey ?? metric) : direct?.dataKey;
        const placement = direct
          ? ({ start: 'start', middle: 'center', end: 'inside-end', 'end-outside': 'outside' } as const)[direct.position ?? 'end-outside']
          : ann
            ? 'outside'
            : undefined;
        const format: NumberFormat | undefined = direct?.format;
        const barLabel =
          ann || direct || p.showValues
            ? textKey
              ? (item: { value: number | null; datum?: Datum }) => {
                  const v = item.datum?.[textKey];
                  if (v === undefined || v === null || v === '') return null;
                  return typeof v === 'number' ? f.number(v, format ?? 'standardNumber') : String(v);
                }
              : ('value' as const)
            : undefined;
        const indices = pushMark(
          {
            id: p.name,
            type: 'bar',
            dimension,
            metric,
            data: rows,
            groupBy,
            color: facetValue<string>(p.color) ?? (groupBy ? undefined : firstColor),
            colorField: p.colorOverride,
            stack: (p.type ?? 'stacked') === 'stacked' ? (p.name ?? 'stack') : undefined,
            layout: p.orientation === 'horizontal' ? 'horizontal' : 'vertical',
            borderRadius: p.hasSquareCorners ? 0 : 6,
            opacity: p.opacity,
            borderWidth: p.lineWidth,
            barLabel: barLabel as never,
            barLabelPlacement: placement,
            barLabelBadge: !!ann,
            barLabelOverflow: direct?.overflow,
            barLabelFormat: format,
            colors: palette,
            highlightScope: inter.tooltip?.highlightBy === 'series' ? { highlight: 'series', fade: 'global' } : undefined,
            ...(p.metricAxis ? (p.orientation === 'horizontal' ? { xAxisId: p.metricAxis } : { yAxisId: p.metricAxis }) : {}),
            ...markCommon(inter),
          } as SeriesOptions,
          inter,
          p.dualMetricAxis,
          groupBy ? [groupBy] : [],
          p.orientation === 'horizontal',
        );
        trendsOf(kids, indices);
        annotate(kids, indices[0], dimension, metric, groupBy, undefined);
        break;
      }
      case 'line': {
        const p = el.props as LineProps;
        const inter = collectInteraction(el, 'line');
        const { kids } = inter;
        const ranges = kids.filter((k) => kindOf(k) === 'metricRange').map((k) => k.props as unknown as MetricRangeProps);
        const colorField = facetField(p.color);
        const ltField = typeof p.lineType === 'string' && !KNOWN_LINE_TYPES.has(p.lineType) ? p.lineType : undefined;
        const groupBy = [...new Set([colorField, ltField].filter((x): x is string => !!x && hasField(props.data, x)))];
        lineScale = p.scaleType ?? (comboDimension ? 'point' : (lineScale ?? 'time'));
        const dimension = p.dimension ?? comboDimension ?? 'datetime';
        const metric = p.metric ?? 'value';
        firstDimension ??= dimension;
        const staticKey = typeof p.staticPoint === 'string' ? p.staticPoint : undefined;
        const lineColor = facetValue<string>(p.color) ?? (colorField && hasField(props.data, colorField) ? undefined : firstColor);
        const showMark =
          p.isSparkline && p.isMethodLast ? 'end' : staticKey ? ({ datum }: { datum?: Datum }) => !!datum?.[staticKey] : p.staticPoint === true ? true : undefined;
        const base = {
          id: p.name,
          type: 'line',
          dimension,
          metric,
          groupBy: groupBy.length ? groupBy : undefined,
          color: lineColor,
          lineType: (typeof p.lineType === 'string' && KNOWN_LINE_TYPES.has(p.lineType) ? p.lineType : facetValue<LineType>(p.lineType)) as LineType | undefined,
          lineTypeField: ltField,
          lineTypes: props.lineTypes,
          lineWidth: p.lineWidth ?? (p.isSparkline ? 'S' : undefined),
          opacity: p.opacity,
          curve: p.interpolate ? (CURVE[p.interpolate] ?? p.interpolate) : 'linear',
          showMark,
          markSize: pointDiameter(p.pointSize ?? (staticKey ? 125 : undefined)),
          gradient: p.gradient,
          alternateField: p.alternateSegmentKey,
          alternateLineType: p.alternateSegmentLineType,
          metricRanges: ranges.map((r) => ({
            metricStart: r.metricStart,
            metricEnd: r.metricEnd,
            color: r.color,
            lineType: r.lineType,
            rangeOpacity: r.rangeOpacity,
            displayOnHover: r.displayOnHover,
            scaleAxisToFit: r.scaleAxisToFit ?? false,
            lineWidth: r.lineWidth,
            lineOpacity: r.lineOpacity,
          })),
          // Without a color key, every line (e.g. one per dash pattern) keeps the one static color.
          colors: lineColor ? [lineColor] : palette,
          highlightScope: inter.tooltip?.highlightBy === 'item' ? { highlight: 'item', fade: 'global' } : { highlight: 'series', fade: 'global' },
          ...(p.metricAxis ? { yAxisId: p.metricAxis } : {}),
          ...markCommon(inter),
        } as SeriesOptions;
        const indices = pushMark(base, inter, p.dualMetricAxis, groupBy);
        trendsOf(kids, indices);
        annotate(kids, indices[0], dimension, metric, groupBy[0], staticKey);
        const dl = kids.find((k) => kindOf(k) === 'lineDirectLabel')?.props as LineDirectLabelProps | undefined;
        if (dl) {
          const fmt = dl.format;
          directLabels = {
            value: dl.value ?? 'last',
            position: dl.position,
            prefix: dl.prefix,
            showName: false,
            exclude: dl.excludeSeries,
            fontSize: dl.fontSize,
            format: fmt ? (v) => f.number(v, fmt) : undefined,
            markIndices: [...(directLabels?.markIndices ?? []), ...indices],
          };
        }
        const fc = kids.find((k) => kindOf(k) === 'lineForecast')?.props as LineForecastProps | undefined;
        if (fc) {
          // The forecast metric from `start` on, dashed, in the same colors; a rule marks the boundary.
          const startKey = typeof fc.start === 'string' && lineScale === 'time' ? Date.parse(fc.start) : fc.start;
          const after = (r: Datum) => {
            const v = r[dimension];
            const n = typeof v === 'string' && lineScale === 'time' ? Date.parse(v) : v;
            return typeof n === 'number' && typeof startKey === 'number' ? n >= startKey : String(n) >= String(startKey);
          };
          const rows = props.data.filter((r) => after(r) && r[fc.metric] !== undefined && r[fc.metric] !== null);
          const groups = groupBy.length ? groupsOf(props.data, groupBy) : [];
          const colors = groups.length ? groupsOf(rows, groupBy).map((g) => resolved[groups.indexOf(g) % resolved.length]) : undefined;
          pushSeries(
            { ...base, id: `${p.name ?? `line${series.length}`}-forecast`, metric: fc.metric, data: rows, lineType: 'dashed', showMark: undefined, metricRanges: undefined, colors, disableTooltip: false } as SeriesOptions,
            inter,
          );
          refs.push({ x: fc.start as never, label: fc.label ?? 'Forecast', labelAlign: 'start', color: 'gray-500', lineType: 'solid', lineWidth: 1, layer: 'back' } as ReferenceLineOptions);
        }
        break;
      }
      case 'area': {
        const p = el.props as AreaProps;
        const inter = collectInteraction(el, 'area');
        const colorField = facetField(p.color ?? 'series');
        lineScale = p.scaleType ?? 'time';
        firstDimension ??= p.dimension ?? 'datetime';
        pushSeries(
          {
            id: p.name,
            type: 'area',
            dimension: p.dimension ?? 'datetime',
            metric: p.metric ?? 'value',
            metricStart: p.metricStart,
            metricEnd: p.metricEnd,
            groupBy: colorField && hasField(props.data, colorField) ? colorField : undefined,
            color: facetValue<string>(p.color),
            opacity: p.opacity ?? 0.8,
            curve: p.interpolate ? (CURVE[p.interpolate] ?? p.interpolate) : 'linear',
            stack: p.metricStart ? undefined : 'stack',
            colors: palette,
            highlightScope: { highlight: 'series', fade: 'global' },
            ...markCommon(inter),
          } as SeriesOptions,
          inter,
        );
        break;
      }
      case 'scatter': {
        const p = el.props as ScatterProps;
        const inter = collectInteraction(el, 'scatter');
        const { kids } = inter;
        const colorField = facetField(p.color);
        const linear = p.colorScaleType === 'linear';
        const metric = p.metric ?? 'value';
        firstDimension ??= p.dimension ?? 'x';
        const groupBy = colorField && !linear ? colorField : undefined;
        const index = pushSeries(
          {
            id: p.name,
            type: 'scatter',
            dimension: p.dimension ?? 'x',
            metric,
            groupBy,
            colorValueField: linear ? colorField : undefined,
            colorScheme: p.colorScheme,
            color: facetValue<string>(p.color) ?? (groupBy || linear ? undefined : firstColor),
            sizeField: facetField(p.size),
            sizeRange: [6, 16],
            markerSize: facetValue(p.size) ?? 'M',
            shape: p.symbolShape ?? 'circle',
            opacity: p.opacity ?? 1,
            strokeWidth: p.lineWidth,
            strokeColor: p.stroke,
            colors: palette,
            ...markCommon(inter),
          } as SeriesOptions,
          inter,
        );
        for (const k of kids) {
          if (kindOf(k) === 'scatterAnnotation') {
            const a = k.props as unknown as ScatterAnnotationProps;
            scatterLabels.push({ markIndex: index, field: a.textKey ?? metric, position: a.anchor ?? a.position });
          } else if (kindOf(k) === 'scatterPath') {
            const a = k.props as unknown as ScatterPathProps;
            scatterPaths.push({ markIndex: index, groupBy: a.groupBy, order: a.order, color: a.color ?? 'gray-500', width: a.pathWidth, opacity: a.opacity ?? 0.5, lineType: a.lineType });
          }
        }
        trendsOf(kids, [index]);
        break;
      }
      case 'donut': {
        const p = el.props as DonutProps;
        const inter = collectInteraction(el, 'pie');
        const { kids } = inter;
        const summary = kids.find((k) => kindOf(k) === 'donutSummary')?.props as DonutSummaryProps | undefined;
        // Boolean donuts (one value against the rest) never label their segments.
        const seg = p.isBoolean ? undefined : (kids.find((k) => kindOf(k) === 'segmentLabel')?.props as SegmentLabelProps | undefined);
        const metric = p.metric ?? 'value';
        const total = props.data.reduce((a, d) => a + (Number(d[metric]) || 0), 0);
        const semi = p.variant === 'semicircle';
        pushSeries(
          {
            id: p.name,
            type: 'pie',
            metric,
            dimension: p.color ?? 'series',
            innerRadius: `${(p.holeRatio ?? 0.85) * 100}%`,
            // Room for the labels outside the ring.
            outerRadius: seg ? '74%' : undefined,
            startAngle: semi ? -90 : ((p.startAngle ?? 0) * 180) / Math.PI,
            endAngle: semi ? 90 : ((p.startAngle ?? 0) * 180) / Math.PI + 360,
            cy: semi ? '80%' : undefined,
            sortingValues: p.sortOrder === 'valueDescending' ? 'desc' : 'none',
            paddingAngle: 0,
            arcLabel: seg ? 'label' : undefined,
            arcLabelField: seg?.labelKey,
            arcLabelSecondary: seg ? (seg.percent ? 'percent' : seg.value ? 'formattedValue' : undefined) : undefined,
            arcLabelPosition: 'outside',
            arcLabelMinAngle: 6,
            percentFormat: seg?.percentFormat,
            numberFormat: seg?.valueFormat,
            centerLabel:
              summary && !summary.hideValue
                ? p.isBoolean
                  ? f.number((Number(props.data[0]?.[metric]) || 0) / (total || 1), '.0%')
                  : f.number(total, summary.numberFormat ?? 'shortNumber')
                : undefined,
            centerSubLabel: summary?.label,
            colors: palette,
            ...markCommon(inter),
          } as SeriesOptions,
          inter,
        );
        break;
      }
      case 'bullet': {
        const p = el.props as BulletProps;
        const inter = collectInteraction(el, 'bullet');
        pushSeries(
          {
            type: 'bullet',
            dimension: p.dimension ?? 'graphLabel',
            metric: p.metric ?? 'currentAmount',
            targetField: p.target ?? 'target',
            // Legacy defaults: one shared scale, labels on top, no track behind thresholds.
            scaleType: p.scaleType ?? 'normal',
            maxScaleValue: p.maxScaleValue,
            color: p.color ?? 'static-blue',
            numberFormat: p.numberFormat,
            thresholds: p.thresholds,
            showTarget: p.showTarget,
            showTargetValue: p.showTargetValue,
            thresholdBarColor: p.thresholdBarColor,
            direction: p.direction,
            labelPosition: p.labelPosition ?? 'top',
            track: p.track ?? false,
          } as SeriesOptions,
          inter,
        );
        break;
      }
      case 'venn': {
        const p = el.props as VennProps;
        const inter = collectInteraction(el, 'venn');
        const key = p.setsKey ?? 'sets';
        const metric = p.metric ?? 'size';
        const labelKey = p.label ?? 'label';
        pushSeries(
          {
            type: 'venn',
            orientation: p.orientation,
            sets: props.data.map((d) => ({ sets: d[key] as string[], size: Number(d[metric]), label: d[labelKey] !== undefined && d[labelKey] !== null ? String(d[labelKey]) : undefined })),
          } as SeriesOptions,
          inter,
        );
        legend = legend || { position: 'bottom', toggleable: true };
        break;
      }
      case 'combo': {
        const p = el.props as { dimension?: string };
        for (const k of childrenOf(el)) handle(k, p.dimension ?? 'datetime');
        break;
      }
      case 'axis': {
        const p = el.props as unknown as AxisProps;
        const isX = p.position === 'bottom' || p.position === 'top';
        const list = isX ? xAxis : yAxis;
        const id = p.name ?? (list.length === 0 ? (isX ? 'x' : 'y') : `${isX ? 'x' : 'y'}${list.length}`);
        const axis = {
          id,
          position: p.position,
          label: p.title,
          grid: p.grid,
          disableTicks: !p.ticks,
          // The axis line is opt-in, as in the legacy library.
          disableLine: !p.baseline,
          labelFormat: p.labelFormat,
          granularity: p.granularity,
          numberFormat: p.numberFormat ?? 'shortNumber',
          currencyCode: p.currencyCode,
          currencyLocale: p.currencyLocale,
          tickLabelAngle: p.labelOrientation === 'vertical' ? -90 : undefined,
          labelAlign: p.labelAlign,
          labelFontWeight: p.labelFontWeight,
          labelLimit: p.labelLimit ?? (p.truncateLabels ? 'band' : undefined),
          labels: p.labels,
          subLabels: p.subLabels,
          min: p.range?.[0],
          max: p.range?.[1],
          maxTicks: p.tickCountLimit,
          minTicks: p.tickCountMinimum,
          tickMinStep: p.tickMinStep,
          hideTickLabels: p.hideDefaultLabels,
          zoom: p.zoom,
          groups: p.groups,
        } as AxisOptions;
        list.push(axis);
        if (p.hasTooltip || p.onClick) axisLabels.set(id, { hasTooltip: p.hasTooltip, onClick: p.onClick });
        axisKids.push({ axis, kids: childrenOf(el) });
        for (const k of childrenOf(el)) {
          if (kindOf(k) !== 'referenceLine') continue;
          const r = k.props as unknown as ReferenceLineProps;
          const placement = r.labelPosition ?? 'axis';
          refs.push({
            [isX ? 'x' : 'y']: r.value,
            axisId: id,
            color: r.color,
            lineType: r.lineType,
            label: r.label,
            labelAlign: placement === 'start' ? 'start' : 'end',
            labelPlacement: placement === 'axis' ? 'axis' : 'plot',
            labelColor: r.labelColor ?? 'gray-800',
            labelFontWeight: r.labelFontWeight,
            bandPosition: r.position,
            layer: r.layer,
          } as ReferenceLineOptions);
        }
        break;
      }
      case 'legend': {
        const p = el.props as LegendProps;
        legendProps = p;
        const cut = (s: string, n?: number) => (n && s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);
        legend = {
          position: p.position ?? 'bottom',
          align: p.align,
          title: p.title,
          toggleable: !!p.isToggleable,
          clickable: !!p.onClick,
          highlight: !!p.highlight,
          labels: p.legendLabels ? Object.fromEntries(p.legendLabels.map((l) => [l.seriesName, cut(l.label, l.maxLength)])) : undefined,
          hiddenEntries: p.hiddenEntries,
          descriptions: p.descriptions ? Object.fromEntries(p.descriptions.map((d) => [d.seriesName, d.title ? `${d.title}: ${d.description}` : d.description])) : undefined,
          labelLimit: p.labelLimit,
          titleLimit: p.titleLimit,
        };
        break;
      }
      case 'toolbar': {
        toolbar = el.props as ToolbarOptions;
        break;
      }
      case 'title': {
        const p = el.props as unknown as TitleProps;
        title = { text: p.text, align: p.position ?? 'middle', fontWeight: p.fontWeight };
        break;
      }
      case 'bigNumber': {
        const p = el.props as unknown as BigNumberProps;
        const line = childrenOf(el).find((k) => kindOf(k) === 'line')?.props as LineProps | undefined;
        bigNumber = { props: p, sparkline: line };
        break;
      }
      default:
        break;
    }
  };
  for (const el of els) handle(el);

  // Axis children that need the chart's dimension (thumbnails, groups, annotations).
  for (const { axis, kids } of axisKids) {
    for (const k of kids) {
      const kind = kindOf(k);
      if (kind === 'axisThumbnail') {
        const t = k.props as unknown as AxisThumbnailProps;
        const dim = t.dimension ?? firstDimension ?? 'category';
        const urlKey = t.urlKey ?? 'thumbnail';
        const urls = new Map(props.data.map((d) => [String(d[dim]), d[urlKey] as string | undefined]));
        axis.thumbnails = { url: (v) => (t.getUrl ? t.getUrl(v) : urls.get(String(v))), size: t.size, radius: t.radius, hideLabel: t.hideLabel };
      } else if (kind === 'axisGroup') {
        const g = k.props as unknown as AxisGroupProps;
        const dim = g.dimension ?? firstDimension ?? 'category';
        const groupOf = new Map(props.data.map((d) => [String(d[dim]), d[g.dataKey] as string | number | undefined]));
        axis.groups = [...(axis.groups ?? []), { getValue: (v) => groupOf.get(String(v)) }];
      } else if (kind === 'axisAnnotation') {
        const a = k.props as unknown as AxisAnnotationProps;
        const dim = a.dimension ?? firstDimension ?? 'datetime';
        const list: AxisAnnotationSpec[] = [...(a.annotations ?? [])];
        if (a.dataKey)
          for (const d of props.data) {
            const v = d[a.dataKey];
            if (v === undefined || v === null || v === '') continue;
            for (const text of Array.isArray(v) ? v : [v]) list.push({ value: d[dim] as never, label: String(text), color: a.color, icon: a.icon });
          }
        axis.annotations = [...(axis.annotations ?? []), ...list.map((x) => ({ color: a.color, icon: a.icon, ...x }))];
        axis.annotationFormat = a.format ?? axis.annotationFormat;
      }
    }
  }

  // The legacy model hides axes that are not declared.
  const hasCartesian = series.some((s) => s.type !== 'pie' && s.type !== 'bullet' && s.type !== 'venn');
  if (hasCartesian) {
    const dimAxisIsX = !horizontalBars;
    if (xAxis.length === 0) xAxis.push({ id: 'x', position: 'none' });
    if (yAxis.length === 0) yAxis.push({ id: 'y', position: 'none' });
    const anyBar = series.some((s) => s.type === 'bar');
    const dimAxis = dimAxisIsX ? xAxis[0] : yAxis[0];
    if (anyBar) {
      dimAxis.scaleType = 'band';
      dimAxis.categoryGapRatio = barGap;
      // The engine spaces dodged bars relative to their width; the legacy padding is a share of the slot.
      if (barGroupGap !== undefined) dimAxis.barGapRatio = barGroupGap / Math.max(0.01, 1 - barGroupGap);
      if (barOuter !== undefined) (dimAxis as { categoryOuterGapRatio?: number }).categoryOuterGapRatio = barOuter;
      const numeric = series.some((s) => s.type === 'bar' && s.dimension && props.data.some((d) => typeof d[s.dimension!] === 'number'));
      // Numeric (epoch) categories default to time labels.
      if (!dimAxis.labelFormat && (timeCategories || (numeric && series.some((s) => s.dimension === 'datetime')))) dimAxis.labelFormat = 'time';
    } else if (lineScale) {
      dimAxis.scaleType = lineScale;
    } else if (series.some((s) => s.type === 'scatter')) {
      dimAxis.scaleType = 'linear';
    }
    // Secondary metric axes bind to named axes.
    for (const a of xAxis.slice(1)) a.position ??= 'top';
    for (const a of yAxis.slice(1)) a.position ??= 'right';
    // Dual metric axis: the secondary series use the first right (or top) metric axis, created when missing.
    for (const s of dualAxis) {
      const horizontal = (s as { __horizontal?: boolean }).__horizontal;
      delete (s as { __horizontal?: boolean }).__horizontal;
      const list = horizontal ? xAxis : yAxis;
      const side = horizontal ? 'top' : 'right';
      let axis = list.find((a, i) => i > 0 && a.position === side) ?? list[1];
      if (!axis) {
        axis = { id: horizontal ? 'xDual' : 'yDual', position: side, numberFormat: list[0]?.numberFormat, disableLine: true, disableTicks: true };
        list.push(axis);
      }
      if (horizontal) s.xAxisId = axis.id;
      else s.yAxisId = axis.id;
    }
  }

  // Series ids follow the legacy model: a split mark's series are named by their facet value. A
  // prefix is only needed when two marks of the same type would produce the same names.
  const namesOf = (s: SeriesOptions) => {
    const fields = s.groupBy ? (Array.isArray(s.groupBy) ? s.groupBy : [s.groupBy]) : [];
    return fields.length ? groupsOf((s.data as Datum[] | undefined) ?? props.data, fields) : null;
  };
  const taken = new Map<string, Set<string>>();
  series.forEach((s, i) => {
    const names = namesOf(s);
    if (!names) {
      s.id ??= `${s.type}${i}`;
      return;
    }
    const used = taken.get(s.type) ?? new Set<string>();
    taken.set(s.type, used);
    const clash = names.some((n) => used.has(n));
    names.forEach((n) => used.add(n));
    if (clash) s.id ??= `${s.type}${i}`;
    else delete s.id;
  });
  // Marks without a ChartTooltip show none when another mark has one.
  if (tooltip) series.forEach((s, i) => (s.disableTooltip = !interactions[i].tooltip?.children));
  // Forecast series stay out of the legend (they share their line's names).
  const forecastIds = series.filter((s) => typeof s.id === 'string' && s.id.endsWith('-forecast')).map((s) => s.id!);
  if (legend && forecastIds.length) {
    const ids = forecastIds.flatMap((id) => {
      const s = series.find((x) => x.id === id)!;
      const names = namesOf(s);
      // The engine prefixes group names with the id only when there are several groups.
      return names && names.length > 1 ? names.map((n) => `${id}:${n}`) : [id];
    });
    const l = legend as LegendOptions;
    l.hiddenEntries = [...(l.hiddenEntries ?? []), ...ids];
  }

  const panel = props.__panel;
  if (panel && hasCartesian) {
    const valueAxis = horizontalBars ? xAxis[0] : yAxis[0];
    const dimAxis = horizontalBars ? yAxis[0] : xAxis[0];
    if (panel.valueRange && valueAxis) {
      valueAxis.min = panel.valueRange[0];
      valueAxis.max = panel.valueRange[1];
    }
    if (panel.dimRange && dimAxis && series.every((s) => s.type === 'scatter')) {
      dimAxis.min = panel.dimRange[0];
      dimAxis.max = panel.dimRange[1];
    }
    if (panel.hideLegend) legend = false;
  }

  const types = [...new Set(series.map((s) => s.type))].map((t) => ALL[t]).filter(Boolean);
  const anyInteraction = interactions.some((i) => i.tooltip || i.popover || i.onClick || i.actionBar || i.onMouseOver);
  const padding = typeof props.padding === 'number' ? { top: props.padding, right: props.padding, bottom: props.padding, left: props.padding } : props.padding;
  const hi = props.highlightedItem;
  const options: ChartOptions = {
    data: props.data,
    series,
    xAxis: hasCartesian ? xAxis : undefined,
    yAxis: hasCartesian ? yAxis : undefined,
    legend,
    tooltip: tooltip || false,
    referenceLines: refs,
    trendlines,
    title,
    description: props.description,
    colors: palette,
    colorScheme: props.colorScheme,
    backgroundColor: props.backgroundColor ? rgbaToCss(resolveColor(props.backgroundColor, scheme)) : undefined,
    locale: props.locale as never,
    idKey: props.idKey,
    margin: padding,
    animation: props.animations === false ? false : undefined,
    hiddenSeries: props.hiddenSeries,
    defaultHiddenSeries: legendProps?.defaultHiddenSeries,
    highlightedItem:
      hi !== undefined && (hi === null || typeof hi === 'object') && !Array.isArray(hi)
        ? hi
        : hi === undefined && props.highlightedSeries !== undefined
          ? { seriesId: String(props.highlightedSeries) }
          : undefined,
    highlightedId: Array.isArray(hi) ? (hi[0] ?? null) : typeof hi === 'string' || typeof hi === 'number' ? hi : undefined,
    highlightScope: anyInteraction ? undefined : { highlight: 'item', fade: 'none' },
    loading: props.loading,
    noDataText: props.emptyStateText,
    grid: { horizontal: false, vertical: false },
    onLegendClick: legendProps?.onClick,
    onLegendHover: legendProps?.onMouseOver || legendProps?.onMouseOut ? legendHover(legendProps) : undefined,
    pointAnnotations: pointAnnotations.length ? pointAnnotations : undefined,
    scatterLabels: scatterLabels.length ? scatterLabels : undefined,
    scatterPaths: scatterPaths.length ? scatterPaths : undefined,
    directLabels,
    toolbar,
    marquee: props.marquee,
  };
  // Grid comes from Axis `grid` props in this model.
  options.grid = {
    horizontal: yAxis.some((a) => a.grid),
    vertical: xAxis.some((a) => a.grid),
  };
  return { options, types, interactions, bigNumber, axisLabels };
}

/** Legend hover in the legacy shape: over(name) on enter, out(name) on leave. */
function legendHover(p: LegendProps) {
  let current: string | null = null;
  return (id: string | null) => {
    if (current !== null && current !== id) p.onMouseOut?.(current);
    if (id !== null && id !== current) p.onMouseOver?.(id);
    current = id;
  };
}

interface PopoverState {
  datum: Datum;
  seriesId: string;
  dataIndex: number;
  x: number;
  y: number;
  config: ChartPopoverProps;
}

/**
 * Composable chart: declare marks, axes, legends and tooltips as children.
 *
 * ```tsx
 * <Chart data={rows} height={360}>
 *   <Axis position="bottom" title="Browser" />
 *   <Axis position="left" grid title="Downloads" />
 *   <Bar dimension="browser" metric="downloads" color="os">
 *     <ChartTooltip>{(d) => <b>{String(d.downloads)}</b>}</ChartTooltip>
 *   </Bar>
 *   <Legend isToggleable highlight />
 * </Chart>
 * ```
 */
export const Chart = /*#__PURE__*/ forwardRef<ChartHandle, ChartProps>(function Chart(props, ref) {
  const trellis = props.__panel ? null : findTrellis(props.children);
  if (trellis) return <TrellisView props={props} spec={trellis} />;
  return <SingleChart {...props} forwardedRef={ref} />;
});

interface TrellisSpec {
  kind: string;
  field: string;
  orientation: 'horizontal' | 'vertical';
  columns?: number;
  padding: number;
  dimension?: string;
  metric?: string;
  stacked: boolean;
  /** Field that splits series by color (for the shared legend). */
  colorField?: string;
  legend: boolean;
}

function findTrellis(children: ReactNode): TrellisSpec | null {
  for (const el of flatten(children)) {
    const kind = kindOf(el);
    const p = el.props as {
      trellis?: string;
      trellisOrientation?: 'horizontal' | 'vertical';
      trellisColumns?: number;
      trellisPadding?: number;
      dimension?: string;
      metric?: string;
      type?: string;
      metricStart?: string;
      color?: unknown;
    };
    if ((kind === 'bar' || kind === 'line' || kind === 'area' || kind === 'scatter') && p.trellis)
      return {
        colorField: typeof p.color === 'string' ? p.color : kind === 'area' ? 'series' : undefined,
        legend: flatten(children).some((k) => kindOf(k) === 'legend'),
        kind,
        field: p.trellis,
        orientation: p.trellisOrientation ?? 'horizontal',
        columns: p.trellisColumns,
        padding: p.trellisPadding ?? 0.04,
        dimension: p.dimension,
        metric: p.metric,
        stacked: (kind === 'bar' && (p.type ?? 'stacked') === 'stacked') || (kind === 'area' && !p.metricStart),
      };
  }
  return null;
}

/** Small multiples: one panel per value of the trellis key, sharing the value scale. */
function TrellisView({ props, spec }: { props: ChartProps; spec: TrellisSpec }) {
  const facets = facetBy(props.data, spec.field);
  const metric = spec.metric ?? 'value';
  const defaultDim = spec.kind === 'bar' ? 'category' : spec.kind === 'scatter' ? 'x' : 'datetime';
  const dimension = spec.dimension ?? defaultDim;
  const valueRange = niceExtent(sharedExtent(props.data, metric, { stackBy: spec.stacked ? [spec.field, dimension] : undefined, includeZero: spec.kind !== 'scatter' }));
  const dimRange = spec.kind === 'scatter' ? niceExtent(sharedExtent(props.data, dimension, { includeZero: false })) : undefined;
  const cols = spec.columns ?? (spec.orientation === 'vertical' ? 1 : facets.length);
  const rows = Math.max(1, Math.ceil(facets.length / cols));
  const total = typeof props.height === 'number' ? props.height : 300;
  const titleH = 22;
  const panelH = spec.orientation === 'vertical' && !spec.columns ? Math.max(80, total / rows - titleH) : total;
  const gap = `${Math.round(spec.padding * 100 * 3)}px`;
  // Colors are assigned from one global group order so a group keeps its color in every panel.
  const cf = spec.colorField && props.data.some((d) => spec.colorField! in d) ? spec.colorField : undefined;
  const groups = cf ? [...new Set(props.data.map((d) => String(d[cf])))] : [];
  const basePalette = resolvePalette((Array.isArray(props.colors) && Array.isArray(props.colors[0]) ? props.colors[0] : props.colors) as never, props.colorScheme ?? 'light');
  const colorOf = (g: string) => basePalette[groups.indexOf(g) % basePalette.length];
  const [hidden, setHidden] = useState<string[]>([]);
  const dark = props.colorScheme === 'dark';
  return (
    <div
      role="group"
      aria-label={props.title ?? `Small multiples by ${spec.field}`}
      className={props.className}
      style={{ width: typeof props.width === 'number' ? props.width : (props.width ?? '100%'), ...props.style }}
    >
      {props.title && (
        <div style={{ font: '700 16px Inter, system-ui, sans-serif', marginBottom: 6, textAlign: 'center', color: props.colorScheme === 'dark' ? '#f2f2f5' : '#1d1d1f' }}>{props.title}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
        {facets.map((f) => {
          const present = cf ? groups.filter((g) => f.rows.some((r) => String(r[cf]) === g)) : [];
          const rows = cf ? [...f.rows].sort((a, b) => groups.indexOf(String(a[cf])) - groups.indexOf(String(b[cf]))) : f.rows;
          return (
            <div key={f.key} style={{ minWidth: 0 }}>
              <div
                style={{
                  font: '600 12px Inter, system-ui, sans-serif',
                  height: titleH,
                  lineHeight: `${titleH}px`,
                  color: dark ? '#c9c9d1' : '#4b4b55',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {String(f.value)}
              </div>
              <Chart
                {...props}
                title={undefined}
                className={undefined}
                style={undefined}
                width="100%"
                height={panelH}
                data={rows}
                colors={cf ? present.map(colorOf) : props.colors}
                hiddenSeries={cf ? hidden : props.hiddenSeries}
                __panel={{ valueRange, dimRange, hideLegend: true }}
              />
            </div>
          );
        })}
      </div>
      {spec.legend && cf && (
        <div role="group" aria-label="Legend" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
          {groups.map((g) => {
            const off = hidden.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={!off}
                onClick={() => setHidden((h) => (off ? h.filter((x) => x !== g) : h.length + 1 >= groups.length ? h : [...h, g]))}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 6,
                  font: '13px Inter, system-ui, sans-serif',
                  color: dark ? '#f2f2f5' : '#1d1d1f',
                  opacity: off ? 0.4 : 1,
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: 3, background: colorOf(g) }} />
                {g}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ActionBarState {
  datum: Datum;
  seriesId: string;
  dataIndex: number;
  x: number;
  y: number;
  config: ChartActionBarProps;
}

/** Popover box kept inside the chart (with `containerPadding`), above the mark or flipped below it. */
function PopoverBox({ state, onClose }: { state: PopoverState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const c = state.config;
  const pad = c.containerPadding ?? 12;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.offsetParent as HTMLElement | null;
    if (!el || !host) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const W = host.clientWidth;
    const H = host.clientHeight;
    let top = state.y - h - 12;
    if (top < pad) top = Math.min(H - h - pad, state.y + 12);
    const left = Math.max(pad, Math.min(W - w - pad, state.x - w / 2));
    setPos({ left, top: Math.max(pad, top) });
  }, [state, pad]);
  const size = (v: number | 'auto' | undefined) => (v === 'auto' ? 'auto' : v);
  return (
    <div
      ref={ref}
      className="rgl-popover"
      role="dialog"
      style={{
        position: 'absolute',
        left: pos?.left ?? state.x,
        top: pos?.top ?? state.y,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 6,
        boxSizing: 'border-box',
        width: size(c.width ?? 250),
        minWidth: c.minWidth,
        maxWidth: c.maxWidth,
        height: size(c.height),
        minHeight: c.minHeight,
        maxHeight: c.maxHeight,
        overflow: 'auto',
        background: 'var(--rgl-tooltip-bg)',
        color: 'var(--rgl-tooltip-text)',
        border: '1px solid var(--rgl-tooltip-border)',
        borderRadius: 10,
        padding: c.contentMargin ?? 12,
        boxShadow: '0 10px 30px rgba(0,0,0,.18)',
      }}
    >
      {c.children?.(state.datum, onClose)}
    </div>
  );
}

const SingleChart = function SingleChart({ forwardedRef: ref, ...props }: ChartProps & { forwardedRef: React.ForwardedRef<ChartHandle> }) {
  const compiled = useMemo(() => compile(props), [props]);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [actionBar, setActionBar] = useState<ActionBarState | null>(null);
  const engine = useRef<EngineChart | null>(null);
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hovered = useRef<{ markIndex: number; dataIndex?: number; datum: Datum } | null>(null);
  const { interactions } = compiled;

  useEffect(() => {
    if (!popover) return;
    const close = (e: KeyboardEvent | PointerEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && (e.target as HTMLElement)?.closest?.('.rgl-popover')) return;
      setPopover(null);
      popover.config.onOpenChange?.(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close, true);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close, true);
    };
  }, [popover]);

  useEffect(() => {
    if (!actionBar) return;
    const close = (e: KeyboardEvent | PointerEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && (e.target as HTMLElement)?.closest?.('.rgl-action-bar')) return;
      setActionBar(null);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close, true);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close, true);
    };
  }, [actionBar]);

  if (compiled.bigNumber) return <BigNumberView data={props.data} spec={compiled.bigNumber} locale={props.locale} colorScheme={props.colorScheme} />;

  /** Where a dialog for an item opens: on the mark (as in the legacy library), else at the pointer. */
  const anchorFor = (seriesId: string, dataIndex: number, event: Event) => {
    const anchor = engine.current?.anchorOf(seriesId, dataIndex);
    if (anchor) return anchor;
    const host = engine.current?.plotEl.getBoundingClientRect();
    const pe = event as MouseEvent;
    return host && typeof pe.clientX === 'number' ? { x: pe.clientX - host.left, y: pe.clientY - host.top } : lastPointer.current;
  };
  const openPopover = (item: { seriesId: string; dataIndex?: number; datum?: Datum }, config: ChartPopoverProps, event: Event) => {
    const dataIndex = item.dataIndex ?? 0;
    setPopover({ datum: item.datum ?? {}, seriesId: item.seriesId, dataIndex, ...anchorFor(item.seriesId, dataIndex, event), config });
    config.onOpenChange?.(true);
  };

  // The selected mark stays highlighted while its popover or action bar is open.
  const held: ItemIdentifier | undefined = actionBar
    ? { seriesId: actionBar.seriesId, dataIndex: actionBar.dataIndex }
    : popover
      ? popover.config.UNSAFE_highlightBy === 'series'
        ? { seriesId: popover.seriesId }
        : { seriesId: popover.seriesId, dataIndex: popover.dataIndex }
      : undefined;
  const baseTooltip = compiled.options.tooltip;
  const options: ChartOptions = {
    ...compiled.options,
    highlightedItem: held ?? compiled.options.highlightedItem,
    // No tooltip over an open popover.
    tooltip: baseTooltip && typeof baseTooltip === 'object' ? { ...baseTooltip, filter: () => !popover } : baseTooltip,
    onItemClick: (item, event) => {
      const mark = interactions[item.markIndex ?? -1];
      if (!mark) return;
      const datum = item.datum ?? {};
      mark.onClick?.(datum);
      if (mark.actionBar && item.dataIndex !== undefined) {
        setActionBar({ datum, seriesId: item.seriesId, dataIndex: item.dataIndex, ...anchorFor(item.seriesId, item.dataIndex, event), config: mark.actionBar });
        return;
      }
      if (mark.popover && !mark.popover.rightClick) openPopover(item, mark.popover, event);
    },
    onItemContextMenu: (item, event) => {
      const mark = interactions[item.markIndex ?? -1];
      if (!mark) return;
      mark.onContextMenu?.(event, item.datum ?? {});
      if (mark.popover?.rightClick) openPopover(item, mark.popover, event);
    },
    onItemHover: (item) => {
      const prev = hovered.current;
      const same = prev && item && prev.markIndex === item.markIndex && prev.dataIndex === item.dataIndex;
      if (same) return;
      if (prev) interactions[prev.markIndex]?.onMouseOut?.(prev.datum);
      hovered.current = item && item.markIndex !== undefined ? { markIndex: item.markIndex, dataIndex: item.dataIndex, datum: item.datum ?? {} } : null;
      if (hovered.current) interactions[hovered.current.markIndex]?.onMouseOver?.(hovered.current.datum);
    },
  };
  if (compiled.axisLabels.size) {
    if ([...compiled.axisLabels.values()].some((h) => h.onClick)) options.onAxisLabelClick = (axisId, value, index) => compiled.axisLabels.get(axisId)?.onClick?.(value, index);
    options.axisLabelTooltips = [...compiled.axisLabels].filter(([, h]) => h.hasTooltip).map(([id]) => id);
  }

  const renderTooltip = interactions.some((i) => i.tooltip?.children)
    ? (ctx: TooltipContext) => {
        if (popover) return null;
        const item = ctx.items[0];
        if (!item) return null;
        const spec = interactions[item.markIndex ?? -1]?.tooltip ?? interactions.find((i) => i.tooltip?.children)?.tooltip;
        if (!spec?.children) return null;
        const datum = { ...(item.datum ?? {}) } as Datum;
        if (ctx.trigger === 'axis') (datum as Record<string, unknown>).rscGroupData = ctx.items.map((i) => i.datum);
        return <div className="rgl-tooltip-custom">{spec.children(datum)}</div>;
      }
    : undefined;

  const actionOverlay = actionBar ? (
    <div
      className="rgl-action-bar"
      role="toolbar"
      aria-label="Actions"
      style={{
        position: 'absolute',
        left: actionBar.x,
        top: actionBar.y,
        transform: 'translate(-50%, calc(-100% - 10px))',
        zIndex: 7,
        display: 'flex',
        gap: 2,
        padding: 3,
        background: 'var(--rgl-tooltip-bg)',
        color: 'var(--rgl-tooltip-text)',
        border: '1px solid var(--rgl-tooltip-border)',
        borderRadius: 9,
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        whiteSpace: 'nowrap',
      }}
    >
      {actionBar.config.actions.map((a) => (
        <button
          key={a.label}
          type="button"
          className="rgl-action"
          onClick={() => {
            a.onAction(actionBar.datum);
            setActionBar(null);
          }}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6, font: '500 12px var(--rgl-font)' }}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  ) : null;

  const overlay = popover ? (
    <PopoverBox
      state={popover}
      onClose={() => {
        setPopover(null);
        popover.config.onOpenChange?.(false);
      }}
    />
  ) : null;

  return (
    <GLChart
      ref={ref}
      options={options}
      seriesTypes={compiled.types}
      width={props.width}
      height={props.height ?? 300}
      minWidth={props.minWidth ?? 100}
      maxWidth={props.maxWidth}
      minHeight={props.minHeight ?? 100}
      maxHeight={props.maxHeight}
      className={props.className}
      style={props.style}
      renderTooltip={renderTooltip}
      overlay={overlay ?? actionOverlay}
      onReady={(c) => {
        engine.current = c;
        props.onReady?.(c);
      }}
      onBackend={props.onBackend}
      dataTestId={props.dataTestId}
    />
  );
};

function BigNumberView({ data, spec, locale, colorScheme }: { data: Datum[]; spec: NonNullable<Compiled['bigNumber']>; locale?: ChartProps['locale']; colorScheme?: 'light' | 'dark' }) {
  const p = spec.props;
  const values = data.map((d) => Number(d[p.dataKey])).filter(Number.isFinite);
  const method = p.method ?? 'last';
  const v = values.length === 0 ? null : method === 'sum' ? values.reduce((a, b) => a + b, 0) : method === 'avg' ? values.reduce((a, b) => a + b, 0) / values.length : values[values.length - 1];
  const f = getFormatter(locale as never);
  const horizontal = p.orientation === 'horizontal';
  const text = colorScheme === 'dark' ? '#f2f2f5' : '#1d1d1f';
  const format = p.numberFormat ?? (p.numberType === 'percentage' ? '.0%' : 'standardNumber');
  return (
    <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: horizontal ? 'center' : 'flex-start', gap: 12, color: text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {p.icon}
      <div>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{v === null ? '–' : f.number(v, format)}</div>
        <div style={{ fontSize: 14, opacity: 0.72 }}>{p.label}</div>
      </div>
      {spec.sparkline && (
        <div style={{ width: horizontal ? 160 : '100%', minWidth: 120 }}>
          <SparkLineChart data={data.map((d) => Number(d[spec.sparkline!.metric ?? p.dataKey]))} height={48} area colorScheme={colorScheme} />
        </div>
      )}
    </div>
  );
}

/** @internal Exposed for tests. */
export const __compile = compile;
