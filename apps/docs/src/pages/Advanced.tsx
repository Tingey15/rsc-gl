import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AreaChart,
  BarChart,
  BoxplotChart,
  CandlestickChart,
  ChordChart,
  FunnelChart,
  GanttChart,
  HeatmapChart,
  LineChart,
  MapChart,
  MorphChart,
  PieChart,
  RadarChart,
  RadialBarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
  VennChart,
  WaterfallChart,
  type ChartHandle,
} from '@rsc-gl/react';
import MorphDemo from '../demos/more/MorphDemo';
import MorphSrc from '../demos/more/MorphDemo.tsx?raw';
import SvgExportDemo from '../demos/more/SvgExportDemo';
import SvgExportSrc from '../demos/more/SvgExportDemo.tsx?raw';
import DecimationDemo from '../demos/more/DecimationDemo';
import DecimationSrc from '../demos/more/DecimationDemo.tsx?raw';
import api from '../generated/api.json';
import { Callout, Demo, H2, Page, useSite } from '../components/docs';
import { CodeBlock } from '../components/highlight';

export function MorphPage() {
  return (
    <Page title="Chart-type morphing" lede="The same data rendered as bars, horizontal bars, a pie, a donut or radial rings. Every item is a band with the same vertex count in every layout, so switching layouts interpolates the geometry on the GPU.">
      <Demo title="MorphDemo.tsx" code={MorphSrc}>
        <MorphDemo />
      </Demo>
    </Page>
  );
}

export function VectorExportPage() {
  return (
    <Page title="SVG export & server rendering" lede="Every mark emits its on-screen state as SVG, and axes and labels reuse the canvas drawing code through a recording context. The same pipeline runs headlessly with no DOM or GPU, for server-side rendering and emails.">
      <Demo title="SvgExportDemo.tsx" code={SvgExportSrc}>
        <SvgExportDemo />
      </Demo>
      <H2>On the server</H2>
      <CodeBlock
        code={`import { renderToSVGString, barSeries } from '@rsc-gl/core';

// Node.js, edge functions, build scripts: no browser APIs required.
const svg = renderToSVGString(
  { xAxis: [{ data: ['Q1', 'Q2', 'Q3'] }], series: [{ type: 'bar', data: [3, 7, 5] }] },
  { series: [barSeries], width: 600, height: 300 },
);`}
      />
      <Callout>The unit tests render bars, lines, areas, pies, heatmaps, waterfalls, funnels and treemaps this way in plain Node.</Callout>
    </Page>
  );
}

export function GpuComputePage() {
  return (
    <Page title="GPU compute & workers" lede="Large-data helpers that keep the main thread free: min-max decimation in a WebGPU compute shader (one invocation per pixel bucket) or in a Web Worker, with an automatic CPU fallback.">
      <Demo title="DecimationDemo.tsx" code={DecimationSrc}>
        <DecimationDemo />
      </Demo>
      <H2>Also on the GPU</H2>
      <ul>
        <li>
          <b>GPU picking</b> (3D): hovering renders an id pass into an offscreen target and reads one pixel back, so the front-most bar or point under
          the cursor wins even when items overlap.
        </li>
        <li>
          <b>SDF text</b> (3D): axis labels come from a signed-distance-field glyph atlas and are depth-tested in the scene, so bars in front hide
          the labels behind them.
        </li>
        <li>
          <b>Render targets & compute</b> are part of the HAL (<code>createRenderTarget</code>, <code>compute</code>) and available to custom marks.
        </li>
      </ul>
    </Page>
  );
}

interface ApiInterface {
  name: string;
  package: string;
  file: string;
  extends?: string;
  doc: string;
  props: { name: string; optional: boolean; type: string; doc: string }[];
}

