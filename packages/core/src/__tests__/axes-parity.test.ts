import { describe, expect, it } from 'vitest';
import { axisLabelBoxes, axisTitleText, drawAxes, hitAxisLabel, layoutCartesian, type CartesianLayout } from '../components/axes';
import { currencyFor, getFormatter, resolveLocale } from '../format/format';
import { createScale, timeTickInterval } from '../scales/scales';
import { LIGHT_THEME } from '../theme/theme';
import type { AxisOptions } from '../types';

const measure = (t: string) => t.length * 7;
const layout = (xAxis: AxisOptions[], yAxis: AxisOptions[] = [{}], size = { width: 600, height: 400 }): CartesianLayout =>
  layoutCartesian({ defs: new Map(), series: [], xAxis, yAxis, width: size.width, height: size.height, formatter: getFormatter('en-US'), theme: LIGHT_THEME, measure });
const nums = (l: CartesianLayout, dir: 'x' | 'y' = 'y') => (dir === 'x' ? l.xAxes[0] : l.yAxes[0]).ticks.map((t) => Number(t.value));

/** A canvas context stub that records text calls. */
function recorder() {
  const calls: { text: string; x: number; y: number; font: string; align: string; baseline: string }[] = [];
  const state = { font: '', textAlign: 'left', textBaseline: 'alphabetic' };
  const noop = () => {};
  const g = new Proxy(state as Record<string, unknown>, {
    get(target, key) {
      if (key === 'fillText') return (text: string, x: number, y: number) => calls.push({ text, x, y, font: String(target.font), align: String(target.textAlign), baseline: String(target.textBaseline) });
      if (key in target) return target[key as string];
      return noop;
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g, calls };
}

describe('locale robustness', () => {
  it('accepts every locale form without throwing', () => {
    const inputs: unknown[] = [
      'de-DE',
      'not a locale!!',
      '',
      undefined,
      null,
      { code: 'fr-FR' },
      { number: 'de-DE', time: 'fr-FR' },
      { number: { decimal: ',', thousands: '.', grouping: [3], currency: ['', ' €'] } },
      { time: { dateTime: '%A, %e. %B %Y, %X', date: '%d.%m.%Y', time: '%H:%M:%S', periods: ['AM', 'PM'], days: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], shortDays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'], shortMonths: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'] } },
      { decimal: ',', thousands: ' ', grouping: [3], currency: ['', ' kr'] },
      { dateTime: '%x', date: '%d/%m/%Y', time: '%H:%M', periods: ['a', 'p'], days: [], shortDays: [], months: [], shortMonths: [] },
      { number: 'xx-garbage', time: 42 },
      { code: 7 },
    ];
    for (const input of inputs) {
      const f = getFormatter(input as never);
      expect(typeof f.number(1234.5)).toBe('string');
      expect(typeof f.number(1234.5, 'currency')).toBe('string');
      expect(typeof f.time(Date.UTC(2026, 0, 15), '%b %d')).toBe('string');
      expect(typeof f.timeTick(Date.UTC(2026, 0, 15), 'month')[0]).toBe('string');
    }
  });

  it('falls back to en-US for the Intl code', () => {
    expect(getFormatter('not a locale!!').locale).toBe('en-US');
    expect(getFormatter({ number: { decimal: ',' } }).locale).toBe('en-US');
    expect(resolveLocale({ number: 'de-DE' })).toMatchObject({ code: 'de-DE', numberCode: 'de-DE' });
    expect(resolveLocale({ number: 'de-DE', time: 'fr-FR' })).toMatchObject({ code: 'fr-FR', numberCode: 'de-DE' });
  });

  it('uses legacy number and time locales', () => {
    expect(getFormatter({ number: 'de-DE' }).number(1234.5)).toBe('1.234,5');
    // A d3 number definition sets the separators of standard numbers too.
    const custom = getFormatter({ number: { decimal: ',', thousands: '.', grouping: [3], currency: ['', ' €'] } });
    expect(custom.number(1234.5)).toBe('1.234,5');
    expect(custom.number(1234.5, ',.2f')).toBe('1.234,50');
    expect(custom.number(2.5, 'currency')).toBe('2,50 €');
    // A time code localizes d3 time specifiers.
    expect(getFormatter({ time: 'de-DE' }).time(Date.UTC(2026, 2, 15, 12), '%B')).toBe('März');
  });

  it('handles an undefined currency code', () => {
    expect(currencyFor(undefined)).toBe('USD');
    expect(currencyFor('de-DE')).toBe('EUR');
    expect(currencyFor('ja')).toBe('USD');
  });
});

