import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BarChart, LineChart, ScatterChart, type ChartHandle } from '@rsc-gl/react';
import { Callout, H2, Page } from '../components/docs';
import { useSite } from '../components/docs';
import { SCENARIOS, makeData, type Dataset, type Scenario } from '../demos/bench/scenarios';

// The legacy library is large; load it only on this page.
const LegacyChart = lazy(() => import('../demos/bench/LegacyCharts'));
const LEGACY = 'Legacy library';
const OURS = 'RSC-GL';

interface Result {
  scenario: string;
  lib: string;
  renderer: string;
  firstPaint: number;
  longTasks: number;
  fps: number;
  worstFrame: number;
  domNodes: number;
  note?: string;
}

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** Long tasks (main thread blocked > 50 ms) observed while `fn` runs. */
function trackLongTasks() {
  let total = 0;
  let po: PerformanceObserver | null = null;
  try {
    po = new PerformanceObserver((l) => l.getEntries().forEach((e) => (total += e.duration)));
    po.observe({ type: 'longtask', buffered: false });
  } catch {
    /* not supported */
  }
  return () => {
    po?.disconnect();
    return total;
  };
}

/** Moves a synthetic pointer across the plot for `ms` and reports frame stats. */
async function hoverSweep(target: Element | null, ms = 1500): Promise<{ fps: number; worst: number }> {
  const deltas: number[] = [];
  const r = target?.getBoundingClientRect();
  const t0 = await nextFrame();
  let last = t0;
  for (;;) {
    const t = await nextFrame();
    deltas.push(t - last);
    last = t;
    if (target && r) {
      const k = ((t - t0) / ms) % 1;
      const ev = { clientX: r.left + r.width * (0.05 + 0.9 * k), clientY: r.top + r.height * (0.5 + 0.3 * Math.sin(k * 12)), bubbles: true };
      target.dispatchEvent(new PointerEvent('pointermove', ev));
      target.dispatchEvent(new MouseEvent('mousemove', ev));
    }
    if (t - t0 >= ms) break;
  }
  return { fps: (deltas.length * 1000) / (last - t0), worst: Math.max(...deltas) };
}

