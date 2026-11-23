import { describe, expect, it } from 'vitest';
import { EASING_ID, ease, localProgress, resolveTransition } from '../animation/easing';
import { createScale } from '../scales/scales';
import { getFormatter, inferGranularity } from '../format/format';
import { normalizeGroups, stackSeries, toResolvedSeries } from '../series/normalize';
import { sampleCurve, yAt } from '../series/curve';
import { contrastText, resolveColor, resolvePalette } from '../theme/colors';
import { resolveLineType } from '../theme/theme';
import type { NormalizeContext } from '../series/types';

const ctx = (over: Partial<NormalizeContext> = {}): NormalizeContext => {
  let c = 0;
  let i = 0;
  return {
    axisData: () => undefined,
    nextColor: () => ['#111111', '#222222', '#333333'][c++ % 3],
    nextIndex: () => i++,
    scheme: 'light',
    isHidden: () => false,
    ...over,
  };
};

describe('easing', () => {
  it('is pinned at the ends', () => {
    for (const id of Object.values(EASING_ID)) {
      expect(ease(0, id)).toBe(0);
      expect(ease(1, id)).toBe(1);
    }
    expect(ease(0.5, EASING_ID.cubicInOut)).toBeCloseTo(0.5);
    expect(ease(0.5, EASING_ID.backOut)).toBeGreaterThan(0.5);
  });

  it('staggers instances across the duration', () => {
    expect(localProgress(0.5, 0, 0.5)).toBeCloseTo(1);
    expect(localProgress(0.5, 1, 0.5)).toBe(0);
    expect(localProgress(1, 1, 0.5)).toBe(1);
  });

  it('resolves transition options', () => {
    expect(resolveTransition(false).duration).toBe(0);
    expect(resolveTransition({ duration: 100 }).duration).toBe(100);
  });
});

describe('scales', () => {
  it('band scales map categories to band starts', () => {
    const s = createScale({ type: 'band', domain: ['a', 'b', 'c'], range: [0, 300], paddingInner: 0, paddingOuter: 0 });
    expect(s.map('a')).toBe(0);
    expect(s.map('c')).toBe(200);
    expect(s.bandwidth()).toBe(100);
    expect(s.invertIndex(250)).toBe(2);
  });

  it('linear scales nice their domain unless strict', () => {
    const nice = createScale({ type: 'linear', domain: [0.3, 97], range: [0, 100] });
    expect(nice.domain()).toEqual([0, 100]);
    const strict = createScale({ type: 'linear', domain: [0.3, 97], range: [0, 100], domainLimit: 'strict' });
    expect(strict.domain()).toEqual([0.3, 97]);
  });

  it('handles degenerate domains and ISO strings on time scales', () => {
    const flat = createScale({ type: 'linear', domain: [5, 5], range: [0, 10] });
    const [a, b] = flat.domain() as number[];
    expect(a).toBeLessThan(5);
    expect(b).toBeGreaterThan(5);
    const t = createScale({ type: 'time', domain: [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 3)], range: [0, 100], domainLimit: 'strict' });
    expect(t.map('2026-01-02T00:00:00Z')).toBeCloseTo(50);
  });
});

describe('formatting', () => {
  const f = getFormatter('en-US');
  it('supports presets and d3 specifiers', () => {
    expect(f.number(2500)).toBe('2,500');
    expect(f.number(2_500_000, 'shortNumber')).toBe('2.5M');
    expect(f.number(2.5, 'currency')).toBe('$2.50');
    expect(f.number(0.256, 'percentage')).toBe('26%');
    expect(f.number(1234.567, ',.2f')).toBe('1,234.57');
    expect(f.duration(3725)).toBe('1:02:05');
  });

  it('localizes separators', () => {
    expect(getFormatter('de-DE').number(1234.5)).toBe('1.234,5');
  });

  it('infers time granularity', () => {
    expect(inferGranularity(864e5 * 30, 6)).toBe('day');
    expect(inferGranularity(864e5 * 365 * 5, 5)).toBe('year');
  });
});

