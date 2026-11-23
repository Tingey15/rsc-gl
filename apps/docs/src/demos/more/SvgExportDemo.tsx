import { useRef, useState } from 'react';
import { BarChart, type ChartHandle } from '@rsc-gl/react';
import { barSeries, lineSeries, renderToSVGString } from '@rsc-gl/core';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

export default function SvgExportDemo() {
  const scheme = useDemoScheme();
  const ref = useRef<ChartHandle>(null);
  const [svg, setSvg] = useState('');
  const [ssr, setSsr] = useState('');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="btn" data-primary onClick={async () => setSvg((await ref.current?.getSvg()) ?? '')}>
          Export vector SVG
        </button>
        <button
          className="btn"
          onClick={() =>
            setSsr(
              // Same engine, no DOM chart and no GPU: what a server would run.
              renderToSVGString(
                {
                  title: 'Server-rendered',
                  legend: true,
                  colorScheme: scheme,
                  xAxis: [{ data: revenue.months }],
                  series: [
                    { type: 'bar', data: revenue.product, label: 'Product' },
                    { type: 'line', data: revenue.services, label: 'Services', curve: 'monotoneX', showMark: true },
                  ],
                },
                { series: [barSeries, lineSeries], width: 560, height: 280 },
              ),
            )
          }
        >
          renderToSVGString (SSR)
        </button>
      </div>
      <BarChart ref={ref} title="Revenue" height={280} colorScheme={scheme} barLabel="value" xAxis={[{ data: revenue.months.slice(0, 6) }]} series={[{ data: revenue.product.slice(0, 6), label: 'Product' }, { data: revenue.services.slice(0, 6), label: 'Services' }]} />
      {svg && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Vector export ({(svg.length / 1024).toFixed(1)} KB, every mark and label is an SVG element):</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', marginTop: 6 }} dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      )}
      {ssr && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Rendered headlessly by renderToSVGString ({(ssr.length / 1024).toFixed(1)} KB):</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', marginTop: 6 }} dangerouslySetInnerHTML={{ __html: ssr }} />
        </div>
      )}
    </div>
  );
}
