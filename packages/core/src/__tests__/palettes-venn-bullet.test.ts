import { describe, expect, it } from 'vitest';
import { bulletDomain, bulletSeries, vennLayout, vennSeries } from '../series/standalone';
import { renderToSVGString } from '../svg/ssr';
import { CATEGORICAL_16, colorSchemes, getColorSchemeColors, getColorValue, getInterpolator, PALETTES, resolveColor, resolvePalette } from '../theme/colors';

describe('legacy palettes', () => {
  it('resolves legacy names to their exact values', () => {
    expect(resolvePalette('categorical6', 'light')).toEqual(['#0fb5ae', '#4046ca', '#f68511', '#de3d82', '#7e84fa', '#72e06a']);
    expect(resolvePalette('categorical12', 'light')).toHaveLength(12);
    expect(resolvePalette('categorical16', 'light').slice(12)).toEqual(['#5aa9fa', '#c038cc', '#f56bb7', '#ffe22e']);
    expect(resolvePalette('sequentialViridis5', 'light')).toEqual(['#fde725', '#7ad151', '#1f988b', '#39568c', '#440154']);
    // The legacy 5-step sequential palettes start with the 400 stop, then 100.
    expect(resolvePalette('sequentialMagma5', 'light').slice(0, 2)).toEqual(['#fe9f6d', '#fcfdbf']);
    expect(resolvePalette('divergentRedBlue5', 'light')).toEqual(['#49021e', '#de6f86', '#faf0ff', '#6095c9', '#0c1b4b']);
    expect(resolvePalette('divergentOrangeYellowSeafoam15', 'light')).toHaveLength(15);
    expect(resolvePalette('sequentialForest16', 'light')).toHaveLength(16);
  });

  it('switches only the s2 categorical palettes in dark mode', () => {
    expect(resolvePalette('s2Categorical6', 'light')).toEqual(['#5424db', '#d92361', '#e86a00', '#5d89ff', '#9a47e2', '#f24cb8']);
    expect(resolvePalette('s2Categorical6', 'dark')).toEqual(['#99a1ff', '#ff3377', '#b94900', '#345bf8', '#ad69e9', '#c4278a']);
    expect(resolvePalette('s2Categorical20', 'dark')).toHaveLength(20);
    expect(resolvePalette('categorical16', 'dark')).toEqual(resolvePalette('categorical16', 'light'));
    expect(getColorSchemeColors('s2Categorical12', 'dark')).toEqual(resolvePalette('s2Categorical12', 'dark'));
  });

  it('never falls back to the default palette for a legacy name', () => {
    for (const name of Object.keys(colorSchemes)) {
      for (const scheme of ['light', 'dark'] as const) {
        const p = resolvePalette(name, scheme);
        expect(p, name).not.toBe(CATEGORICAL_16);
        expect(p.every((c) => /^#[0-9a-f]{6}$/.test(c)), name).toBe(true);
      }
    }
    expect(Object.keys(colorSchemes)).toHaveLength(31);
  });

  it('keeps the RSC-GL palettes and the generic ramps', () => {
    expect(resolvePalette(undefined, 'light')).toBe(CATEGORICAL_16);
    expect(resolvePalette('rsc16', 'light')).toBe(CATEGORICAL_16);
    expect(PALETTES.ocean).toHaveLength(8);
    expect(resolvePalette('monoBlue', 'dark')).toBe(PALETTES.monoBlue);
    expect(resolvePalette('sequentialViridis6', 'light')).toHaveLength(6);
    expect(resolvePalette('divergingRedBlue6', 'light')).toHaveLength(6);
    expect(resolvePalette('sequentialRose7', 'light')).toHaveLength(7);
    expect(resolvePalette('noSuchPalette', 'light')).toBe(CATEGORICAL_16);
    expect(getInterpolator('viridis')).toBeTypeOf('function');
    expect(getInterpolator('sequentialMagma16')!(0)).toBe('rgb(252, 253, 191)');
  });
});

describe('legacy colour tokens', () => {
  it('returns the exact legacy value per scheme', () => {
    expect(getColorValue('gray-800', 'light')).toBe('#222222');
    expect(getColorValue('gray-800', 'dark')).toBe('#ebebeb');
    expect(getColorValue('blue-500', 'light')).toBe('#78bbfa');
    expect(getColorValue('blue-500', 'dark')).toBe('#005cc8');
    expect(getColorValue('categorical-100', 'dark')).toBe('#0fb5ae');
    expect(getColorValue('static-blue-500', 'light')).toBe('#82c1fb');
    expect(getColorValue('static-blue-500', 'dark')).toBe('#82c1fb');
    expect(getColorValue('static-blue', 'light')).toBe('#1473e6');
    expect(getColorValue('static-purple-900', 'light')).toBe(getColorValue('static-pruple-900', 'light'));
    expect(getColorValue('s2-gray-800', 'light')).toBe('#292929');
    expect(getColorValue('s2-gray-800', 'dark')).toBe('#dbdbdb');
    expect(getColorValue('sequential-viridis-1600', 'light')).toBe('#440154');
  });

  it('passes other strings through', () => {
    expect(getColorValue('#ff0000', 'light')).toBe('#ff0000');
    expect(getColorValue('rebeccapurple', 'dark')).toBe('rebeccapurple');
    expect(getColorValue('brown-900', 'light')).toBe('brown-900');
  });

  it('resolveColor uses the legacy values and keeps the old fallbacks', () => {
    expect(resolveColor('gray-800', 'light')).toEqual([34 / 255, 34 / 255, 34 / 255, 1]);
    expect(resolveColor('gray-900', 'dark')).toEqual([1, 1, 1, 1]);
    expect(resolveColor('static-gray-900', 'dark')).toEqual([0, 0, 0, 1]);
    expect(resolveColor('transparent')[3]).toBe(0);
    expect(resolveColor('#ff0000')).toEqual([1, 0, 0, 1]);
    // Not a legacy token: still synthesised.
    const brown = resolveColor('brown-900', 'light');
    expect(brown[3]).toBe(1);
    expect(brown.slice(0, 3)).not.toEqual([0, 0, 0]);
    // Cached results are copies.
    const a = resolveColor('blue-500');
    a[0] = 9;
    expect(resolveColor('blue-500')[0]).toBeCloseTo(120 / 255);
  });
});

describe('venn', () => {
  const sets5 = [
    { sets: ['A'], size: 10 },
    { sets: ['B'], size: 8 },
    { sets: ['C'], size: 6 },
    { sets: ['D'], size: 5 },
    { sets: ['E'], size: 4 },
    { sets: ['A', 'B'], size: 2, label: 'Both' },
    { sets: ['B', 'C'], size: 1 },
    { sets: ['C', 'D'], size: 1 },
    { sets: ['D', 'E'], size: 1 },
    { sets: ['A', 'B', 'C'], size: 0.5 },
  ];
  const render = (sets: typeof sets5, extra: object = {}) => renderToSVGString({ series: [{ type: 'venn', sets, ...extra } as never] }, { series: [vennSeries], width: 400, height: 300 });
  const circles = (svg: string) => (svg.match(/<path d="M[\d.]+,[\d.]+a/g) ?? []).length;

  it('renders 4 and 5 sets without throwing', () => {
    const four = sets5.filter((s) => !s.sets.includes('E'));
    expect(circles(render(four))).toBe(4);
    expect(circles(render(sets5))).toBe(5);
  });

  it('labels intersections with their label, else their value', () => {
    const svg = render(sets5);
    expect(svg).toContain('>Both</text>');
    expect(svg).toContain('>1</text>');
  });

  it('reads rows through setsField, metric and labelField', () => {
    const rows = [
      { members: ['X'], n: 5, name: 'Ex' },
      { members: ['Y'], n: 5, name: 'Why' },
      { members: ['X', 'Y'], n: 1, name: 'Overlap' },
    ];
    const svg = renderToSVGString({ series: [{ type: 'venn', data: rows, setsField: 'members', metric: 'n', labelField: 'name' } as never] }, { series: [vennSeries], width: 300, height: 200 });
    expect(circles(svg)).toBe(2);
    expect(svg).toContain('>Ex</text>');
    expect(svg).toContain('>Overlap</text>');
  });

  it('matches requested overlaps and keeps unrelated sets apart', () => {
    const r = [3, 2.5, 2, 1.5].map((x) => x);
    const want: Record<string, number> = { '0,1': 4, '1,2': 2, '2,3': 1 };
    const pos = vennLayout(r, (i, j) => want[`${Math.min(i, j)},${Math.max(i, j)}`] ?? 0);
    const d = (i: number, j: number) => Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
    expect(d(0, 1)).toBeLessThan(r[0] + r[1]);
    expect(d(2, 3)).toBeLessThan(r[2] + r[3]);
    expect(d(0, 3)).toBeGreaterThanOrEqual(r[0] + r[3] - 1e-6);
    expect(pos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('orients the second-largest circle', () => {
    const right = vennLayout([2, 1], () => 1);
    expect(right[1].x).toBeGreaterThan(0);
    expect(Math.abs(right[1].y)).toBeLessThan(1e-9);
    const below = vennLayout([2, 1], () => 1, '90deg');
    expect(below[1].y).toBeGreaterThan(0);
    expect(Math.abs(below[1].x)).toBeLessThan(1e-9);
    const left = vennLayout([2, 1], () => 1, 180);
    expect(left[1].x).toBeLessThan(0);
  });
});

describe('bullet', () => {
  const values = [50, 80];
  const targets = [90, null];

  it('computes the legacy scale domains', () => {
    expect(bulletDomain({}, values, targets)).toBeUndefined();
    // normal: largest metric or rounded 1.05 x target.
    expect(bulletDomain({ scaleType: 'normal', maxScaleValue: 500 }, values, targets)).toEqual([0, 95]);
    // fixed: only fixed uses maxScaleValue as the maximum (default 100, falls back to maxValue).
    expect(bulletDomain({ scaleType: 'fixed', maxScaleValue: 200 }, values, targets)).toEqual([0, 200]);
    expect(bulletDomain({ scaleType: 'fixed' }, values, targets)).toEqual([0, 100]);
    expect(bulletDomain({ scaleType: 'fixed', maxValue: 150 }, values, targets)).toEqual([0, 150]);
    // flexible: maxScaleValue until the data passes it.
    expect(bulletDomain({ scaleType: 'flexible', maxScaleValue: 300 }, values, targets)).toEqual([0, 300]);
    expect(bulletDomain({ scaleType: 'flexible', maxScaleValue: 60 }, values, targets)).toEqual([0, 95]);
    expect(bulletDomain({ scaleType: 'normal' }, [-20, 10], [null, null])).toEqual([-20, 10]);
  });

  const render = (extra: object) =>
    renderToSVGString({ series: [{ type: 'bullet', data: [{ label: 'x', value: 50, target: 60 }], ...extra } as never] }, { series: [bulletSeries], width: 400, height: 200 });
  /** Width of the first path filled with the given rgb() colour. */
  const widthOf = (svg: string, fill: string) => {
    const m = new RegExp(`<path d="M([\\d.]+),[\\d.]+H([\\d.]+)A3[^"]*" fill="${fill.replace(/[()]/g, '\\$&')}"`).exec(svg);
    return m ? Number(m[2]) - Number(m[1]) + 6 : NaN;
  };

  it('sizes the bar by scale type', () => {
    const fixed = widthOf(render({ scaleType: 'fixed', maxScaleValue: 200, color: '#ff0000' }), 'rgb(255,0,0)');
    const normal = widthOf(render({ scaleType: 'normal', maxScaleValue: 200, color: '#ff0000' }), 'rgb(255,0,0)');
    const flexible = widthOf(render({ scaleType: 'flexible', maxScaleValue: 200, color: '#ff0000' }), 'rgb(255,0,0)');
    expect(fixed).toBeCloseTo(flexible, 5);
    expect(normal / fixed).toBeCloseTo(200 / 63, 1);
  });

  it('supports thresholdMin / thresholdMax, thresholdBarColor and the target options', () => {
    const thresholds = [{ thresholdMax: 40, fill: '#ff0000' }, { thresholdMin: 40, thresholdMax: 70, fill: '#00ff00' }, { thresholdMin: 70, fill: '#0000ff' }];
    const svg = render({ scaleType: 'fixed', maxScaleValue: 100, thresholds, thresholdBarColor: true, showTargetValue: true, labelPosition: 'top' });
    // The bar takes the fill of the band its value (50) falls in.
    expect(svg).toMatch(/fill="rgb\(0,255,0\)"(?! fill-opacity)/);
    expect(svg).toContain('Target: 60');
    const hidden = render({ showTarget: false, showTargetValue: true });
    expect(hidden).not.toContain('Target:');
  });

  it('keeps the old threshold form and lays out rows', () => {
    const old = render({ thresholds: [{ value: 30, color: '#ff0000' }, { value: 100, color: '#00ff00' }] });
    expect(old).toContain('fill-opacity="0.35"');
    const rows = renderToSVGString(
      { series: [{ type: 'bullet', direction: 'row', data: [{ label: 'a', value: 1, target: 2 }, { label: 'b', value: 2, target: 3 }] } as never] },
      { series: [bulletSeries], width: 400, height: 200 },
    );
    expect(rows).toContain('>a</text>');
    expect(rows).toContain('>b</text>');
  });
});
