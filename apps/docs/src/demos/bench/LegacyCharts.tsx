// The legacy (Vega-based, SVG / Canvas) library, loaded only by the benchmark page.
import { memo, useCallback, useRef } from 'react';
import { Axis, Bar, Chart, ChartTooltip, Line, Scatter } from '@adobe/react-spectrum-charts';
import { BAR_GAP, markerSize, type Scenario } from './scenarios';

export interface LegacyChartProps {
  scenario: Scenario;
  data: Record<string, unknown>[];
  renderer: 'svg' | 'canvas';
  height: number;
  colorScheme: 'light' | 'dark';
  /** Called once, when the first Vega view has finished its first run. */
  onReady?: () => void;
}

const fmt = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : String(v));

/**
 * Memoized, with a stable view callback: an inline callback is a dependency of
 * the library's view setup, so every parent re-render would rebuild the whole
 * Vega view and charge the legacy library for work the benchmark caused.
 * (Chart renders its own theme provider, so none is added here.)
 */
function LegacyChart({ scenario, data, renderer, height, colorScheme, onReady }: LegacyChartProps) {
  const kind = scenario.kind;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const reported = useRef(false);
  const onView = useCallback((view: { runAsync(): Promise<unknown> }) => {
    void view.runAsync().then(() => {
      if (reported.current) return;
      reported.current = true;
      readyRef.current?.();
    });
  }, []);
  return (
    <Chart data={data as never} renderer={renderer} height={height} colorScheme={colorScheme} onVegaViewReady={onView as never}>
      <Axis position="bottom" baseline ticks />
      <Axis position="left" grid />
      {/* Same marks, sizes, opacity and hover tooltip as the RSC-GL and D3 charts. */}
      {kind === 'scatter' && (
        <Scatter dimension="x" metric="y" size={{ value: markerSize(data.length) }} blend="normal">
          <ChartTooltip>{(d) => `(${fmt(d.x)}, ${fmt(d.y)})`}</ChartTooltip>
        </Scatter>
      )}
      {(kind === 'line' || kind === 'stream' || kind === 'many') && (
        <Line dimension="x" metric="y" scaleType="linear">
          <ChartTooltip>{(d) => `${d.x}: ${fmt(d.y)}`}</ChartTooltip>
        </Line>
      )}
      {kind === 'bar' && (
        <Bar dimension="category" metric="value" paddingRatio={BAR_GAP} hasSquareCorners>
          <ChartTooltip>{(d) => `${d.category}: ${d.value}`}</ChartTooltip>
        </Bar>
      )}
    </Chart>
  );
}

export default memo(LegacyChart);

/** Rendering engine version, recorded in exported results. */
export { version as vegaVersion } from 'vega';