describe('series normalization', () => {
  it('maps value arrays onto axis categories', () => {
    const groups = normalizeGroups({ type: 'bar', data: [1, null, 3] }, ctx({ axisData: () => ['a', 'b', 'c'] }), { dimension: 'x', metric: 'y' }, 's');
    expect(groups).toHaveLength(1);
    expect(groups[0].points.map((p) => [p.x, p.y])).toEqual([
      ['a', 1],
      ['b', null],
      ['c', 3],
    ]);
  });

  it('splits long-format rows by facet in first-appearance order', () => {
    const rows = [
      { cat: 'A', os: 'Desktop', v: 1 },
      { cat: 'A', os: 'Laptop', v: 2 },
      { cat: 'B', os: 'Desktop', v: 3 },
    ];
    const c = ctx({ data: rows });
    const groups = normalizeGroups({ type: 'bar', dimension: 'cat', metric: 'v', groupBy: 'os' }, c, { dimension: 'x', metric: 'y' }, 'bar');
    expect(groups.map((g) => g.id)).toEqual(['Desktop', 'Laptop']);
    const series = toResolvedSeries({ type: 'bar' }, groups, c, 'rect');
    expect(series.map((s) => s.index)).toEqual([0, 1]);
    expect(series[0].colorCss).not.toBe(series[1].colorCss);
  });

  const mk = (c: NormalizeContext, v: number) =>
    toResolvedSeries({ type: 'bar' }, normalizeGroups({ type: 'bar', data: [v] }, c, { dimension: 'x', metric: 'y' }, `s${v}`), c, 'rect')[0];

  it('stacks positive and negative values separately', () => {
    const c = ctx({ axisData: () => ['a'] });
    const s = [mk(c, 2), mk(c, -1), mk(c, 3)];
    s.forEach((x) => (x.stack = 'total'));
    stackSeries(s);
    expect([s[0].points[0].y0, s[0].points[0].y1]).toEqual([0, 2]);
    expect([s[1].points[0].y0, s[1].points[0].y1]).toEqual([0, -1]);
    expect([s[2].points[0].y0, s[2].points[0].y1]).toEqual([2, 5]);
  });

  it('expand offset normalizes to 0..1', () => {
    const c = ctx({ axisData: () => ['a'] });
    const s = [mk(c, 1), mk(c, 3)];
    s.forEach((x) => (x.stack = 'total'));
    stackSeries(s, 'expand');
    expect(s[1].points[0].y1).toBeCloseTo(1);
    expect(s[0].points[0].y1).toBeCloseTo(0.25);
  });
});

describe('curves', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 0 },
    { x: 30, y: 10 },
  ];
  it('passes through the source points', () => {
    const s = sampleCurve(pts, 'monotoneX');
    expect(s.length).toBeGreaterThan(pts.length);
    for (const p of pts) expect(yAt(s, p.x)).toBeCloseTo(p.y, 1);
  });
  it('linear sampling is the identity', () => {
    expect(sampleCurve(pts, 'linear').map((p) => [p.x, p.y])).toEqual(pts.map((p) => [p.x, p.y]));
  });
});

describe('theme', () => {
  it('resolves tokens and CSS colors', () => {
    expect(resolveColor('#ff0000')).toEqual([1, 0, 0, 1]);
    expect(resolveColor('transparent')[3]).toBe(0);
    const light = resolveColor('gray-900', 'light');
    const dark = resolveColor('gray-900', 'dark');
    expect(light[0]).toBeLessThan(dark[0]);
    expect(resolvePalette('categorical6', 'light')).toHaveLength(6);
    expect(resolvePalette('sequentialViridis5', 'light')).toHaveLength(5);
    expect(contrastText([1, 1, 1, 1])).toBe('#1d1d1f');
    expect(resolveLineType('dashed')).toEqual([7, 4]);
  });
});
