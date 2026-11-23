import { LineChart } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

export default function CustomTooltip() {
  const scheme = useDemoScheme();
  return (
    <LineChart
      height={300}
      colorScheme={scheme}
      xAxis={[{ data: revenue.months, scaleType: 'point' }]}
      series={[
        { data: revenue.product, label: 'Product', area: true },
        { data: revenue.services, label: 'Services' },
      ]}
      renderTooltip={(ctx) => {
        const total = ctx.items.reduce((a, i) => a + (i.value ?? 0), 0);
        return (
          <div style={{ minWidth: 160 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{ctx.axisLabel}</div>
            {ctx.items.map((i) => (
              <div key={i.seriesId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: i.color }}>● {i.seriesLabel}</span>
                <b>${i.formattedValue}k</b>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--rgl-tooltip-border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>Total</span>
              <b>${total}k</b>
            </div>
          </div>
        );
      }}
    />
  );
}
