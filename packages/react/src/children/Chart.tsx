import { Children, forwardRef, isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  areaSeries,
  barSeries,
  facetBy,
  niceExtent,
  resolvePalette,
  sharedExtent,
  type AxisAnnotation as AxisAnnotationSpec,
  type Chart as EngineChart,
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
  type AreaProps,
  type AxisProps,
  type BarProps,
  type BigNumberProps,
  type AxisAnnotationProps,
  type AxisGroupProps,
  type AxisThumbnailProps,
  type ChartActionBarProps,
  type LinePointAnnotationProps,
  type ScatterAnnotationProps,
  type ScatterPathProps,
  type ChartPopoverProps,
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

export interface ChartProps {
  data: Datum[];
  children?: ReactNode;
  width?: ChartSize;
  height?: ChartSize;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  colors?: PaletteInput | PaletteInput[];
  colorScheme?: 'light' | 'dark';
  backgroundColor?: string;
  lineTypes?: LineType[];
  padding?: number;
  title?: string;
  description?: string;
  locale?: string;
  hiddenSeries?: string[];
  highlightedSeries?: string | number;
  highlightedItem?: ItemIdentifier | null;
  loading?: boolean;
  emptyStateText?: string;
  animations?: boolean;
  tooltipAnchor?: 'cursor' | 'mark';
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  style?: CSSProperties;
  onBackend?: (backend: string) => void;
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
const facetValue = <T,>(f: unknown): T | undefined => (f && typeof f === 'object' && 'value' in (f as object) ? ((f as { value: T }).value) : undefined);
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

interface MarkInteraction {
  tooltip?: ChartTooltipProps;
  popover?: ChartPopoverProps;
  actionBar?: ChartActionBarProps;
  onClick?: (datum: Datum) => void;
  onContextMenu?: (event: MouseEvent, datum: Datum) => void;
  seriesType: string;
}

interface Compiled {
  options: ChartOptions;
  types: SeriesDefinition<any>[];
  interactions: MarkInteraction[];
  bigNumber?: { props: BigNumberProps; sparkline?: LineProps };
}

/** Compiles the children tree into an engine spec. */
function compile(props: ChartProps): Compiled {
  const els = flatten(props.children);
  const series: SeriesOptions[] = [];
  const xAxis: AxisOptions[] = [];
  const yAxis: AxisOptions[] = [];
  const refs: ReferenceLineOptions[] = [];
  const trendlines: TrendlineOptions[] = [];
  const trendsOf = (el: El) =>
    childrenOf(el)
      .filter((k) => kindOf(k) === 'trendline')
      .forEach((k) => {
        const t = k.props as TrendlineProps;
        trendlines.push({ method: t.method ?? 'linear', color: t.color, lineType: t.lineType ?? 'dashed', lineWidth: t.lineWidth, opacity: t.opacity, extend: t.dimensionExtent === 'domain' });
      });
  const interactions: MarkInteraction[] = [];
  let legend: LegendOptions | false = false;
  let onLegendClick: ((s: string) => void) | undefined;
  let title: ChartOptions['title'] = props.title;
  let tooltip: TooltipOptions | false = false;
  let bigNumber: Compiled['bigNumber'];
  const palette = Array.isArray(props.colors) && Array.isArray(props.colors[0]) ? (props.colors[0] as PaletteInput) : (props.colors as PaletteInput | undefined);
  let horizontalBars = false;
  let lineScale: 'time' | 'linear' | 'point' | undefined;
  let barGap: number | undefined;

  const childrenOf = (el: El) => flatten(el.props.children as ReactNode);
  const collectInteraction = (el: El, seriesType: string) => {
    const kids = childrenOf(el);
    const t = kids.find((k) => kindOf(k) === 'tooltip')?.props as ChartTooltipProps | undefined;
    const pop = kids.find((k) => kindOf(k) === 'popover')?.props as ChartPopoverProps | undefined;
    const bar = kids.find((k) => kindOf(k) === 'actionBar')?.props as ChartActionBarProps | undefined;
    const p = el.props as { onClick?: (d: Datum) => void; onContextMenu?: (e: MouseEvent, d: Datum) => void };
    if (t) tooltip = { trigger: t.highlightBy === 'dimension' ? 'axis' : 'item', anchor: props.tooltipAnchor === 'mark' ? 'mark' : 'pointer', placement: props.tooltipPlacement };
    interactions.push({ tooltip: t, popover: pop, actionBar: bar, onClick: p.onClick, onContextMenu: p.onContextMenu, seriesType });
    return { tooltip: t, kids };
  };

  const pointAnnotations: PointAnnotationOptions[] = [];
  const scatterLabels: ScatterLabelOptions[] = [];
  const scatterPaths: ScatterPathOptions[] = [];
  const axisKids: { axis: AxisOptions; kids: El[] }[] = [];
  let toolbar: ToolbarOptions | undefined;
  let firstDimension: string | undefined;
  /** Callouts declared as children of a mark. */
  const annotate = (el: El, sid: string, dimension: string, metric: string, colorField: string | undefined) => {
    for (const k of childrenOf(el)) {
      if (kindOf(k) !== 'linePointAnnotation') continue;
      const a = k.props as unknown as LinePointAnnotationProps;
      const group = a.series ?? (colorField ? (props.data.find((d) => colorField in d)?.[colorField] as string | undefined) : undefined);
      const rows = props.data.filter((d) => !colorField || group === undefined || String(d[colorField]) === String(group));
      const byDim = [...rows].sort((x, y) => (Number(x[dimension]) || 0) - (Number(y[dimension]) || 0));
      const byMetric = [...rows].sort((x, y) => Number(x[metric]) - Number(y[metric]));
      const row =
        a.dimensionValue === 'first' ? byDim[0] : a.dimensionValue === 'last' ? byDim[byDim.length - 1] : a.dimensionValue === 'max' ? byMetric[byMetric.length - 1] : a.dimensionValue === 'min' ? byMetric[0] : rows.find((d) => String(d[dimension]) === String(a.dimensionValue));
      if (!row) continue;
      const value = Number(row[metric]);
      pointAnnotations.push({
        x: row[dimension] as never,
        seriesId: colorField ? (group !== undefined ? String(group) : undefined) : sid,
        y: colorField && group === undefined ? value : undefined,
        label: typeof a.label === 'function' ? a.label(value) : (a.label ?? getFormatter(props.locale).number(value, 'shortNumber')),
        anchor: a.anchor,
        color: a.color,
        offset: a.offset,
      });
    }
  };

  const handle = (el: El, comboDimension?: string) => {
    switch (kindOf(el)) {
      case 'bar': {
        const p = el.props as BarProps;
        const { tooltip: t } = collectInteraction(el, 'bar');
        trendsOf(el);
        const colorField = facetField(p.color ?? 'series');
        horizontalBars ||= p.orientation === 'horizontal';
        barGap = p.paddingRatio ?? 0.4;
        const sid = p.name ?? `bar${series.length}`;
        const barGroup = colorField && props.data.some((d) => colorField in d) ? colorField : undefined;
        firstDimension ??= p.dimension ?? comboDimension ?? 'category';
        annotate(el, sid, p.dimension ?? comboDimension ?? 'category', p.metric ?? 'value', barGroup);
        series.push({
          id: sid,
          type: 'bar',
          dimension: p.dimension ?? comboDimension ?? 'category',
          metric: p.metric ?? 'value',
          groupBy: colorField && props.data.some((d) => colorField in d) ? colorField : undefined,
          color: facetValue<string>(p.color),
          colorField: p.colorOverride,
          stack: (p.type ?? 'stacked') === 'stacked' ? (p.name ?? 'stack') : undefined,
          layout: p.orientation === 'horizontal' ? 'horizontal' : 'vertical',
          borderRadius: p.hasSquareCorners ? 0 : 6,
          opacity: p.opacity,
          borderWidth: p.lineWidth,
          barLabel: p.showValues ? 'value' : undefined,
          colors: palette,
          highlightScope: t?.highlightBy === 'series' ? { highlight: 'series', fade: 'global' } : undefined,
        });
        break;
      }
      case 'line': {
        const p = el.props as LineProps;
        const { tooltip: t } = collectInteraction(el, 'line');
        trendsOf(el);
        const ranges = childrenOf(el)
          .filter((k) => kindOf(k) === 'metricRange')
          .map((k) => k.props as unknown as MetricRangeProps);
        const colorField = facetField(p.color ?? 'series');
        const ltField = typeof p.lineType === 'string' && !KNOWN_LINE_TYPES.has(p.lineType) ? p.lineType : undefined;
        const groupBy = [colorField, ltField].filter((f): f is string => !!f && props.data.some((d) => f in d));
        lineScale = p.scaleType ?? (comboDimension ? 'point' : lineScale ?? 'time');
        const sid = p.name ?? `line${series.length}`;
        firstDimension ??= p.dimension ?? comboDimension ?? 'datetime';
        annotate(el, sid, p.dimension ?? comboDimension ?? 'datetime', p.metric ?? 'value', groupBy.length ? groupBy[0] : undefined);
        series.push({
          id: sid,
          type: 'line',
          dimension: p.dimension ?? comboDimension ?? 'datetime',
          metric: p.metric ?? 'value',
          groupBy: groupBy.length ? [...new Set(groupBy)] : undefined,
          color: facetValue<string>(p.color),
          lineType: (typeof p.lineType === 'string' && KNOWN_LINE_TYPES.has(p.lineType) ? p.lineType : facetValue<LineType>(p.lineType)) as LineType | undefined,
          lineTypeField: ltField,
          lineTypes: props.lineTypes,
          lineWidth: p.lineWidth,
          opacity: p.opacity,
          curve: p.interpolate ? (CURVE[p.interpolate] ?? p.interpolate) : 'linear',
          showMark: p.staticPoint,
          markSize: p.pointSize,
          gradient: p.gradient,
          alternateField: p.alternateSegmentKey,
          metricRanges: ranges.map((r) => ({ metricStart: r.metricStart, metricEnd: r.metricEnd, color: r.color, lineType: r.lineType, rangeOpacity: r.rangeOpacity, displayOnHover: r.displayOnHover })),
          colors: palette,
          highlightScope: t?.highlightBy === 'item' ? { highlight: 'item', fade: 'global' } : { highlight: 'series', fade: 'global' },
        } as SeriesOptions);
        break;
      }
      case 'area': {
        const p = el.props as AreaProps;
        collectInteraction(el, 'area');
        const colorField = facetField(p.color ?? 'series');
        lineScale = p.scaleType ?? 'time';
        series.push({
          type: 'area',
          dimension: p.dimension ?? 'datetime',
          metric: p.metric ?? 'value',
          metricStart: p.metricStart,
          metricEnd: p.metricEnd,
          groupBy: colorField && props.data.some((d) => colorField in d) ? colorField : undefined,
          color: facetValue<string>(p.color),
          opacity: p.opacity ?? 0.8,
          curve: p.interpolate ? (CURVE[p.interpolate] ?? p.interpolate) : 'linear',
          stack: p.metricStart ? undefined : 'stack',
          colors: palette,
          highlightScope: { highlight: 'series', fade: 'global' },
        } as SeriesOptions);
        break;
      }
      case 'scatter': {
        const p = el.props as ScatterProps;
        collectInteraction(el, 'scatter');
        trendsOf(el);
        const colorField = facetField(p.color);
        const linear = p.colorScaleType === 'linear';
        firstDimension ??= p.dimension ?? 'x';
        for (const k of childrenOf(el)) {
          if (kindOf(k) === 'scatterAnnotation') {
            const a = k.props as unknown as ScatterAnnotationProps;
            scatterLabels.push({ field: a.textKey, position: a.position });
          } else if (kindOf(k) === 'scatterPath') {
            const a = k.props as unknown as ScatterPathProps;
            scatterPaths.push({ groupBy: a.groupBy, order: a.order, color: a.color, width: a.pathWidth, opacity: a.opacity, lineType: a.lineType });
          }
        }
        series.push({
          type: 'scatter',
          dimension: p.dimension ?? 'x',
          metric: p.metric ?? 'value',
          groupBy: colorField && !linear ? colorField : undefined,
          colorValueField: linear ? colorField : undefined,
          colorScheme: p.colorScheme,
          color: facetValue<string>(p.color),
          sizeField: facetField(p.size),
          markerSize: facetValue(p.size) ?? 'M',
          shape: p.symbolShape ?? 'circle',
          opacity: p.opacity,
          strokeWidth: p.lineWidth,
          colors: palette,
        } as SeriesOptions);
        break;
      }
      case 'donut': {
        const p = el.props as DonutProps;
        const { kids } = collectInteraction(el, 'pie');
        const summary = kids.find((k) => kindOf(k) === 'donutSummary')?.props as DonutSummaryProps | undefined;
        const seg = kids.find((k) => kindOf(k) === 'segmentLabel')?.props as SegmentLabelProps | undefined;
        const metric = p.metric ?? 'value';
        const f = getFormatter(props.locale);
        const total = props.data.reduce((a, d) => a + (Number(d[metric]) || 0), 0);
        const semi = p.variant === 'semicircle';
        series.push({
          type: 'pie',
          metric,
          dimension: p.color ?? 'series',
          innerRadius: `${(p.holeRatio ?? 0.85) * 100}%`,
          startAngle: semi ? -90 : ((p.startAngle ?? 0) * 180) / Math.PI,
          endAngle: semi ? 90 : ((p.startAngle ?? 0) * 180) / Math.PI + 360,
          cy: semi ? '80%' : undefined,
          sortingValues: p.sortOrder === 'valueDescending' ? 'desc' : 'none',
          paddingAngle: 0,
          arcLabel: seg ? (seg.percent ? 'percent' : seg.value ? 'formattedValue' : 'label') : undefined,
          numberFormat: seg?.valueFormat,
          centerLabel: summary && !summary.hideValue ? (p.isBoolean ? f.number((Number(props.data[0]?.[metric]) || 0) / (total || 1), '.0%') : f.number(total, summary.numberFormat ?? 'shortNumber')) : undefined,
          centerSubLabel: summary?.label,
          colors: palette,
        } as SeriesOptions);
        break;
      }
      case 'bullet': {
        const p = el.props as BulletProps;
        collectInteraction(el, 'bullet');
        series.push({
          type: 'bullet',
          dimension: p.dimension ?? 'graphLabel',
          metric: p.metric ?? 'currentAmount',
          targetField: p.target ?? 'target',
          maxValue: p.maxScaleValue,
          color: p.color,
          numberFormat: p.numberFormat,
          thresholds: p.thresholds?.map((t) => ({ value: t.thresholdMax, color: t.fill })),
        } as SeriesOptions);
        break;
      }
      case 'venn': {
        const p = el.props as VennProps;
        collectInteraction(el, 'venn');
        const key = p.setsKey ?? 'sets';
        const metric = p.metric ?? 'size';
        series.push({ type: 'venn', sets: props.data.map((d) => ({ sets: d[key] as string[], size: Number(d[metric]), label: p.label ? String(d[p.label] ?? '') : undefined })) } as SeriesOptions);
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
        list.push({
          id,
          position: p.position,
          label: Array.isArray(p.title) ? p.title.join(' ') : p.title,
          grid: p.grid,
          disableTicks: !p.ticks,
          disableLine: p.baseline === false ? true : !p.baseline && !isX,
          labelFormat: p.labelFormat,
          granularity: p.granularity,
          numberFormat: p.numberFormat,
          tickLabelAngle: p.labelOrientation === 'vertical' ? -90 : undefined,
          labelLimit: p.truncateLabels || p.labelLimit ? (p.labelLimit ?? 180) : undefined,
          min: p.range?.[0],
          max: p.range?.[1],
          tickNumber: p.tickCountLimit,
          hideTickLabels: p.hideDefaultLabels,
          zoom: p.zoom,
          groups: p.groups,
        });
        axisKids.push({ axis: list[list.length - 1], kids: childrenOf(el) });
        for (const k of childrenOf(el)) {
          if (kindOf(k) !== 'referenceLine') continue;
          const r = k.props as unknown as ReferenceLineProps;
          refs.push({ [isX ? 'x' : 'y']: r.value, axisId: id, color: r.color, lineType: r.lineType, label: r.label, labelAlign: r.labelPosition === 'start' ? 'start' : 'end', layer: r.layer } as ReferenceLineOptions);
        }
        break;
      }
      case 'legend': {
        const p = el.props as LegendProps;
        legend = {
          position: p.position ?? 'bottom',
          align: p.align,
          title: p.title,
          toggleable: !!p.isToggleable,
          highlight: !!p.highlight,
          labels: p.legendLabels ? Object.fromEntries(p.legendLabels.map((l) => [l.seriesName, l.label])) : undefined,
          hiddenEntries: p.hiddenEntries,
          descriptions: p.descriptions ? Object.fromEntries(p.descriptions.map((d) => [d.seriesName, d.description])) : undefined,
        };
        onLegendClick = p.onClick;
        break;
      }
      case 'toolbar': {
        toolbar = el.props as ToolbarOptions;
        break;
      }
      case 'title': {
        const p = el.props as unknown as TitleProps;
        title = { text: p.text, align: p.position ?? 'start' };
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
        const urls = new Map(t.urlKey ? props.data.map((d) => [String(d[dim]), d[t.urlKey!] as string | undefined]) : []);
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
  const hasCartesian = series.some((s) => s.type !== 'pie');
  if (hasCartesian) {
    const dimAxisIsX = !horizontalBars;
    if (xAxis.length === 0) xAxis.push({ id: 'x', position: 'none' });
    if (yAxis.length === 0) yAxis.push({ id: 'y', position: 'none' });
    const anyBar = series.some((s) => s.type === 'bar');
    const dimAxis = dimAxisIsX ? xAxis[0] : yAxis[0];
    if (anyBar) {
      dimAxis.scaleType = 'band';
      dimAxis.categoryGapRatio = barGap;
      if (series.some((s) => s.type === 'bar' && s.dimension && props.data.some((d) => typeof d[s.dimension!] === 'number')) && !dimAxis.labelFormat) {
        // Numeric (epoch) categories default to time labels.
        if (series.some((s) => s.dimension === 'datetime')) dimAxis.labelFormat = 'time';
      }
    } else if (lineScale) {
      dimAxis.scaleType = lineScale;
    } else if (series.some((s) => s.type === 'scatter')) {
      dimAxis.scaleType = 'linear';
    }
    // Secondary metric axes bind to named axes.
    for (const a of xAxis.slice(1)) a.position ??= 'top';
    for (const a of yAxis.slice(1)) a.position ??= 'right';
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
  const anyInteraction = interactions.some((i) => i.tooltip || i.popover || i.onClick || i.actionBar);
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
    backgroundColor: props.backgroundColor,
    locale: props.locale,
    margin: props.padding !== undefined ? { top: props.padding, right: props.padding, bottom: props.padding, left: props.padding } : undefined,
    animation: props.animations === false ? false : undefined,
    hiddenSeries: props.hiddenSeries,
    highlightedItem: props.highlightedItem !== undefined ? props.highlightedItem : props.highlightedSeries !== undefined ? { seriesId: String(props.highlightedSeries) } : undefined,
    highlightScope: anyInteraction ? undefined : { highlight: 'item', fade: 'none' },
    loading: props.loading,
    noDataText: props.emptyStateText,
    grid: { horizontal: false, vertical: false },
    onLegendClick,
    pointAnnotations: pointAnnotations.length ? pointAnnotations : undefined,
    scatterLabels: scatterLabels.length ? scatterLabels : undefined,
    scatterPaths: scatterPaths.length ? scatterPaths : undefined,
    toolbar,
    marquee: props.marquee,
  };
  // Grid comes from Axis `grid` props in this model.
  options.grid = {
    horizontal: yAxis.some((a) => a.grid),
    vertical: xAxis.some((a) => a.grid),
  };
  return { options, types, interactions, bigNumber };
}

interface PopoverState {
  datum: Datum;
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
    const p = el.props as { trellis?: string; trellisOrientation?: 'horizontal' | 'vertical'; trellisColumns?: number; trellisPadding?: number; dimension?: string; metric?: string; type?: string; metricStart?: string; color?: unknown };
    if ((kind === 'bar' || kind === 'line' || kind === 'area' || kind === 'scatter') && p.trellis)
      return {
        colorField: typeof p.color === 'string' ? p.color : kind === 'scatter' ? undefined : 'series',
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
  const total = typeof props.height === 'number' ? props.height : 400;
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
    <div role="group" aria-label={props.title ?? `Small multiples by ${spec.field}`} className={props.className} style={{ width: typeof props.width === 'number' ? props.width : (props.width ?? '100%'), ...props.style }}>
      {props.title && <div style={{ font: '700 16px Inter, system-ui, sans-serif', marginBottom: 6, color: props.colorScheme === 'dark' ? '#f2f2f5' : '#1d1d1f' }}>{props.title}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
        {facets.map((f) => {
          const present = cf ? groups.filter((g) => f.rows.some((r) => String(r[cf]) === g)) : [];
          const rows = cf ? [...f.rows].sort((a, b) => groups.indexOf(String(a[cf])) - groups.indexOf(String(b[cf]))) : f.rows;
          return (
            <div key={f.key} style={{ minWidth: 0 }}>
              <div style={{ font: '600 12px Inter, system-ui, sans-serif', height: titleH, lineHeight: `${titleH}px`, color: dark ? '#c9c9d1' : '#4b4b55', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(f.value)}</div>
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
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, font: '13px Inter, system-ui, sans-serif', color: dark ? '#f2f2f5' : '#1d1d1f', opacity: off ? 0.4 : 1 }}
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

const SingleChart = function SingleChart({ forwardedRef: ref, ...props }: ChartProps & { forwardedRef: React.ForwardedRef<ChartHandle> }) {
  const compiled = useMemo(() => compile(props), [props]);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [actionBar, setActionBar] = useState<ActionBarState | null>(null);
  const engine = useRef<EngineChart | null>(null);
  const barSpec = compiled.interactions.find((i) => i.actionBar)?.actionBar;
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const tooltipSpec = compiled.interactions.find((i) => i.tooltip)?.tooltip;
  const popSpec = compiled.interactions.find((i) => i.popover);

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

  const options: ChartOptions = {
    ...compiled.options,
    // The selected mark stays highlighted while its action bar is open.
    highlightedItem: actionBar ? { seriesId: actionBar.seriesId, dataIndex: actionBar.dataIndex } : compiled.options.highlightedItem,
    onItemClick: (item, event) => {
      const datum = item.datum ?? {};
      for (const i of compiled.interactions) i.onClick?.(datum);
      if (barSpec && item.seriesId !== undefined && item.dataIndex !== undefined) {
        const anchor = engine.current?.anchorOf(item.seriesId, item.dataIndex);
        const host = (event.target as HTMLElement).closest('.rgl-plot')?.getBoundingClientRect();
        const pos = anchor ?? (host ? { x: event.clientX - host.left, y: event.clientY - host.top } : lastPointer.current);
        setActionBar({ datum, seriesId: item.seriesId, dataIndex: item.dataIndex, ...pos, config: barSpec });
        return;
      }
      if (popSpec?.popover && !popSpec.popover.rightClick) {
        const host = (event.target as HTMLElement).closest('.rgl-plot')?.getBoundingClientRect();
        const pos = host ? { x: event.clientX - host.left, y: event.clientY - host.top } : lastPointer.current;
        setPopover({ datum, ...pos, config: popSpec.popover });
        popSpec.popover.onOpenChange?.(true);
      }
    },
    onItemContextMenu: (item, event) => {
      const datum = item.datum ?? {};
      for (const i of compiled.interactions) i.onContextMenu?.(event, datum);
      const rc = compiled.interactions.find((i) => i.popover?.rightClick);
      if (rc?.popover) {
        const host = (event.target as HTMLElement).closest('.rgl-plot')?.getBoundingClientRect();
        setPopover({ datum, x: host ? event.clientX - host.left : 0, y: host ? event.clientY - host.top : 0, config: rc.popover });
      }
    },
  };

  const renderTooltip = tooltipSpec?.children
    ? (ctx: TooltipContext) => {
        if (popover) return null;
        const item = ctx.items[0];
        if (!item) return null;
        const datum = { ...(item.datum ?? {}) } as Datum;
        for (const k of tooltipSpec.excludeDataKeys ?? []) if (datum[k]) return null;
        if (ctx.trigger === 'axis') (datum as Record<string, unknown>).rscGroupData = ctx.items.map((i) => i.datum);
        return <div className="rgl-tooltip-custom">{tooltipSpec.children!(datum)}</div>;
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
    <div
      className="rgl-popover"
      role="dialog"
      style={{
        position: 'absolute',
        left: popover.x,
        top: popover.y,
        transform: 'translate(-50%, calc(-100% - 12px))',
        zIndex: 6,
        width: popover.config.width === 'auto' || popover.config.width === undefined ? 'auto' : popover.config.width,
        background: 'var(--rgl-tooltip-bg)',
        color: 'var(--rgl-tooltip-text)',
        border: '1px solid var(--rgl-tooltip-border)',
        borderRadius: 10,
        padding: 12,
        boxShadow: '0 10px 30px rgba(0,0,0,.18)',
      }}
    >
      {popover.config.children?.(popover.datum, () => {
        setPopover(null);
        popover.config.onOpenChange?.(false);
      })}
    </div>
  ) : null;

  return (
    <GLChart
      ref={ref}
      options={options}
      seriesTypes={compiled.types}
      width={props.width}
      height={props.height ?? 400}
      minWidth={props.minWidth ?? 100}
      maxWidth={props.maxWidth}
      minHeight={props.minHeight ?? 100}
      maxHeight={props.maxHeight}
      className={props.className}
      style={props.style}
      renderTooltip={renderTooltip}
      overlay={overlay ?? actionOverlay}
      onReady={(c) => (engine.current = c)}
      onBackend={props.onBackend}
      dataTestId={props.dataTestId}
    />
  );
};

function BigNumberView({ data, spec, locale, colorScheme }: { data: Datum[]; spec: NonNullable<Compiled['bigNumber']>; locale?: string; colorScheme?: 'light' | 'dark' }) {
  const p = spec.props;
  const values = data.map((d) => Number(d[p.dataKey])).filter(Number.isFinite);
  const method = p.method ?? 'last';
  const v = values.length === 0 ? null : method === 'sum' ? values.reduce((a, b) => a + b, 0) : method === 'avg' ? values.reduce((a, b) => a + b, 0) / values.length : values[values.length - 1];
  const f = getFormatter(locale);
  const horizontal = p.orientation === 'horizontal';
  const text = colorScheme === 'dark' ? '#f2f2f5' : '#1d1d1f';
  return (
    <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: horizontal ? 'center' : 'flex-start', gap: 12, color: text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {p.icon}
      <div>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{v === null ? '–' : f.number(v, p.numberFormat ?? 'standardNumber')}</div>
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