describe('currency options', () => {
  const f = getFormatter('en-US');
  it('overrides the currency code', () => {
    expect(f.number(2.5, 'currency', { currencyCode: 'EUR' })).toBe('€2.50');
    expect(f.number(2_500_000, 'shortCurrency', { currencyCode: 'EUR' })).toBe('€2.5M');
  });
  it('places the symbol by the currency locale, with digits in the chart locale', () => {
    // de-DE puts the symbol after the number; digits keep en-US separators.
    expect(f.number(1234.5, 'currency', { currencyCode: 'USD', currencyLocale: 'de-DE' }).replace(/\s/g, ' ')).toBe('1,234.50 $');
    expect(f.number(-3, 'currency', { currencyCode: 'USD', currencyLocale: 'de-DE' }).replace(/\s/g, ' ')).toBe('-3.00 $');
    // Legacy: a fixed-precision specifier with both options is a currency.
    expect(f.number(1234.567, ',.1f', { currencyCode: 'EUR', currencyLocale: 'en-US' })).toBe('€1,234.6');
    // d3 currency specifiers use the code.
    expect(f.number(1234.5, '$,.2f', { currencyCode: 'GBP' })).toBe('£1,234.50');
  });
  it('ignores an invalid currency code', () => {
    expect(f.number(2.5, 'currency', { currencyCode: 'not-a-code' })).toBe('$2.50');
  });
  it('is applied by axis formatting', () => {
    const l = layout([{}], [{ numberFormat: 'currency', currencyCode: 'EUR', min: 0, max: 100 }]);
    expect(l.yAxes[0].ticks.map((t) => t.label)).toContain('€100.00');
    expect(l.yAxes[0].format(5, 'tooltip')).toBe('€5.00');
  });
});

describe('explicit labels and sub labels', () => {
  it('draws only the listed ticks, with label text and styling', () => {
    const l = layout([{ scaleType: 'band', data: ['a', 'b', 'c', 'd'], labels: ['b', { value: 'd', label: 'Dee', align: 'end', fontWeight: 'bold' }] }]);
    const ticks = l.xAxes[0].ticks;
    expect(ticks.map((t) => [t.value, t.label])).toEqual([
      ['b', 'b'],
      ['d', 'Dee'],
    ]);
    expect(ticks[1]).toMatchObject({ align: 'end', fontWeight: 'bold' });
  });

  it('works on continuous axes and drops values off the scale', () => {
    const l = layout([{}], [{ min: 0, max: 100, labels: [0, { value: 50, label: 'Half' }, 100] }]);
    expect(l.yAxes[0].ticks.map((t) => t.label)).toEqual(['0', 'Half', '100']);
    const band = layout([{ scaleType: 'band', data: ['a'], labels: ['a', 'zz'] }]);
    expect(band.xAxes[0].ticks.map((t) => t.value)).toEqual(['a']);
  });

  it('adds sub labels and reserves a second line', () => {
    const base = layout([{ scaleType: 'band', data: ['a', 'b'] }]);
    const withSub = layout([{ scaleType: 'band', data: ['a', 'b'], subLabels: [{ value: 'b', subLabel: 'Second', fontWeight: 600 }] }]);
    expect(withSub.xAxes[0].ticks[1]).toMatchObject({ subLabel: 'Second', subFontWeight: 600 });
    expect(withSub.xAxes[0].ticks[0].subLabel).toBeUndefined();
    const fh = LIGHT_THEME.fontSize * 1.25;
    expect(withSub.xAxes[0].size - base.xAxes[0].size).toBeCloseTo(fh);
    const { g, calls } = recorder();
    drawAxes(g, withSub, LIGHT_THEME);
    const label = calls.find((c) => c.text === 'b')!;
    const sub = calls.find((c) => c.text === 'Second')!;
    expect(sub.y - label.y).toBeCloseTo(fh);
    expect(sub.font.startsWith('600 ')).toBe(true);
  });
});

