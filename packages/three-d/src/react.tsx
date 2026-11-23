import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { RenderEngine } from '@rsc-gl/core';
import { useEngineOptions } from '@rsc-gl/react';
import { Chart3D, type Bar3DOptions, type Chart3DOptions, type Extra3DOptions, type Scatter3DOptions, type Surface3DOptions } from './chart3d';

const fnIds = new WeakMap<object, number>();
let fnCounter = 0;
function fnId(f: object): number {
  let id = fnIds.get(f);
  if (id === undefined) {
    id = ++fnCounter;
    fnIds.set(f, id);
  }
  return id;
}

type Common = { width?: number | string; height?: number | string; className?: string; style?: CSSProperties };

function Chart3DHost({ options, width, height, className, style }: Common & { options: Chart3DOptions }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<Chart3D | null>(null);
  const engineOpts = useEngineOptions();
  const latest = useRef(options);
  latest.current = options;
  useLayoutEffect(() => {
    if (!host.current) return;
    const c = new Chart3D(host.current, latest.current, RenderEngine.get(engineOpts));
    chart.current = c;
    return () => {
      c.destroy();
      chart.current = null;
    };
  }, [engineOpts]);
  // Data functions (e.g. surface `values`) participate by identity; callbacks do not.
  const sig = JSON.stringify(options, (k, v) => (typeof v === 'function' ? (k === 'values' ? `fn#${fnId(v)}` : undefined) : v));
  const applied = useRef(sig);
  useEffect(() => {
    if (applied.current === sig) return;
    applied.current = sig;
    chart.current?.setOptions(latest.current);
  }, [sig]);
  return <div ref={host} className={className} style={{ position: 'relative', width: width ?? '100%', height: height ?? 420, ...style }} />;
}

export type Bar3DChartProps = Common & Omit<Bar3DOptions, 'type'>;
export type Scatter3DChartProps = Common & Omit<Scatter3DOptions, 'type'>;
export type Surface3DChartProps = Common & Omit<Surface3DOptions, 'type'>;

const split = <T extends Common>(p: T) => {
  const { width, height, className, style, ...rest } = p;
  return [{ width, height, className, style }, rest] as const;
};

/** Grid of 3D bars (rows along z, columns along x). Drag to orbit, scroll to zoom. */
export function Bar3DChart(props: Bar3DChartProps) {
  const [common, rest] = split(props);
  return <Chart3DHost {...common} options={{ type: 'bar', ...rest }} />;
}

/** 3D scatter plot with lit sphere sprites. */
export function Scatter3DChart(props: Scatter3DChartProps) {
  const [common, rest] = split(props);
  return <Chart3DHost {...common} options={{ type: 'scatter', ...rest }} />;
}

/** Height-field surface with a sequential color map; morphs between datasets. */
export function Surface3DChart(props: Surface3DChartProps) {
  const [common, rest] = split(props);
  return <Chart3DHost {...common} options={{ type: 'surface', ...rest }} />;
}

type ExtraProps<T extends Extra3DOptions['type']> = Common & Omit<Extract<Extra3DOptions, { type: T }>, 'type'>;

function extra<T extends Extra3DOptions['type']>(type: T, displayName: string) {
  const C = (props: ExtraProps<T>) => {
    const [common, rest] = split(props);
    return <Chart3DHost {...common} options={{ type, ...rest } as unknown as Chart3DOptions} />;
  };
  C.displayName = displayName;
  return C;
}

/** Stacked 3D bars (boxes, cylinders, cones or pyramids). */
export const StackedBar3DChart = /*#__PURE__*/ extra('stackedBar', 'StackedBar3DChart');
/** Extruded pie / donut; optional value-driven heights. */
export const Pie3DChart = /*#__PURE__*/ extra('pie', 'Pie3DChart');
/** Ribbons or ridgeline walls: one row per series. */
export const Ribbon3DChart = /*#__PURE__*/ extra('ribbon', 'Ribbon3DChart');
/** Globe with points or spikes, great-circle arcs and outlines. */
export const Globe3DChart = /*#__PURE__*/ extra('globe', 'Globe3DChart');
/** Force-directed 3D network graph. */
export const Network3DChart = /*#__PURE__*/ extra('network', 'Network3DChart');
/** 3D arrows colored by magnitude. */
export const VectorField3DChart = /*#__PURE__*/ extra('vectorField', 'VectorField3DChart');
/** 2D histogram as 3D columns (density of x/z points). */
export const Histogram3DChart = /*#__PURE__*/ extra('histogram', 'Histogram3DChart');
/** 3D funnel (cone or pyramid stages). */
export const Funnel3DChart = /*#__PURE__*/ extra('funnel', 'Funnel3DChart');
/** Treemap with extruded tiles. */
export const Treemap3DChart = /*#__PURE__*/ extra('treemap', 'Treemap3DChart');
/** Prism map: regions extruded by value. */
export const Map3DChart = /*#__PURE__*/ extra('map', 'Map3DChart');
/** Paths through 3D space as tubes or lines. */
export const Trajectory3DChart = /*#__PURE__*/ extra('trajectory', 'Trajectory3DChart');
