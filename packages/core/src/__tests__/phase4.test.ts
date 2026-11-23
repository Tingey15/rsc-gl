import { describe, expect, it } from 'vitest';
import { facetBy, niceExtent, sharedExtent } from '../data/facet';
import { exportRows, serializeRows } from '../data/export';
import { toXlsx } from '../data/xlsx';
import { cloneable } from '../worker/protocol';
import { renderToSVGString } from '../svg/ssr';
import { barSeries } from '../series/bar';
import { lineSeries } from '../series/line';
import { candlestickSeries } from '../series/cartesian-extra';
import { radialLineSeries } from '../series/radial-line';
import type { ResolvedSeries } from '../series/types';

describe('small multiples helpers', () => {
  const rows = [
    { region: 'N', q: 'Q1', product: 'a', v: 10 },
    { region: 'N', q: 'Q1', product: 'b', v: 15 },
    { region: 'S', q: 'Q1', product: 'a', v: 40 },
    { region: 'S', q: 'Q2', product: 'a', v: -5 },
  ];
  it('splits rows by a field in first-appearance order', () => {
    const f = facetBy(rows, 'region');
    expect(f.map((x) => x.key)).toEqual(['N', 'S']);
    expect(f[1].rows).toHaveLength(2);
    expect(facetBy(rows, 'region', ['S', 'N']).map((x) => x.key)).toEqual(['S', 'N']);
  });
  it('computes a shared extent, summing stacks', () => {
    expect(sharedExtent(rows, 'v')).toEqual([-5, 40]);
    // N/Q1 stacks to 25, S/Q1 is 40.
    expect(sharedExtent(rows, 'v', { stackBy: ['region', 'q'] })).toEqual([-5, 40]);
    expect(sharedExtent([{ v: 3 }, { v: 9 }], 'v', { includeZero: false })).toEqual([3, 9]);
  });
  it('rounds extents to nice steps', () => {
    expect(niceExtent([0, 93])).toEqual([0, 100]);
    expect(niceExtent([-7, 41])).toEqual([-10, 50]);
  });
});

describe('data export', () => {
  const series = (id: string, ys: (number | null)[], type = 'line'): ResolvedSeries =>
    ({ id, label: id.toUpperCase(), type, hidden: false, xAxisId: 'x', yAxisId: 'y', options: { type }, points: ys.map((y, i) => ({ key: String(i), index: i, x: ['Jan', 'Feb', 'Mar'][i], y })) }) as unknown as ResolvedSeries;
  it('tabulates series sharing an x axis in wide format', () => {
    const { columns, rows } = exportRows([series('a', [1, 2, 3]), series('b', [4, null, 6])], null);
    expect(columns).toEqual(['Category', 'A', 'B']);
    expect(rows[1]).toEqual(['Feb', 2, null]);
  });
  it('falls back to long format for mixed series', () => {
    const { columns, rows } = exportRows([series('p', [5, 6, 7], 'pie')], null);
    expect(columns).toEqual(['Series', 'Label', 'Value']);
    expect(rows).toHaveLength(3);
  });
  it('serializes CSV with quoting, TSV, JSON and .xlsx', () => {
    const cols = ['Name', 'Value'];
    const rows = [['a, "b"', 1], ['c', null]];
    expect(serializeRows(cols, rows, 'csv')).toBe('Name,Value\n"a, ""b""",1\nc,');
    // Fields containing quotes are quoted in TSV too.
    expect(serializeRows(cols, rows, 'tsv').split('\n')[1]).toBe('"a, ""b"""\t1');
    expect(JSON.parse(serializeRows(cols, rows, 'json'))[1]).toEqual({ Name: 'c', Value: null });
    // .xlsx: a zip (PK header) whose sheet holds the numbers and inline strings.
    const bytes = toXlsx(cols, rows, 'Sheet');
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<c r="B2"><v>1</v></c>');
    expect(text).toContain('<t>a, &quot;b&quot;</t>');
    expect(text).toContain('sheet name="Sheet"');
  });
});

describe('worker protocol', () => {
  it('drops functions but keeps typed arrays, dates and cycles', () => {
    const arr = new Float32Array([1, 2]);
    const d = new Date(0);
    const o: Record<string, unknown> = { a: 1, f: () => 1, arr, d, nested: { g: () => 2, k: 'x' } };
    o.self = o;
    const c = cloneable(o) as Record<string, unknown>;
    expect(c.f).toBeUndefined();
    expect((c.nested as Record<string, unknown>).g).toBeUndefined();
    expect(c.arr).toBe(arr);
    expect(c.d).toBe(d);
    expect(c.self).toBe(c);
  });
});

describe('server rendering of new features', () => {
  it('marks SSR output for hydration and draws grouped axis labels', () => {
    const svg = renderToSVGString(
      {
        xAxis: [{ data: ['Jan', 'Feb', 'Mar', 'Apr'], groups: [{ getValue: (v) => (['Jan', 'Feb'].includes(String(v)) ? 'H1' : 'H2') }] }],
        series: [{ type: 'bar', data: [1, 2, 3, 4] }],
      },
      { series: [barSeries], width: 500, height: 280 },
    );
    expect(svg).toContain('data-rgl-ssr');
    expect(svg).toContain('>H1<');
    expect(svg).toContain('>H2<');
  });
  it('draws axis annotations and thumbnails as SVG', () => {
    const svg = renderToSVGString(
      {
        xAxis: [{ data: ['a', 'b', 'c'], thumbnails: { url: (v) => `https://example.test/${String(v)}.png`, size: 20 }, annotations: [{ value: 'b', label: 'Launch', icon: 'flag' }] }],
        series: [{ type: 'line', data: [1, 3, 2] }],
      },
      { series: [lineSeries], width: 500, height: 280 },
    );
    expect((svg.match(/<image /g) ?? []).length).toBe(3);
    expect(svg).toContain('>Launch<');
  });
  it('renders candles with volume bars and a last-price badge', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({ t: `D${i}`, open: 10 + i, high: 13 + i, low: 9 + i, close: 11 + i + (i % 2 ? -2 : 1), volume: 100 + i * 10 }));
    const svg = renderToSVGString({ series: [{ type: 'candlestick', data, dimension: 't', volume: 'volume', lastPrice: true } as never] }, { series: [candlestickSeries], width: 500, height: 300 });
    // 6 wicks + 6 bodies + 6 volume bars + dashed last-price segments.
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(18);
    // Last close: 11 + 5 - 2.
    expect(svg).toContain('>14.00<');
  });
  it('lays out radial lines over categorical angles', () => {
    const svg = renderToSVGString(
      { series: [{ type: 'radialLine', angles: ['N', 'E', 'S', 'W'], data: [1, 2, 3, 4], area: true } as never] },
      { series: [radialLineSeries], width: 400, height: 400 },
    );
    for (const label of ['>N<', '>E<', '>S<', '>W<']) expect(svg).toContain(label);
  });
});
