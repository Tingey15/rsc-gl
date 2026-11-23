# RSC-GL Charts

GPU-native charting for the web: a WebGPU + WebGL2 engine written in TypeScript, with React bindings,
3D charts, GPU-interpolated animations, and an interactive documentation site.

> Status: Phases 1–4 implemented. The docs site (`npm run dev`) covers every chart type, feature and API.

## Packages

| Package | What it is |
| --- | --- |
| `@rsc-gl/gpu` | Thin WebGPU-shaped hardware abstraction (pipelines, buffers, textures, render targets, compute on WebGPU). Backends are separate entry points: `@rsc-gl/gpu/webgpu`, `@rsc-gl/gpu/webgl2`. |
| `@rsc-gl/core` | Framework-agnostic engine: scheduler + shared device, layout, scales, GPU marks (rect, point, arc, line, area, mesh), series registry, plugins, legend, tooltip, highlight, keyboard navigation, sampling, streaming, PNG + vector SVG export, headless SSR, formatting, themes. |
| `@rsc-gl/react` | React bindings with two API layers: a composable children API (`<Chart><Bar/><Axis/><Legend/></Chart>`) and props-driven charts (`BarChart`, `LineChart`, `HeatmapChart`, `SankeyChart`, `MapChart`, …). |
| `@rsc-gl/3d` | 3D bars (box / cylinder / cone / pyramid, stacked), scatter, surfaces with contours, pies, ribbons, globes, networks, vector fields, histograms, funnels, treemaps, prism maps and trajectories, with orbit camera, lighting, SDF labels and GPU picking. React bindings at `@rsc-gl/3d/react`. |
| `@rsc-gl/codemod` | `rsc-gl-migrate` CLI that rewrites imports from a legacy chart package (`--from <pkg>`) and flags props that need review. |
| `apps/docs` | Documentation and demo site (Vite + React): live demos with code, copy and replay, playground knobs, generated API reference, WebGPU/WebGL2 toggle and a rendering self-test page (`/dev/self-test`). |

## Chart types

Bar (vertical, horizontal, stacked, grouped), line, area (stacked, bands), scatter/bubble (millions of points),
pie/donut, sparkline, gauge, big number, combo/dual axis, heatmap, candlestick, range bar, Gantt, waterfall,
boxplot, funnel/pyramid, treemap, sunburst, Sankey, chord, Venn, bullet, radar, radial bars, radial lines, geographic
maps, chart-type morphing, small multiples, and 15 kinds of 3D charts. Candlesticks stream in real time (`streamData`).

Interaction and annotation plugins: zoom & pan (wheel, pinch, drag, keyboard, slider with preview, range buttons),
marquee selection, crosshair, toolbar (downloads, print, full screen), reference lines and areas, trendlines, metric ranges,
direct labels, point callouts, scatter paths and labels, axis annotations, thumbnails and grouped axes.

Composition: hooks (`useXScale`, `useYScale`, `useDrawingArea`, …), `ChartsSvgLayer`, slots for tooltip / legend /
overlays, an action bar for selected marks, and CSV / TSV / JSON / .xlsx export.

## Quick start (development)

```bash
npm install
npm run dev        # docs site on http://localhost:5199
npm test           # unit tests (vitest)
npm run typecheck  # tsc -b across packages + docs
npm run gen:api    # regenerate the docs API reference from the TypeScript sources
npm run size       # bundle-size report (initial vs on-demand, gzip)
npm run build      # API docs + all packages + docs site
```

Server-side rendering of a chart to an SVG string:

```ts
import { renderToSVGString, barSeries } from '@rsc-gl/core';

const svg = renderToSVGString(
  { xAxis: [{ data: ['A', 'B', 'C'] }], series: [{ type: 'bar', data: [3, 5, 2] }] },
  { series: [barSeries], width: 480, height: 280 },
);
```

Workspace packages resolve to their TypeScript sources through the `@rsc-gl/source` export condition
(configured in `tsconfig.base.json`, Vite and Vitest); published builds use `dist`.

## Highlights

- **Both GPU APIs from day one.** Every mark ships GLSL ES 3.00 and WGSL implementations behind one contract.
  Uniform declarations are generated from a single layout so the two languages cannot drift.
- **No context limits.** One GPU device per page. WebGPU presents to many canvases; WebGL2 renders into one
  shared context and blits to each chart, so dashboards with dozens of charts just work.
- **GPU animation.** Instances keep `from`/`to` state on the GPU. Transitions cost one uniform write per
  frame. Keyed enter/update/exit, per-category staggering, easing parity between CPU and GPU, interruptible
  transitions, animated axes, and shape morphing between chart types.
- **Large data.** Typed-array fast path for scatter, LTTB / min-max / M4 sampling, streaming `appendData`,
  and min-max decimation on a WebGPU compute shader or in a Web Worker.
- **Crisp at any DPR.** Signed-distance-field shapes for rounded bars, pie/donut slices, symbols, round-joined
  lines, and SDF glyph text in 3D.
- **Vector output.** `getSvg()` and `renderToSVGString` produce real SVG elements for every mark and label.
- **Tree-shakeable.** Series types are registry entries, components are side-effect free, and optional plugins and
  3D layouts load on demand. A bar-chart app ships 66.9 KB gzip up front (`npm run size`).
- **Off the main thread.** `startChartWorker` / `WorkerChart` render a whole chart in a Web Worker on an
  OffscreenCanvas; `renderToSVGString` + `hydrateChart` give server-rendered charts that take over without a flash.
- **Accessible.** HTML legend and tooltip, keyboard navigation with live announcements, generated descriptions,
  and reduced-motion support.