describe('label align and weight', () => {
  it('anchors at band edges and applies the weight', () => {
    const l = layout([{ scaleType: 'band', data: ['a', 'b'], labelAlign: 'start', labelFontWeight: 'bold', categoryGapRatio: 0, categoryOuterGapRatio: 0 }]);
    const a = l.xAxes[0];
    const { g, calls } = recorder();
    drawAxes(g, l, LIGHT_THEME);
    const c = calls.find((x) => x.text === 'a')!;
    expect(c.align).toBe('left');
    expect(c.x).toBeCloseTo(a.scale.map('a'));
    expect(c.font.startsWith('bold ')).toBe(true);
  });

  it('aligns y labels to band top / bottom', () => {
    const l = layout([{}], [{ scaleType: 'band', data: ['a', 'b'], labelAlign: 'end', categoryGapRatio: 0, categoryOuterGapRatio: 0 }]);
    const a = l.yAxes[0];
    const { g, calls } = recorder();
    drawAxes(g, l, LIGHT_THEME);
    const c = calls.find((x) => x.text === 'a')!;
    const fh = LIGHT_THEME.fontSize * 1.25;
    // The line's middle sits half a line above the band's bottom edge.
    expect(c.y).toBeCloseTo(a.scale.map('a') + a.scale.bandwidth() - fh / 2);
  });

  it('keeps the default placement when unset', () => {
    const l = layout([{ scaleType: 'band', data: ['a', 'b'] }]);
    const a = l.xAxes[0];
    const { g, calls } = recorder();
    drawAxes(g, l, LIGHT_THEME);
    const c = calls.find((x) => x.text === 'a')!;
    expect(c.align).toBe('center');
    expect(c.x).toBeCloseTo(a.scale.map('a') + a.scale.bandwidth() / 2);
    expect(c.font).toBe(`${LIGHT_THEME.fontSize}px ${LIGHT_THEME.fontFamily}`);
  });
});

describe('category outer gap', () => {
  it('sets band outer padding', () => {
    const l = layout([{ scaleType: 'band', data: ['a', 'b'], categoryGapRatio: 0, categoryOuterGapRatio: 0 }]);
    const a = l.xAxes[0];
    expect(a.scale.map('a')).toBeCloseTo(l.plot.x);
    const d = layout([{ scaleType: 'band', data: ['a', 'b'], categoryGapRatio: 0.2 }]);
    // Default outer padding is half the inner padding.
    const s = d.xAxes[0].scale;
    expect(s.map('a') - d.plot.x).toBeCloseTo(s.step() * 0.1);
  });
});

