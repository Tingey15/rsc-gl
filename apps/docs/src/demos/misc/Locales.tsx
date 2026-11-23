import { useState } from 'react';
import { BarChart, type NumberFormat } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const LOCALES = ['en-US', 'de-DE', 'fr-FR', 'ja-JP', 'pt-BR', 'ar-EG', 'hi-IN'];
const FORMATS: NumberFormat[] = ['standardNumber', 'shortNumber', 'currency', 'shortCurrency', ',.2f', '$.3~s'];

export default function Locales() {
  const scheme = useDemoScheme();
  const [locale, setLocale] = useState('de-DE');
  const [format, setFormat] = useState<NumberFormat>('shortCurrency');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <select className="btn" value={locale} onChange={(e) => setLocale(e.target.value)}>
          {LOCALES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select className="btn" value={String(format)} onChange={(e) => setFormat(e.target.value as NumberFormat)}>
          {FORMATS.map((f) => (
            <option key={String(f)}>{String(f)}</option>
          ))}
        </select>
      </div>
      <BarChart
        height={300}
        colorScheme={scheme}
        locale={locale}
        barLabel="value"
        xAxis={[{ data: ['North', 'South', 'East', 'West'] }]}
        yAxis={[{ numberFormat: format }]}
        series={[{ data: [1234567, 2345678, 987654, 1876543], label: 'Revenue', numberFormat: format }]}
      />
    </div>
  );
}
