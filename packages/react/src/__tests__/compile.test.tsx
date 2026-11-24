import { describe, expect, it } from 'vitest';
import { __compile as compile } from '../children/Chart';
import {
  Annotation,
  Axis,
  Bar,
  BarDirectLabel,
  ChartPopover,
  ChartTooltip,
  Donut,
  Legend,
  Line,
  LineDirectLabel,
  LineForecast,
  LinePointAnnotation,
  ReferenceLine,
  Scatter,
  SegmentLabel,
  Title,
  Trendline,
  TrendlineAnnotation,
} from '../children/components';

const rows = [
  { category: 'A', value: 10, series: 'Chrome' },
  { category: 'B', value: 20, series: 'Chrome' },
  { category: 'A', value: 5, series: 'Firefox' },
  { category: 'B', value: 8, series: 'Firefox' },
];

describe('composable chart: legacy parity', () => {
  it('draws one static color unless a color key is given', () => {
    const one = compile({ data: rows, children: <Bar /> });
    expect(one.options.series[0].groupBy).toBeUndefined();
    expect(one.options.series[0].color).toBeTruthy();
    const split = compile({ data: rows, children: <Bar color="series" /> });
    expect(split.options.series[0].groupBy).toBe('series');
  });

  it('names split series by their facet value (no mark prefix)', () => {
    const c = compile({ data: rows, children: <Bar name="sales" color="series" /> });
    expect(c.options.series[0].id).toBeUndefined();
  });

  it('prefixes ids only when two marks of one type would clash', () => {
    const c = compile({
      data: rows,
      children: (
        <>
          <Line color="series" dimension="category" />
          <Line color="series" dimension="category" metric="value" name="other" />
        </>
      ),
    });
    expect(c.options.series[0].id).toBeUndefined();
    expect(c.options.series[1].id).toBe('other');
  });

  it('scopes tooltips, popovers and callbacks to their own mark', () => {
    const click = () => {};
    const c = compile({
      data: rows,
      children: (
        <>
          <Bar color="series" onClick={click}>
            <ChartTooltip>{() => 'bar'}</ChartTooltip>
          </Bar>
          <Line color="series" dimension="category">
            <ChartPopover>{() => 'line'}</ChartPopover>
          </Line>
        </>
      ),
    });
    expect(c.interactions).toHaveLength(2);
    expect(c.interactions[0].onClick).toBe(click);
    expect(c.interactions[0].tooltip).toBeTruthy();
    expect(c.interactions[1].tooltip).toBeUndefined();
    expect(c.interactions[1].popover).toBeTruthy();
    // The line has no ChartTooltip, so it shows none; both marks are clickable.
    expect(c.options.series[1].disableTooltip).toBe(true);
    expect(c.options.series[0].cursor).toBe('pointer');
    expect(c.options.series[1].cursor).toBe('pointer');
  });

  it('passes excludeDataKeys to the engine', () => {
    const c = compile({
      data: rows,
      children: (
        <Bar>
          <ChartTooltip excludeDataKeys={['skip']}>{() => 'x'}</ChartTooltip>
        </Bar>
      ),
    });
    expect(c.options.series[0].excludeDataKeys).toEqual(['skip']);
  });

  it('legend clicks work without toggling', () => {
    const c = compile({ data: rows, children: <Legend onClick={() => {}} /> });
    expect(c.options.legend).toMatchObject({ toggleable: false, clickable: true });
    expect(c.options.onLegendClick).toBeTypeOf('function');
  });

  it('truncates legend labels to maxLength', () => {
    const c = compile({ data: rows, children: <Legend legendLabels={[{ seriesName: 'Chrome', label: 'Google Chrome', maxLength: 6 }]} /> });
    expect((c.options.legend as { labels: Record<string, string> }).labels.Chrome).toBe('Googl…');
  });

  it('uses the legacy defaults for titles, axes and reference lines', () => {
    const c = compile({
      data: rows,
      children: (
        <>
          <Title text="Sales" />
          <Axis position="left">
            <ReferenceLine value={10} label="Goal" />
          </Axis>
          <Bar />
        </>
      ),
    });
    expect(c.options.title).toMatchObject({ align: 'middle' });
    expect(c.options.yAxis?.[0]).toMatchObject({ disableLine: true, numberFormat: 'shortNumber' });
    expect(c.options.referenceLines?.[0]).toMatchObject({ labelPlacement: 'axis', labelColor: 'gray-800' });
  });

  it('maps axis labels, sub labels and tick limits', () => {
    const c = compile({
      data: rows,
      children: (
        <>
          <Axis position="bottom" truncateLabels labels={['A']} subLabels={[{ value: 'A', subLabel: 'first' }]} />
          <Axis position="left" tickCountLimit={4} tickCountMinimum={2} tickMinStep={1} currencyCode="EUR" title={['Revenue', '(EUR)']} />
          <Bar />
        </>
      ),
    });
    expect(c.options.xAxis?.[0]).toMatchObject({ labelLimit: 'band', labels: ['A'] });
    expect(c.options.yAxis?.[0]).toMatchObject({ maxTicks: 4, minTicks: 2, tickMinStep: 1, currencyCode: 'EUR', label: ['Revenue', '(EUR)'] });
  });

  it('moves the last series to a secondary axis with dualMetricAxis', () => {
    const c = compile({ data: rows, children: <Bar color="series" type="dodged" dualMetricAxis /> });
    expect(c.options.series).toHaveLength(2);
    expect(c.options.series[1].yAxisId).toBe(c.options.yAxis?.[1]?.id);
    expect(c.options.yAxis?.[1]?.position).toBe('right');
    expect((c.options.series[1].data as { series: string }[]).every((r) => r.series === 'Firefox')).toBe(true);
  });

  it('binds metricAxis to a named axis', () => {
    const c = compile({
      data: rows,
      children: (
        <>
          <Axis position="right" name="pct" />
          <Line metricAxis="pct" dimension="category" />
        </>
      ),
    });
    expect(c.options.series[0].yAxisId).toBe('pct');
  });

  it('scopes trendlines to their mark and maps their annotation', () => {
    const c = compile({
      data: rows,
      children: (
        <>
          <Bar />
          <Line dimension="category">
            <Trendline displayOnHover excludeDataKeys={['x']}>
              <TrendlineAnnotation prefix="Trend " badge />
            </Trendline>
          </Line>
        </>
      ),
    });
    expect(c.options.trendlines).toHaveLength(1);
    expect(c.options.trendlines![0]).toMatchObject({ markIndex: 1, displayOnHover: true, excludeDataKeys: ['x'], labelBadge: true, lineWidth: 2, opacity: 1 });
    expect(typeof c.options.trendlines![0].label === 'function' && c.options.trendlines![0].label(1500)).toBe('Trend 1.5K');
  });

  it('labels static points, and converts legacy point areas to diameters', () => {
    const data = [
      { datetime: 1, value: 4, peak: false },
      { datetime: 2, value: 9, peak: true },
    ];
    const c = compile({
      data,
      children: (
        <Line staticPoint="peak" pointSize={100}>
          <LinePointAnnotation />
        </Line>
      ),
    });
    const s = c.options.series[0] as { showMark: (p: { datum?: object }) => boolean; markSize: number };
    expect(s.showMark({ datum: data[1] })).toBe(true);
    expect(s.showMark({ datum: data[0] })).toBe(false);
    expect(s.markSize).toBe(10);
    expect(c.options.pointAnnotations).toHaveLength(1);
  });

  it('bar annotations and direct labels become bar labels', () => {
    const ann = compile({ data: rows, children: <Bar>{<Annotation textKey="series" />}</Bar> });
    expect(ann.options.series[0]).toMatchObject({ barLabelBadge: true, barLabelPlacement: 'outside' });
    const direct = compile({ data: rows, children: <Bar>{<BarDirectLabel position="middle" overflow="spill" />}</Bar> });
    expect(direct.options.series[0]).toMatchObject({ barLabel: 'value', barLabelPlacement: 'center', barLabelOverflow: 'spill' });
  });

  it('line direct labels and forecasts', () => {
    const data = [
      { datetime: 1, value: 4, forecast: null },
      { datetime: 2, value: 5, forecast: 5 },
      { datetime: 3, forecast: 7 },
    ];
    const c = compile({
      data,
      children: (
        <Line>
          <LineDirectLabel value="average" prefix="$" />
          <LineForecast metric="forecast" start={2} />
        </Line>
      ),
    });
    expect(c.options.directLabels).toMatchObject({ value: 'average', prefix: '$', markIndices: [0] });
    expect(c.options.series).toHaveLength(2);
    expect(c.options.series[1]).toMatchObject({ metric: 'forecast', lineType: 'dashed' });
    expect((c.options.series[1].data as unknown[]).length).toBe(2);
    expect(c.options.referenceLines?.some((r) => r.x === 2 && r.label === 'Forecast')).toBe(true);
  });

  it('segment labels show the label with the percent under it', () => {
    const c = compile({ data: rows, children: <Donut color="series">{<SegmentLabel percent labelKey="series" />}</Donut> });
    expect(c.options.series[0]).toMatchObject({ arcLabel: 'label', arcLabelSecondary: 'percent', arcLabelField: 'series', arcLabelPosition: 'outside' });
  });

  it('scatter uses legacy opacity and size range', () => {
    const c = compile({ data: [{ x: 1, value: 2 }], children: <Scatter /> });
    expect(c.options.series[0]).toMatchObject({ opacity: 1, sizeRange: [6, 16] });
  });

  it('accepts legacy highlightedItem values and padding objects', () => {
    const c = compile({ data: rows, idKey: 'category', highlightedItem: ['B'], padding: { top: 4 }, children: <Bar /> });
    expect(c.options.highlightedId).toBe('B');
    expect(c.options.idKey).toBe('category');
    expect(c.options.margin).toEqual({ top: 4 });
  });
});
