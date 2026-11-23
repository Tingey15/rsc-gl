import { useState } from 'react';
import { BarChart, LineChart, type ItemIdentifier } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

/** Two charts share one controlled highlight. */
export default function SyncedHighlight() {
  const scheme = useDemoScheme();
  const [item, setItem] = useState<ItemIdentifier | null>(null);
  const series = [
    { id: 'product', data: revenue.product, label: 'Product' },
    { id: 'services', data: revenue.services, label: 'Services' },
  ];
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
        Highlighted: <code>{item ? `${item.seriesId}${item.dataIndex !== undefined ? ` #${item.dataIndex}` : ''}` : 'none'}</code>
      </div>
      <div className="row">
        <BarChart height={240} colorScheme={scheme} xAxis={[{ data: revenue.months }]} series={series} highlightedItem={item} onHighlightChange={setItem} />
        <LineChart
          height={240}
          colorScheme={scheme}
          xAxis={[{ data: revenue.months, scaleType: 'point' }]}
          series={series.map((s) => ({ ...s, showMark: true }))}
          highlightedItem={item}
          onHighlightChange={setItem}
          tooltip={{ trigger: 'item' }}
        />
      </div>
    </div>
  );
}
