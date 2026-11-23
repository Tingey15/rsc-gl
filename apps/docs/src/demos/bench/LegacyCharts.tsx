// The legacy (Vega-based, SVG / Canvas) library, loaded only by the benchmark page.
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { Axis, Bar, Chart, Line, Scatter } from '@adobe/react-spectrum-charts';
import type { Scenario } from './scenarios';

export interface LegacyChartProps {
  scenario: Scenario;
  data: Record<string, unknown>[];
  renderer: 'svg' | 'canvas';
  height: number;
  colorScheme: 'light' | 'dark';
  /** Called when the Vega view has finished its first run. */
  onReady?: () => void;
}

export default function LegacyChart({ scenario, data, renderer, height, colorScheme, onReady }: LegacyChartProps) {
  const kind = scenario.kind;
  return (
    <Provider theme={defaultTheme} colorScheme={colorScheme} UNSAFE_style={{ background: 'transparent' }}>
      <Chart
        data={data as never}
        renderer={renderer}
        height={height}
        colorScheme={colorScheme}
        onVegaViewReady={(view) => {
          view.runAsync().then(() => onReady?.());
        }}
      >
        <Axis position="bottom" baseline ticks />
        <Axis position="left" grid />
        {kind === 'scatter' && <Scatter dimension="x" metric="y" />}
        {(kind === 'line' || kind === 'stream' || kind === 'many') && <Line dimension="x" metric="y" scaleType="linear" />}
        {kind === 'bar' && <Bar dimension="category" metric="value" />}
      </Chart>
    </Provider>
  );
}
