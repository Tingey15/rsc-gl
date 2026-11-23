import { describe, expect, it } from 'vitest';
import { renderToSVGString } from '../svg/ssr';
import { barSeries } from '../series/bar';
import { lineSeries, areaSeries } from '../series/line';
import { pieSeries } from '../series/pie';
import { heatmapSeries, waterfallSeries, boxStats } from '../series/cartesian-extra';
import { funnelSeries, treemapSeries } from '../series/standalone';
import { lttb, minmax, m4, sampleIndices } from '../data/sampling';
import { trend } from '../data/regression';
import { arcPath, roundRectPath } from '../svg/svg';

describe('server-side SVG rendering (no DOM, no GPU)', () => {
  it('renders bars with axes, labels and legend', () => {
    const svg = renderToSVGString(
      {
        title: 'Revenue',
        legend: true,
        xAxis: [{ data: ['Q1', 'Q2', 'Q3'] }],
        series: [
          { type: 'bar', data: [10, 20, 15], label: 'A' },
          { type: 'bar', data: [5, 8, 12], label: 'B' },
        ],
      },
      { series: [barSeries], width: 600, height: 300 },
    );
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(svg).toContain('>Q2<');
    expect(svg).toContain('>Revenue<');
    expect(svg).toContain('>B<');
  });

  it('renders lines, areas and pies', () => {
    const svg = renderToSVGString(
      {
        xAxis: [{ data: ['a', 'b', 'c', 'd'], scaleType: 'point' }],
        series: [
          { type: 'line', data: [1, 3, 2, 4], label: 'L', lineType: 'dashed' },
          { type: 'area', data: [0.5, 1, 1.5, 1], label: 'A' },
        ],
      },
      { series: [lineSeries, areaSeries], width: 500, height: 260 },
    );
    expect(svg).toContain('stroke-dasharray="7 4"');
    const pie = renderToSVGString({ series: [{ type: 'pie', data: [{ id: 'x', value: 2 }, { id: 'y', value: 3 }] }] }, { series: [pieSeries], width: 300, height: 300 });
    expect((pie.match(/<path d="M/g) ?? []).length).toBe(2);
  });

  it('renders the new chart types headlessly', () => {
    const heat = renderToSVGString(
      { xAxis: [{ data: ['a', 'b'] }], yAxis: [{ data: ['x', 'y'] }], series: [{ type: 'heatmap', data: [['a', 'x', 1], ['b', 'y', 2], ['a', 'y', 3]] as never }] },
      { series: [heatmapSeries], width: 300, height: 200 },
    );
    expect((heat.match(/<path d="[^"]*" fill="rgb/g) ?? []).length).toBe(3);
    const wf = renderToSVGString(
      { series: [{ type: 'waterfall', dimension: 'k', metric: 'v', data: [{ k: 'a', v: 5 }, { k: 'b', v: -2 }, { k: 'c', total: true }] as never, totalField: 'total' }] },
      { series: [waterfallSeries], width: 300, height: 200 },
    );
    expect((wf.match(/<path d="M[\d.]+,[\d.]+H/g) ?? []).length).toBe(3);
    const fn = renderToSVGString({ series: [{ type: 'funnel', data: [{ label: 'a', value: 10 }, { label: 'b', value: 5 }] as never }] }, { series: [funnelSeries], width: 300, height: 200 });
    expect(fn).toContain('<path');
    const tm = renderToSVGString(
      { series: [{ type: 'treemap', root: { name: 'r', children: [{ name: 'a', value: 3 }, { name: 'b', value: 1 }] } } as never] },
      { series: [treemapSeries], width: 300, height: 200 },
    );
    expect((tm.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('sampling', () => {
  const n = 10000;
  const xs = Float64Array.from({ length: n }, (_, i) => i);
  const ys = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 50) + (i === 5000 ? 10 : 0));
  it('min-max keeps peaks and endpoints', () => {
    const idx = minmax(xs, ys, 200);
    expect(idx.length).toBeLessThanOrEqual(402);
    expect(idx).toContain(5000);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(n - 1);
  });
  it('lttb and m4 reduce to the requested size', () => {
    expect(lttb(xs, ys, 300)).toHaveLength(300);
    expect(m4(xs, ys, 100).length).toBeLessThanOrEqual(402);
    expect(sampleIndices(xs, ys, 'auto', 5000)).toBeNull();
    expect(sampleIndices(xs, ys, 'auto', 500)?.length).toBeLessThan(1100);
  });
});

describe('regression trendlines', () => {
  const pts = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 2 * i + 1 }));
  it('fits linear and polynomial trends', () => {
    expect(trend(pts, 'linear').at!(30)).toBeCloseTo(61, 4);
    expect(trend(pts.map((p) => ({ x: p.x, y: p.x * p.x })), 'quadratic').at!(10)).toBeCloseTo(100, 3);
    expect(trend(pts, 'average').at!(0)).toBeCloseTo(20, 5);
    expect(trend(pts, 'movingAverage-4').points).toHaveLength(17);
  });
  it('computes box statistics', () => {
    const st = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 100]);
    expect(st.median).toBe(5);
    expect(st.outliers).toEqual([100]);
  });
});

describe('svg geometry', () => {
  it('builds rounded rects and arcs', () => {
    expect(roundRectPath(0, 0, 10, 10, [2, 2, 0, 0])).toMatch(/^M2,0H8A2,2/);
    expect(arcPath(50, 50, 0, 40, 0, Math.PI / 2)).toContain('A40,40 0 0 1');
    expect(arcPath(50, 50, 20, 40, 0, Math.PI * 2)).toContain('A20,20');
  });
});