describe('tick limits', () => {
  it('maxTicks is a hard upper limit (base tick not counted)', () => {
    const free = layout([{}], [{ min: 0, max: 100 }], { width: 600, height: 900 });
    expect(nums(free).length - 1).toBeGreaterThan(3);
    for (const maxTicks of [1, 2, 3, 4]) {
      const l = layout([{}], [{ min: 0, max: 100, maxTicks }], { width: 600, height: 900 });
      expect(nums(l).length - 1).toBeLessThanOrEqual(maxTicks);
      expect(nums(l).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('minTicks raises the count', () => {
    const small = layout([{}], [{ min: 0, max: 100 }], { width: 600, height: 120 });
    const l = layout([{}], [{ min: 0, max: 100, minTicks: 5 }], { width: 600, height: 120 });
    expect(nums(l).length - 1).toBeGreaterThanOrEqual(5);
    expect(nums(l).length).toBeGreaterThan(nums(small).length);
  });

  it('tickMinStep keeps ticks at least a step apart', () => {
    const l = layout([{}], [{ min: 0, max: 3, tickMinStep: 1 }], { width: 600, height: 900 });
    expect(nums(l)).toEqual([0, 1, 2, 3]);
    const odd = layout([{}], [{ min: 0, max: 10, tickMinStep: 2.4 }], { width: 600, height: 900 });
    const v = nums(odd);
    for (let i = 1; i < v.length; i++) expect(v[i] - v[i - 1]).toBeGreaterThanOrEqual(2.4);
  });

  it('tickNumber stays the target count', () => {
    const l = layout([{}], [{ min: 0, max: 100, tickNumber: 2 }]);
    expect(nums(l)).toEqual([0, 50, 100]);
  });
});

describe('time granularity ticks', () => {
  const start = new Date(2026, 0, 1).getTime();
  it('picks the interval from the granularity', () => {
    const l = layout([{ scaleType: 'time', min: start, max: new Date(2026, 11, 1).getTime(), granularity: 'month' }], [{}], { width: 1400, height: 400 });
    const months = l.xAxes[0].ticks.map((t) => new Date(Number(t.value)));
    expect(months.length).toBe(12);
    expect(months.every((d) => d.getDate() === 1)).toBe(true);
  });

  it('quarters are three months apart and thin when crowded', () => {
    const l = layout([{ scaleType: 'time', min: start, max: new Date(2030, 0, 1).getTime(), granularity: 'quarter' }], [{}], { width: 2000, height: 400 });
    const q = l.xAxes[0].ticks.map((t) => new Date(Number(t.value)).getMonth());
    expect(q.every((m) => m % 3 === 0)).toBe(true);
    const narrow = layout([{ scaleType: 'time', min: start, max: new Date(2030, 0, 1).getTime(), granularity: 'day' }], [{}], { width: 400, height: 400 });
    expect(narrow.xAxes[0].ticks.length).toBeLessThan(20);
    expect(timeTickInterval('quarter').range(new Date(2026, 0, 1), new Date(2027, 0, 1)).length).toBe(4);
  });
});

describe('axis titles', () => {
  it('reserves one line per title entry and draws each', () => {
    const one = layout([{ label: 'Month' }]);
    const two = layout([{ label: ['Month', '(fiscal)'] }]);
    const fh = LIGHT_THEME.fontSize * 1.25;
    expect(two.xAxes[0].size - one.xAxes[0].size).toBeCloseTo(fh);
    const { g, calls } = recorder();
    drawAxes(g, two, LIGHT_THEME);
    const a = calls.find((c) => c.text === 'Month')!;
    const b = calls.find((c) => c.text === '(fiscal)')!;
    expect(b.y - a.y).toBeCloseTo(fh);
    expect(axisTitleText(['A', 'B'])).toBe('A B');
    const y2 = layout([{}], [{ label: ['Revenue', 'USD'] }]);
    const y1 = layout([{}], [{ label: 'Revenue' }]);
    expect(y2.yAxes[0].size - y1.yAxes[0].size).toBeCloseTo(fh);
  });
});

describe('label limit and hit boxes', () => {
  const cats = ['A very long category name', 'Another very long category name', 'Short'];
  it("'band' truncates to the band step and keeps the full text", () => {
    const l = layout([{ scaleType: 'band', data: cats, labelLimit: 'band' }], [{}], { width: 360, height: 300 });
    const a = l.xAxes[0];
    const step = a.scale.step();
    for (const t of a.ticks) expect(measure(t.label)).toBeLessThanOrEqual(step);
    expect(a.ticks[0].label.endsWith('…')).toBe(true);
    expect(a.ticks[0].fullLabel).toBe(cats[0]);
    expect(a.ticks[2].fullLabel).toBeUndefined();
    // No thinning: every band keeps a label.
    expect(a.ticks.every((t) => t.label)).toBe(true);

    const boxes = axisLabelBoxes(l, LIGHT_THEME, measure).filter((b) => b.direction === 'x');
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toMatchObject({ axisId: 'x', direction: 'x', value: cats[0], index: 0, fullText: cats[0], truncated: true });
    expect(boxes[2].truncated).toBe(false);
    const b = boxes[1];
    expect(b.y).toBeGreaterThanOrEqual(l.plot.y + l.plot.height);
    expect(b.x + b.width / 2).toBeCloseTo(a.ticks[1].pos);
    expect(hitAxisLabel(l, LIGHT_THEME, b.x + 1, b.y + 1, measure)?.value).toBe(cats[1]);
    expect(hitAxisLabel(l, LIGHT_THEME, -100, -100, measure)).toBeNull();
  });

  it('returns y boxes left of the plot, and rotated boxes', () => {
    const l = layout([{ scaleType: 'band', data: ['a', 'b'] }], [{ min: 0, max: 100 }]);
    const ys = axisLabelBoxes(l, LIGHT_THEME, measure).filter((b) => b.direction === 'y');
    expect(ys.length).toBeGreaterThan(1);
    for (const b of ys) expect(b.x + b.width).toBeLessThanOrEqual(l.plot.x);
    const r = layout([{ scaleType: 'band', data: ['abcdefghij', 'b'], tickLabelAngle: -90 }]);
    const box = axisLabelBoxes(r, LIGHT_THEME, measure).find((b) => b.value === 'abcdefghij')!;
    expect(box.height).toBeCloseTo(measure('abcdefghij'));
    expect(box.y).toBeGreaterThan(r.plot.y + r.plot.height);
  });
});

describe('y axis label angle', () => {
  it('rotates y labels and reserves a line of width', () => {
    const flat = layout([{}], [{ scaleType: 'band', data: ['Category one', 'Category two'] }]);
    const vertical = layout([{}], [{ scaleType: 'band', data: ['Category one', 'Category two'], tickLabelAngle: -90 }]);
    expect(vertical.yAxes[0].box!.labelBlock).toBeLessThan(flat.yAxes[0].box!.labelBlock);
    const rotations: number[] = [];
    const { g } = recorder();
    (g as unknown as { rotate: (r: number) => void }).rotate = (r: number) => rotations.push(r);
    drawAxes(g, vertical, LIGHT_THEME);
    expect(rotations).toContain(-Math.PI / 2);
  });
});

describe('scale ticks', () => {
  it('accepts a time interval on time scales only', () => {
    const t = createScale({ type: 'time', domain: [new Date(2026, 0, 1).getTime(), new Date(2026, 0, 8).getTime()], range: [0, 100], domainLimit: 'strict' });
    expect(t.ticks(timeTickInterval('day'))).toHaveLength(8);
    const lin = createScale({ type: 'linear', domain: [0, 10], range: [0, 100] });
    expect(lin.ticks(timeTickInterval('day')).length).toBeGreaterThan(1);
  });
});
