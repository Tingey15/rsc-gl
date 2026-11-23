import type { CSSProperties, ReactNode } from 'react';
import { facetBy, niceExtent, sharedExtent, type Datum, type Facet } from '@rsc-gl/core';

export interface TrellisProps<T extends Datum = Datum> {
  data: T[];
  /** Field that splits the data into panels. */
  by: string;
  /** Panels per row. Default: all in one row. */
  columns?: number;
  /** Gap between panels (px). Default 12. */
  gap?: number;
  /** Panel order: data order, sorted, or an explicit list of values. */
  order?: 'data' | 'asc' | 'desc' | unknown[];
  /**
   * Computes one value range shared by every panel. `stackBy` sums values that
   * share those keys first (stacked bars / areas).
   */
  sharedScale?: { metric: string; stackBy?: string[]; includeZero?: boolean };
  /** Panel title; defaults to the facet value. */
  panelTitle?: (facet: Facet<T>) => ReactNode;
  /** Renders one panel. `range` is the shared value range, when requested. */
  children: (rows: T[], facet: Facet<T>, range: [number, number] | undefined, index: number) => ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Small multiples for any chart: one panel per value of `by`, optionally on a
 * shared value scale so panels compare at a glance.
 *
 * ```tsx
 * <Trellis data={rows} by="region" columns={3} sharedScale={{ metric: 'sales' }}>
 *   {(rows, facet, range) => <BarChart dataset={rows} yAxis={[{ min: range?.[0], max: range?.[1] }]} … />}
 * </Trellis>
 * ```
 */
export function Trellis<T extends Datum>({ data, by, columns, gap = 12, order, sharedScale, panelTitle, children, className, style }: TrellisProps<T>) {
  const facets = facetBy(data, by, order);
  const range = sharedScale ? niceExtent(sharedExtent(data, sharedScale.metric, { stackBy: sharedScale.stackBy, includeZero: sharedScale.includeZero })) : undefined;
  const cols = columns ?? facets.length;
  return (
    <div role="group" className={className} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap, ...style }}>
      {facets.map((f, i) => (
        <div key={f.key} role="group" aria-label={String(f.value)} style={{ minWidth: 0 }}>
          <div style={{ font: '600 12px Inter, system-ui, sans-serif', marginBottom: 4, opacity: 0.8 }}>{panelTitle ? panelTitle(f) : String(f.value)}</div>
          {children(f.rows, f, range, i)}
        </div>
      ))}
    </div>
  );
}