export function GeneratedApiPage() {
  const [q, setQ] = useState('');
  const list = (api.interfaces as ApiInterface[]).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.props.some((p) => p.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <Page title="Generated API reference" lede={`Extracted from the TypeScript sources by scripts/gen-api.mjs (${api.interfaces.length} interfaces). Regenerate with npm run gen:api.`}>
      <input className="search" style={{ width: 320, maxWidth: '100%', display: 'block', marginBottom: 16 }} placeholder="Filter interfaces or props…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((i) => (
        <section key={`${i.package}:${i.name}`}>
          <h3 id={i.name} data-toc data-level="3">
            {i.name} <span className="badge">{i.package}</span>
          </h3>
          {i.extends && (
            <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>
              extends <code>{i.extends}</code>
            </p>
          )}
          {i.doc && <p style={{ marginTop: 4 }}>{i.doc}</p>}
          <table className="props">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Name</th>
                <th style={{ width: '38%' }}>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {i.props.map((p) => (
                <tr key={p.name}>
                  <td>
                    <code>
                      {p.name}
                      {p.optional ? '?' : ''}
                    </code>
                  </td>
                  <td>
                    <code>{p.type}</code>
                  </td>
                  <td>{p.doc || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </Page>
  );
}

/* ------------------------------------------------------------------ self-test */

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const vals = [12, 18, 9, 22, 15, 26];
const rows = months.map((m, i) => ({ label: m, value: vals[i] }));

function cases(scheme: 'light' | 'dark'): { name: string; el: (ref: React.Ref<ChartHandle>) => ReactNode }[] {
  const h = 160;
  const c = { height: h, colorScheme: scheme, hideLegend: true, skipAnimation: true } as const;
  return [
    { name: 'Bar', el: (r) => <BarChart ref={r} {...c} xAxis={[{ data: months }]} series={[{ data: vals }]} /> },
    { name: 'Line', el: (r) => <LineChart ref={r} {...c} xAxis={[{ data: months, scaleType: 'point' }]} series={[{ data: vals, lineWidth: 4 }]} /> },
    { name: 'Area', el: (r) => <AreaChart ref={r} {...c} xAxis={[{ data: months, scaleType: 'point' }]} series={[{ data: vals }]} /> },
    { name: 'Scatter', el: (r) => <ScatterChart ref={r} {...c} series={[{ data: vals.map((v, i) => ({ x: i, y: v })), markerSize: 14 }]} /> },
    { name: 'Pie', el: (r) => <PieChart ref={r} {...c} series={[{ data: rows.map((d, i) => ({ id: i, value: d.value })) }]} /> },
    { name: 'Heatmap', el: (r) => <HeatmapChart ref={r} {...c} series={[{ data: months.flatMap((m, i) => ['a', 'b'].map((y, j) => [m, y, i + j])) as never }]} /> },
    { name: 'Candlestick', el: (r) => <CandlestickChart ref={r} {...c} series={[{ data: vals.map((v, i) => ({ date: months[i], open: v, close: v + 4, high: v + 6, low: v - 2 })) }]} /> },
    { name: 'Gantt', el: (r) => <GanttChart ref={r} {...c} series={[{ data: [{ category: 'A', start: 0, end: 5 }, { category: 'B', start: 3, end: 9 }] }]} /> },
    { name: 'Waterfall', el: (r) => <WaterfallChart ref={r} {...c} series={[{ data: rows, dimension: 'label' }]} /> },
    { name: 'Boxplot', el: (r) => <BoxplotChart ref={r} {...c} series={[{ data: vals.flatMap((v, i) => [v, v + 3, v - 4, v + 8].map((x) => ({ category: months[i % 3], value: x }))) }]} /> },
    { name: 'Funnel', el: (r) => <FunnelChart ref={r} {...c} series={[{ data: rows }]} /> },
    { name: 'Treemap', el: (r) => <TreemapChart ref={r} {...c} series={[{ root: { name: 'r', children: rows.map((d) => ({ name: d.label, value: d.value })) } }]} /> },
    { name: 'Sankey', el: (r) => <SankeyChart ref={r} {...c} series={[{ links: [{ source: 'a', target: 'b', value: 5 }, { source: 'a', target: 'c', value: 3 }] }]} /> },
    { name: 'Venn', el: (r) => <VennChart ref={r} {...c} series={[{ sets: [{ sets: ['A'], size: 10 }, { sets: ['B'], size: 8 }, { sets: ['A', 'B'], size: 3 }] }]} /> },
    { name: 'Radar', el: (r) => <RadarChart ref={r} {...c} series={[{ metrics: months, data: vals }]} /> },
    { name: 'Sunburst', el: (r) => <SunburstChart ref={r} {...c} series={[{ root: { name: 'r', children: [{ name: 'a', children: [{ name: 'x', value: 3 }, { name: 'y', value: 2 }] }, { name: 'b', value: 4 }] } }]} /> },
    { name: 'Chord', el: (r) => <ChordChart ref={r} {...c} series={[{ matrix: [[0, 5, 3], [4, 0, 2], [1, 6, 0]] }]} /> },
    { name: 'Radial bars', el: (r) => <RadialBarChart ref={r} {...c} series={[{ data: rows.slice(0, 3) }]} /> },
    { name: 'Morph', el: (r) => <MorphChart ref={r} {...c} series={[{ data: rows, mode: 'donut' }]} /> },
    {
      name: 'Map',
      el: (r) => (
        <MapChart
          ref={r}
          {...c}
          series={[{ geoJson: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'sq', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-10, -10], [-10, 10], [10, 10], [10, -10], [-10, -10]]] } }] }, regions: [{ id: 'sq', value: 1 }], projection: 'equirectangular' }]}
        />
      ),
    },
  ];
}

