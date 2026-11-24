import { withBase } from '../base';
import { useEffect, useState, type ReactNode } from 'react';
import { RenderEngine } from '@rsc-gl/core';
import { Callout, H2, H3, Page, PropsTable } from '../components/docs';
import { CodeBlock } from '../components/highlight';

/* ---------------------------------------------------------------- live capability panel */

interface Caps {
  webgpu: 'yes' | 'no' | 'checking';
  adapter?: string;
  limits?: { label: string; value: string }[];
  features?: string[];
  webgl2: boolean;
  glMaxTexture?: number;
  active: string | null;
  cores: number;
  dpr: number;
}

function useCaps(): Caps {
  const [caps, setCaps] = useState<Caps>({ webgpu: 'checking', webgl2: false, active: null, cores: navigator.hardwareConcurrency ?? 0, dpr: window.devicePixelRatio || 1 });
  useEffect(() => {
    let cancelled = false;
    const gl = document.createElement('canvas').getContext('webgl2');
    const glMaxTexture = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : undefined;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    const active = RenderEngine.all().find((e) => e.backend)?.backend ?? null;
    const base = { webgl2: !!gl, glMaxTexture, active };
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) {
      setCaps((c) => ({ ...c, ...base, webgpu: 'no' }));
      return;
    }
    gpu.requestAdapter().then((a) => {
      if (cancelled) return;
      if (!a) return setCaps((c) => ({ ...c, ...base, webgpu: 'no' }));
      const info = (a as GPUAdapter & { info?: { vendor?: string; architecture?: string } }).info;
      const L = a.limits;
      setCaps((c) => ({
        ...c,
        ...base,
        webgpu: 'yes',
        adapter: [info?.vendor, info?.architecture].filter(Boolean).join(' · ') || 'available',
        features: [...a.features].sort().slice(0, 12),
        limits: [
          { label: 'Max texture size', value: `${L.maxTextureDimension2D}px` },
          { label: 'Max buffer size', value: `${Math.round(L.maxBufferSize / 1024 / 1024)} MB` },
          { label: 'Max storage buffer', value: `${Math.round(L.maxStorageBufferBindingSize / 1024 / 1024)} MB` },
          { label: 'Compute workgroup size', value: `${L.maxComputeWorkgroupSizeX}` },
          { label: 'Vertex attributes', value: `${L.maxVertexAttributes}` },
        ],
      }));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return caps;
}

function Pill({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  const color = ok === null ? 'var(--muted)' : ok ? '#22a884' : '#d9475b';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 999, border: `1px solid ${color}`, color, fontSize: 12, fontWeight: 600 }}>{children}</span>;
}

function CapabilityPanel() {
  const c = useCaps();
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Pill ok={c.webgpu === 'checking' ? null : c.webgpu === 'yes'}>WebGPU {c.webgpu === 'checking' ? '…' : c.webgpu === 'yes' ? 'available' : 'not available'}</Pill>
        <Pill ok={c.webgl2}>WebGL2 {c.webgl2 ? 'available' : 'not available'}</Pill>
        <Pill ok={c.webgpu === 'checking' ? null : c.webgpu === 'yes' || c.webgl2}>
          Charts here render with: {c.active ?? (c.webgpu === 'checking' ? '…' : c.webgpu === 'yes' ? 'webgpu' : c.webgl2 ? 'webgl2' : 'SVG fallback (server)')}
        </Pill>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, fontSize: 13 }}>
        {c.adapter && <Stat label="WebGPU adapter" value={c.adapter} />}
        {c.limits?.map((l) => <Stat key={l.label} label={l.label} value={l.value} />)}
        {c.glMaxTexture && <Stat label="WebGL2 max texture" value={`${c.glMaxTexture}px`} />}
        <Stat label="CPU threads" value={String(c.cores || '?')} />
        <Stat label="Device pixel ratio" value={String(c.dpr)} />
      </div>
      {c.features?.length ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>WebGPU features: {c.features.join(', ')}</div> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- diagrams */

function Layers() {
  const box = (title: string, text: string, accent: string) => (
    <div style={{ border: `1px solid ${accent}`, borderRadius: 10, padding: '10px 12px', background: 'var(--soft, transparent)' }}>
      <div style={{ fontWeight: 700, color: accent }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{text}</div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {box('@rsc-gl/react · @rsc-gl/3d/react', 'Children API and props API; slots, hooks, worker and SSR components.', '#a656d6')}
      {box('@rsc-gl/core', 'Normalization, scales, layout, series renderers, marks, animation, interaction, a11y, export, plugins.', '#4f6bed')}
      {box('@rsc-gl/gpu (HAL)', 'Device · Buffer · Texture · Pipeline · RenderPass · RenderTarget · Compute — shaped like WebGPU.', '#2fa37a')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {box('@rsc-gl/gpu/webgpu', 'WGSL · MSAA ×4 · compute shaders · one device, many canvases.', '#e06d3c')}
        {box('@rsc-gl/gpu/webgl2', 'GLSL ES 3.00 · one shared context · blit per chart.', '#d9a400')}
      </div>
    </div>
  );
}

const SIZES: [string, string, string, string][] = [
  ['import { BarChart }', '66.9 KB', '+7.5 KB', 'One chart type with both GPU backends'],
  ['import { LineChart }', '76.7 KB', '+7.4 KB', 'Adds line / area geometry and curve math'],
  ['Bar + Line + Pie + Scatter', '84.4 KB', '+7.4 KB', 'Four chart types share the engine'],
  ["import * from '@rsc-gl/react'", '139.4 KB', '—', 'Every 2D chart, plugin and component'],
  ['core Chart + bar, WebGL2 only', '56.9 KB', '—', 'Framework-agnostic core, single backend'],
  ['import { Bar3DChart }', '53.8 KB', '+15.0 KB', 'Globe, map, network, … load on first use'],
];

function SizeTable() {
  const cell = { padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'left' as const, fontSize: 13 };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Import', 'Initial (gzip)', 'On demand', 'Notes'].map((h) => (
              <th key={h} style={{ ...cell, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SIZES.map(([name, initial, lazy, note]) => (
            <tr key={name}>
              <td style={cell}>
                <code>{name}</code>
              </td>
              <td style={{ ...cell, fontWeight: 700 }}>{initial}</td>
              <td style={cell}>{lazy}</td>
              <td style={{ ...cell, color: 'var(--muted)' }}>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export function WhyGpuPage() {
  return (
    <Page title="Why WebGPU + WebGL2" lede="Why the engine renders on the GPU, why it targets both APIs, how it keeps bundles small, and what happens inside a frame.">
      <H2>Your browser</H2>
      <p>Live capabilities of the browser you are using right now. Every chart on this site picks the best backend automatically; the header toggle forces one.</p>
      <CapabilityPanel />

      <H2>Why render charts on the GPU</H2>
      <p>
        SVG and DOM-based charts create one element per mark. Every element is styled, laid out, painted and composited by the browser, and every update
        walks those nodes again. Canvas2D avoids the DOM but still rasterizes each shape on the CPU, one draw command at a time. Both approaches scale with the
        number of marks, so tens of thousands of points become slow and a million points stall the page.
      </p>
      <p>
        A GPU renderer sends data once, as compact typed arrays, and draws thousands to millions of marks with a handful of instanced draw calls. Shapes are
        computed per pixel by shaders, so cost depends on screen size far more than on data size.
      </p>
      <PropsTable
        rows={[
          { name: 'Marks per draw', type: 'GPU instancing', description: 'One draw call renders every bar / point / slice of a series; the CPU never touches individual marks while drawing.' },
          { name: 'Animation', type: 'GPU interpolation', description: 'Each instance stores from / to state. A transition costs one uniform write per frame, not a re-layout of every mark.' },
          { name: 'Crispness', type: 'Signed distance fields', description: 'Rounded bars, symbols, slices and line joins are evaluated per pixel with analytic anti-aliasing at any DPR or zoom.' },
          { name: 'Large data', type: 'Sampling + compute', description: 'LTTB / min-max / M4 sampling, worker decimation, and WebGPU compute shaders that reduce millions of samples in milliseconds.' },
          { name: 'Many charts', type: 'One device', description: 'All charts share one GPU device and one frame loop, so dashboards with dozens of charts never hit browser context limits.' },
        ]}
      />
      <Callout>
        See it side by side on the <a href={withBase('/benchmark')}>benchmark page</a>: the same data rendered by the legacy SVG/Canvas library and by this engine, up to
        one million points.
      </Callout>

      <H2>Why WebGPU first</H2>
      <ul>
        <li>
          <b>Lower overhead.</b> Pipelines, bind groups and command buffers are validated once and replayed cheaply, which keeps per-frame CPU work flat as
          the number of charts grows.
        </li>
        <li>
          <b>Compute shaders.</b> Data reduction (min-max decimation of millions of samples, binning) runs on the GPU and returns only what is drawn. See{' '}
          <a href={withBase('/features/gpu-compute')}>GPU compute</a>.
        </li>
        <li>
          <b>One device, many canvases.</b> A single WebGPU device presents to every chart canvas on the page, with 4× MSAA per surface.
        </li>
        <li>
          <b>Modern shading language.</b> WGSL with explicit layouts; storage buffers and render targets make GPU picking and offscreen work straightforward.
        </li>
        <li>
          <b>Workers.</b> WebGPU and OffscreenCanvas let a whole chart render inside a Web Worker. See <a href={withBase('/features/worker-rendering')}>worker rendering</a>.
        </li>
      </ul>

      <H2>Why WebGL2 as well</H2>
      <ul>
        <li>
          <b>Reach.</b> WebGL2 runs in essentially every current browser and on older GPUs and drivers where WebGPU is unavailable or disabled by policy.
        </li>
        <li>
          <b>Same features.</b> Every mark ships both GLSL ES 3.00 and WGSL behind one contract, so charts look and behave the same on either backend; the
          rendering self-test checks this pixel by pixel.
        </li>
        <li>
          <b>No context limit.</b> Browsers cap WebGL contexts (often around 16). The WebGL2 backend uses one shared context, renders each chart into a
          scissored region and blits it to the chart&apos;s own canvas, so a page can hold any number of charts.
        </li>
        <li>
          <b>Automatic fallback.</b> The engine tries WebGPU, then WebGL2. Device loss (driver reset, tab backgrounding) is recovered transparently.
        </li>
      </ul>

      <H2>Architecture</H2>
      <Layers />
      <H3>One shader contract, two languages</H3>
      <p>
        Each mark declares its uniforms once. The HAL generates the GLSL uniform block and the WGSL struct from that single layout, restricted to{' '}
        <code>f32 / vec2 / vec4 / mat4</code> so std140 and WGSL packing are byte-identical. Attribute locations are shared, so the same instance buffers
        feed both backends.
      </p>
      <CodeBlock
        code={`// One layout drives both shader languages.
const UNIFORMS = [...COMMON_UNIFORMS, { name: 'viewProj', type: 'mat4' }, { name: 'light', type: 'vec4' }];

device.createPipeline({
  shader: { glsl: { vertex, fragment }, wgsl },   // hand-written per mark
  uniforms: { fields: UNIFORMS },                  // declarations generated for each
  buffers: [{ name: 'instance', stepMode: 'instance', stride: 68, attributes: [...] }],
});`}
      />
      <H3>A frame</H3>
      <ol>
        <li>Options change → series are normalized (grouping, stacking) and axes are laid out (labels measured, scales built).</li>
        <li>Series renderers turn data into keyed mark items; marks write from / to attributes into instance buffers once.</li>
        <li>The shared scheduler renders only dirty charts, once per animation frame, and stops when nothing moves.</li>
        <li>Shaders interpolate positions, colors and sizes on the GPU; highlight and fade are a single uniform.</li>
        <li>Axes and labels draw on a 2D overlay (or as SDF text in 3D); legend, tooltip and accessibility are real HTML.</li>
      </ol>

      <H2>How tree-shaking works</H2>
      <p>You only ship what you render. Four mechanisms make that happen:</p>
      <PropsTable
        rows={[
          { name: 'Series registry', type: 'per chart', description: 'Each chart component registers only the series types it renders (BarChart → bar). Unused series code is never referenced.' },
          { name: 'Pure components', type: '/*#__PURE__*/', description: 'Component factories are annotated side-effect free and every package sets "sideEffects": false, so bundlers drop unused charts.' },
          { name: 'On-demand plugins', type: 'dynamic import', description: 'Zoom, annotations and the toolbar load in a separate chunk only when options ask for them. 3D types beyond bars / scatter / surfaces do the same.' },
          { name: 'Separate entry points', type: 'exports map', description: 'GPU backends (@rsc-gl/gpu/webgpu, /webgl2), 3D (@rsc-gl/3d) and its React bindings are opt-in imports. d3 is imported per module.' },
        ]}
      />
      <H3>Measured bundle sizes</H3>
      <p>
        Production builds of small apps (React externalized, minified, gzip). <i>Initial</i> is what the page downloads up front; <i>on demand</i> loads only if
        the app uses zoom, annotations or a toolbar. Reproduce with <code>npm run size</code>.
      </p>
      <SizeTable />
      <CodeBlock
        code={`// Bundles bar rendering only (plus the shared engine).
import { BarChart } from '@rsc-gl/react';

// Ship a single backend: pass it explicitly instead of the default pair.
import { ChartsEngineProvider } from '@rsc-gl/react';
import { webgl2Backend } from '@rsc-gl/gpu/webgl2';

<ChartsEngineProvider backends={[webgl2Backend]}>
  <BarChart … />
</ChartsEngineProvider>

// Framework-agnostic: register exactly the series types you use.
import { Chart, barSeries, lineSeries } from '@rsc-gl/core';
new Chart(el, options, { series: [barSeries, lineSeries], engine: { backends: [webgl2Backend] } });`}
      />

      <H2>Text, accessibility and output</H2>
      <ul>
        <li>Axis labels and annotations use the browser&apos;s text engine (Canvas2D overlay), so fonts, kerning and locales match the rest of the page.</li>
        <li>Legends, tooltips and popovers are HTML; the chart root has a generated description, keyboard navigation and a live region.</li>
        <li>Every mark can serialize itself to SVG, so <code>getSvg()</code>, print, and server rendering produce real vector output from the same code.</li>
      </ul>

      <H2>FAQ</H2>
      <H3>What if neither WebGPU nor WebGL2 is available?</H3>
      <p>
        The chart shows an explanatory message. For static contexts (email, PDFs, crawlers) render on the server with <code>renderToSVGString</code> and
        hydrate on the client; see <a href={withBase('/features/hydration')}>SSR &amp; hydration</a>.
      </p>
      <H3>How many charts can a page hold?</H3>
      <p>As many as you like: they share one device and one frame loop, and idle charts cost nothing per frame.</p>
      <H3>Does it respect reduced motion?</H3>
      <p>Yes. Transitions are skipped when the operating system asks for reduced motion (the docs let you override this for demos).</p>
      <H3>Is GPU memory a concern?</H3>
      <p>
        Instance data is compact (tens of bytes per mark) and buffers grow in place. A million scatter points use a few megabytes; textures are limited to
        glyph atlases and offscreen picking targets.
      </p>
    </Page>
  );
}
