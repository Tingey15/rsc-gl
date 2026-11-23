import { useRef, useState } from 'react';
import { BarChart, type ChartHandle } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

export default function ExportDemo() {
  const scheme = useDemoScheme();
  const ref = useRef<ChartHandle>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="btn" data-primary onClick={() => ref.current?.download('revenue')}>
          Download PNG
        </button>
        <button
          className="btn"
          onClick={() =>
            ref.current
              ?.copy()
              .then(() => setStatus('Copied to clipboard'))
              .catch((e: Error) => setStatus(`Copy failed: ${e.message}`))
          }
        >
          Copy image
        </button>
        <button className="btn" onClick={async () => setPreview((await ref.current?.getBase64Png()) ?? null)}>
          getBase64Png()
        </button>
        <button className="btn" onClick={() => ref.current?.exportAsImage({ type: 'image/jpeg', fileName: 'revenue' })}>
          Export JPEG
        </button>
        <span style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'center' }}>{status}</span>
      </div>
      <BarChart ref={ref} title="Revenue by month" height={300} colorScheme={scheme} xAxis={[{ data: revenue.months }]} series={[{ data: revenue.product, label: 'Product' }, { data: revenue.services, label: 'Services' }]} />
      {preview && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Exported image (GPU canvas + overlays composited):</div>
          <img src={preview} alt="Exported chart" style={{ maxWidth: 360, border: '1px solid var(--border)', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