interface Result {
  coverage: number;
  svgMarks: number;
  ok: boolean;
}

export function SelfTestPage() {
  const { scheme, activeBackend } = useSite();
  const list = useMemo(() => cases(scheme), [scheme]);
  const refs = useRef<(ChartHandle | null)[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setResults({});
    await new Promise((r) => setTimeout(r, 800));
    const out: Record<string, Result> = {};
    for (let i = 0; i < list.length; i++) {
      const h = refs.current[i];
      try {
        const canvas = await h!.chart!.toCanvas();
        const g = canvas.getContext('2d')!;
        const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
        const bg = [d[0], d[1], d[2]];
        let diff = 0;
        let total = 0;
        for (let k = 0; k < d.length; k += 4 * 7) {
          total++;
          if (Math.abs(d[k] - bg[0]) + Math.abs(d[k + 1] - bg[1]) + Math.abs(d[k + 2] - bg[2]) > 40) diff++;
        }
        const svg = h!.chart!.toSVG();
        const svgMarks = (svg.match(/<path d="[^"]*" fill="rgb/g) ?? []).length;
        const coverage = diff / total;
        out[list[i].name] = { coverage, svgMarks, ok: coverage > 0.01 && svgMarks > 0 };
      } catch {
        out[list[i].name] = { coverage: 0, svgMarks: 0, ok: false };
      }
      setResults({ ...out });
    }
    setRunning(false);
  };

  useEffect(() => {
    const t = setTimeout(run, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passed = Object.values(results).filter((r) => r.ok).length;
  return (
    <Page title="Rendering self-test" lede="Renders every chart type on the active GPU backend, reads the pixels back, and checks the vector export. Switch the backend in the top bar and re-run.">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <button className="btn" data-primary onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run self-test'}
        </button>
        <span className="pill" data-ok={passed === list.length} data-testid="selftest-summary">
          {activeBackend?.toUpperCase() ?? 'GPU'}: {passed}/{list.length} passed
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {list.map((c, i) => {
          const r = results[c.name];
          return (
            <div key={c.name} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                <span>{c.name}</span>
                <span style={{ color: !r ? 'var(--muted)' : r.ok ? '#1f9d62' : '#d9475b' }} data-testid={`selftest-${c.name}`}>
                  {!r ? '…' : r.ok ? `✓ ${(r.coverage * 100).toFixed(0)}% · ${r.svgMarks} svg` : '✗ failed'}
                </span>
              </div>
              {c.el((h) => {
                refs.current[i] = h;
              })}
            </div>
          );
        })}
      </div>
    </Page>
  );
}