/** Our chart, reporting its first painted frame. */
function OurChart({ scenario, data, onReady, sampling, height }: { scenario: Scenario; data: Dataset; onReady: () => void; sampling: boolean; height: number }) {
  const ref = useRef<ChartHandle>(null);
  const scheme = useSite().scheme;
  useLayoutEffect(() => {
    let done = false;
    const tryAttach = () => {
      const c = ref.current?.chart;
      if (!c) return requestAnimationFrame(tryAttach);
      const off = c.on('render', () => {
        if (done) return;
        done = true;
        off();
        onReady();
      });
    };
    tryAttach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const positions = useMemo(() => {
    if (scenario.kind !== 'scatter') return null;
    const p = new Float32Array(data.xs.length * 2);
    for (let i = 0; i < data.xs.length; i++) {
      p[i * 2] = data.xs[i];
      p[i * 2 + 1] = data.ys[i];
    }
    return p;
  }, [scenario, data]);
  const xs = useMemo(() => Array.from(data.xs), [data]);
  const ys = useMemo(() => Array.from(data.ys), [data]);
  if (scenario.kind === 'scatter')
    return <ScatterChart ref={ref} height={height} colorScheme={scheme} hideLegend skipAnimation series={[{ positions: positions!, markerSize: data.xs.length > 100_000 ? 2 : 4, label: 'Points' } as never]} />;
  if (scenario.kind === 'bar') return <BarChart ref={ref} height={height} colorScheme={scheme} hideLegend skipAnimation xAxis={[{ data: data.categories! }]} series={[{ data: ys, label: 'Value' }]} />;
  return <LineChart ref={ref} height={height} colorScheme={scheme} hideLegend skipAnimation xAxis={[{ data: xs, scaleType: 'linear' }]} series={[{ data: ys, curve: 'linear', label: 'Value', sampling: sampling ? undefined : 'none' } as never]} />;
}

/** Live-update scenario: both sides get the same 30 updates per second. */
function useStream(base: Dataset | null, active: boolean): Dataset | null {
  const [d, setD] = useState(base);
  useEffect(() => setD(base), [base]);
  useEffect(() => {
    if (!active || !base) return;
    let t = base.xs.length;
    let v = base.ys[base.ys.length - 1];
    const id = setInterval(() => {
      setD((cur) => {
        if (!cur) return cur;
        const n = cur.xs.length;
        const xs = new Float64Array(n);
        const ys = new Float64Array(n);
        xs.set(cur.xs.subarray(1));
        ys.set(cur.ys.subarray(1));
        v += Math.random() - 0.5;
        xs[n - 1] = t++;
        ys[n - 1] = v;
        const rows = new Array(n);
        for (let i = 0; i < n; i++) rows[i] = { x: xs[i], y: ys[i] };
        return { xs, ys, rows };
      });
    }, 33);
    return () => clearInterval(id);
  }, [active, base]);
  return d;
}

type Phase = 'idle' | 'legacy' | 'ours' | 'done';

export function BenchmarkPage() {
  const scheme = useSite().scheme;
  const [scenarioId, setScenarioId] = useState('scatter-10k');
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const [renderer, setRenderer] = useState<'canvas' | 'svg'>('canvas');
  const [runLegacy, setRunLegacy] = useState(true);
  const [allowHeavy, setAllowHeavy] = useState(false);
  const [sampling, setSampling] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [data, setData] = useState<Dataset | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState('');
  const [mountLegacy, setMountLegacy] = useState(false);
  const [mountOurs, setMountOurs] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const legacyBox = useRef<HTMLDivElement>(null);
  const oursBox = useRef<HTMLDivElement>(null);
  const ready = useRef<(() => void) | null>(null);
  const readyCount = useRef(0);
  const [streamTarget, setStreamTarget] = useState(OURS);
  const streamData = useStream(scenario.kind === 'stream' ? data : null, streaming);
  // Only the library being measured receives live updates.
  const shownFor = (lib: string) => (scenario.kind === 'stream' && lib === streamTarget ? streamData : data);
  const charts = scenario.charts ?? 1;
  const heavyBlocked = runLegacy && scenario.heavy && !allowHeavy;

  // Warm the legacy bundle so its download is not counted as render time.
  useEffect(() => {
    void import('../demos/bench/LegacyCharts');
  }, []);

  const onChartReady = () => {
    readyCount.current++;
    if (readyCount.current >= charts) ready.current?.();
  };

  const measure = async (lib: string, box: HTMLDivElement | null, mount: () => void, rendererName: string): Promise<Result> => {
    readyCount.current = 0;
    const stopLong = trackLongTasks();
    const t0 = performance.now();
    const isReady = new Promise<void>((r) => (ready.current = r));
    mount();
    await isReady;
    await nextFrame();
    await nextFrame();
    const firstPaint = performance.now() - t0;
    const longTasks = stopLong();
    const plot = lib === OURS ? (box?.querySelector('.rgl-plot') ?? null) : (box?.querySelector('canvas.marks, svg.marks') ?? null);
    let frames: { fps: number; worst: number };
    if (scenario.kind === 'stream') {
      setStreaming(true);
      frames = await hoverSweep(null, 3000);
      setStreaming(false);
    } else frames = await hoverSweep(plot, 1500);
    return { scenario: scenario.label, lib, renderer: rendererName, firstPaint, longTasks, fps: frames.fps, worstFrame: frames.worst, domNodes: box?.querySelectorAll('*').length ?? 0 };
  };

  const run = async () => {
    if (heavyBlocked) return;
    setMountLegacy(false);
    setMountOurs(false);
    setResults((r) => r);
    setStatus('Generating data…');
    await nextFrame();
    const d = makeData(scenario);
    setData(d);
    await nextFrame();
    // RSC-GL first: an idle GPU chart does no work, so it cannot disturb the legacy measurement
    // (the reverse is not true: a mounted legacy view reacts to layout changes around it).
    const out: Result[] = [];
    setPhase('ours');
    setStreamTarget(OURS);
    setStatus(`Rendering with ${OURS}…`);
    await nextFrame();
    out.push(await measure(OURS, oursBox.current, () => setMountOurs(true), 'webgpu / webgl2'));
    if (runLegacy) {
      setPhase('legacy');
      setStreamTarget(LEGACY);
      setStatus(`Rendering with the ${LEGACY.toLowerCase()} (${renderer})…`);
      await nextFrame();
      out.push(await measure(LEGACY, legacyBox.current, () => setMountLegacy(true), renderer));
    }
    setResults((r) => [...out.reverse(), ...r]);
    setPhase('done');
    setStatus('');
  };

  const latest = results.slice(0, runLegacy ? 2 : 1);
  const legacyR = latest.find((r) => r.lib === LEGACY && r.scenario === scenario.label);
  const oursR = latest.find((r) => r.lib === OURS && r.scenario === scenario.label);
  const speedup = legacyR && oursR ? legacyR.firstPaint / oursR.firstPaint : null;
  const height = scenario.kind === 'many' ? 110 : 320;

  const panels = (lib: string): ReactNode => {
    const shown = shownFor(lib);
    if (!shown) return null;
    const list = Array.from({ length: charts }, (_, i) => i);
    if (lib === LEGACY)
      return mountLegacy ? (
        <Suspense fallback={<div style={{ height }}>Loading…</div>}>
          <div style={{ display: 'grid', gridTemplateColumns: charts > 1 ? 'repeat(4, minmax(0, 1fr))' : '1fr', gap: 6 }}>
            {list.map((i) => (
              <LegacyChart key={i} scenario={scenario} data={shown.rows} renderer={renderer} height={height} colorScheme={scheme} onReady={onChartReady} />
            ))}
          </div>
        </Suspense>
      ) : null;
    return mountOurs ? (
      <div style={{ display: 'grid', gridTemplateColumns: charts > 1 ? 'repeat(4, minmax(0, 1fr))' : '1fr', gap: 6 }}>
        {list.map((i) => (
          <OurChart key={i} scenario={scenario} data={shown} onReady={onChartReady} sampling={sampling} height={height} />
        ))}
      </div>
    ) : null;
  };

  const metric = (r: Result | undefined, k: keyof Result, fmt: (v: number) => string) => (r ? fmt(r[k] as number) : '—');
  const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(0)} ms`);

  return (
    <Page
      title="Benchmark: GPU vs SVG / Canvas"
      lede="The same data, rendered live in your browser by the legacy Vega-based library (SVG or Canvas 2D) and by RSC-GL (WebGPU / WebGL2). Pick a scenario and run it."
    >
      <Callout kind="warning">
        Large legacy runs (100,000+ points) can freeze this tab for a long time or run out of memory: each mark becomes a scene-graph object (and, with SVG,
        a DOM node). They only run after you tick the confirmation box. Both libraries run unminified development builds here; production builds are faster
        for both.
      </Callout>

      <div style={{ display: 'grid', gap: 10, margin: '14px 0' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SCENARIOS.map((s) => (
            <button key={s.id} className="btn" data-primary={s.id === scenarioId} disabled={phase === 'legacy' || phase === 'ours'} onClick={() => setScenarioId(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          <label>
            <input type="checkbox" checked={runLegacy} onChange={(e) => setRunLegacy(e.target.checked)} /> Include the {LEGACY.toLowerCase()}
          </label>
          <span>
            Legacy renderer:{' '}
            <select value={renderer} onChange={(e) => setRenderer(e.target.value as 'canvas' | 'svg')}>
              <option value="canvas">Canvas 2D</option>
              <option value="svg">SVG</option>
            </select>
          </span>
          {(scenario.kind === 'line' || scenario.kind === 'many' || scenario.kind === 'stream') && (
            <label title="RSC-GL samples long lines to the screen resolution (min-max, keeps peaks). Turn off to draw every vertex.">
              <input type="checkbox" checked={sampling} onChange={(e) => setSampling(e.target.checked)} /> RSC-GL line sampling
            </label>
          )}
          {runLegacy && scenario.heavy && (
            <label style={{ color: '#d9475b', fontWeight: 600 }}>
              <input type="checkbox" checked={allowHeavy} onChange={(e) => setAllowHeavy(e.target.checked)} /> I understand the legacy run may freeze this tab
            </label>
          )}
          <button className="btn" data-primary disabled={heavyBlocked || phase === 'legacy' || phase === 'ours'} onClick={run}>
            {phase === 'legacy' || phase === 'ours' ? 'Running…' : 'Run benchmark'}
          </button>
          <span style={{ color: 'var(--muted)' }}>{status}</span>
        </div>
      </div>

      {speedup && (
        <div style={{ fontSize: 18, fontWeight: 800, margin: '6px 0 12px' }}>
          RSC-GL painted {speedup >= 1 ? `${speedup.toFixed(speedup >= 10 ? 0 : 1)}× faster` : `${(1 / speedup).toFixed(1)}× slower`} ({ms(oursR!.firstPaint)} vs {ms(legacyR!.firstPaint)}),
          hover at {oursR!.fps.toFixed(0)} fps vs {legacyR!.fps.toFixed(0)} fps.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: runLegacy ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr', gap: 14 }}>
        {runLegacy && (
          <BenchPanel title={LEGACY} subtitle={`Vega · ${renderer === 'svg' ? 'SVG' : 'Canvas 2D'}`} r={legacyR} metric={metric} ms={ms}>
            <div ref={legacyBox}>{panels(LEGACY)}</div>
          </BenchPanel>
        )}
        <BenchPanel title={OURS} subtitle="WebGPU / WebGL2" r={oursR} metric={metric} ms={ms} accent>
          <div ref={oursBox}>{panels(OURS)}</div>
        </BenchPanel>
      </div>

      {results.length > 0 && (
        <>
          <H2>Results</H2>
          <ResultsChart results={results} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Scenario', 'Library', 'Renderer', 'First paint', 'Main thread blocked', 'Hover / update fps', 'Worst frame', 'DOM nodes'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.scenario}</td>
                    <td style={{ ...td, fontWeight: 700, color: r.lib === OURS ? '#22a884' : undefined }}>{r.lib}</td>
                    <td style={td}>{r.renderer}</td>
                    <td style={td}>{ms(r.firstPaint)}</td>
                    <td style={td}>{ms(r.longTasks)}</td>
                    <td style={td}>{r.fps.toFixed(0)}</td>
                    <td style={td}>{ms(r.worstFrame)}</td>
                    <td style={td}>{r.domNodes.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <H2>What is measured</H2>
      <ul>
        <li>
          <b>First paint:</b> from mounting the chart to the second animation frame after it reports its first render (the legacy view&apos;s first run; the
          GPU chart&apos;s first frame).
        </li>
        <li>
          <b>Main thread blocked:</b> total duration of long tasks (over 50 ms) during that time. While blocked, the page cannot scroll, type or respond.
        </li>
        <li>
          <b>Hover fps / worst frame:</b> a synthetic pointer sweeps across the plot for 1.5 s (tooltips, hit testing and highlight run). The live scenario
          instead measures frame rate while both charts receive 30 data updates per second for 3 s.
        </li>
        <li>
          <b>First run:</b> the first run on a page includes one-time startup for both libraries (GPU device creation and shader compilation; the
          legacy parser and dataflow setup). Run a scenario twice for steady-state numbers.
        </li>
        <li>
          <b>DOM nodes:</b> elements inside the chart container. SVG rendering creates one node per mark; GPU rendering keeps a constant handful.
        </li>
      </ul>
      <p>
        RSC-GL draws scatter points with GPU instancing from a typed array and samples long lines to the screen resolution with a min-max filter that keeps
        every peak (turn sampling off above to draw every vertex). Bars use instanced signed-distance-field rectangles.
      </p>
    </Page>
  );
}

const td = { padding: '6px 8px', borderBottom: '1px solid var(--border)' };

function BenchPanel({ title, subtitle, r, metric, ms, children, accent }: { title: string; subtitle: string; r?: Result; metric: (r: Result | undefined, k: keyof Result, f: (v: number) => string) => string; ms: (v: number) => string; children: ReactNode; accent?: boolean }) {
  const stat = (label: string, value: string) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  );
  return (
    <div style={{ border: `1px solid ${accent ? '#22a884' : 'var(--border)'}`, borderRadius: 12, padding: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>{title}</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{subtitle}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 10 }}>
        {stat('First paint', metric(r, 'firstPaint', ms))}
        {stat('Blocked', metric(r, 'longTasks', ms))}
        {stat('FPS', metric(r, 'fps', (v) => v.toFixed(0)))}
        {stat('DOM nodes', metric(r, 'domNodes', (v) => v.toLocaleString()))}
      </div>
      <div style={{ minHeight: 120 }}>{children}</div>
    </div>
  );
}

function ResultsChart({ results }: { results: Result[] }) {
  const scheme = useSite().scheme;
  const scenarios = [...new Set(results.map((r) => r.scenario))];
  const get = (lib: string) => scenarios.map((s) => results.find((r) => r.scenario === s && r.lib === lib)?.firstPaint ?? null);
  return (
    <BarChart
      height={Math.max(160, 60 + scenarios.length * 46)}
      colorScheme={scheme}
      layout="horizontal"
      barLabel={(item) => (item.value === null ? '' : item.value >= 1000 ? `${(item.value / 1000).toFixed(2)} s` : `${Math.round(item.value)} ms`)}
      yAxis={[{ data: scenarios }]}
      xAxis={[{ scaleType: 'log', label: 'First paint (ms, log scale)', min: 1 }]}
      series={[
        { label: LEGACY, data: get(LEGACY), color: '#8a8f98' },
        { label: OURS, data: get(OURS), color: '#22a884' },
      ]}
    />
  );
}
