import type { GpuDevice } from '@rsc-gl/gpu';
import { buildScene } from '../chart/scene';
import { drawAxes } from '../components/axes';
import { getFormatter } from '../format/format';
import { isOrdinal } from '../scales/scales';
import type { LayoutContext, SeriesDefinition } from '../series/types';
import { getTheme } from '../theme/theme';
import type { ChartOptions } from '../types';
import { xml } from './svg';
import { SvgContext } from './svg-context';

export interface RenderToSvgConfig {
  series: SeriesDefinition<any>[];
  width: number;
  height: number;
}

/**
 * Renders a chart to an SVG string without a DOM or GPU (server-side
 * rendering, emails, static exports). Uses the same normalization, layout and
 * series renderers as the GPU path, so output matches the interactive chart.
 * The root element carries `data-rgl-ssr` so `hydrateChart` can take it over.
 */
export function renderToSVGString(options: ChartOptions, config: RenderToSvgConfig): string {
  const W = config.width;
  const H = config.height;
  const theme = getTheme(options.colorScheme ?? 'light', options.theme);
  const formatter = getFormatter(options.locale);
  const defs = new Map(config.series.map((d) => [d.type, d]));
  const hidden = new Set(options.hiddenSeries ?? options.defaultHiddenSeries ?? []);
  const title = typeof options.title === 'string' ? options.title : options.title?.text;
  const titleH = title ? 30 : 0;
  const measure = (t: string) => t.length * theme.fontSize * 0.56;
  // Legend height depends on whether entries exist; build once to know.
  const probe = buildScene({ options, defs, width: W, height: H, theme, formatter, measure, hidden });
  const showLegend = options.legend !== false && options.legend !== undefined && probe.legend.length > 0;
  const legendH = showLegend ? 28 : 0;
  const plotH = H - titleH - legendH;
  const scene = buildScene({ options, defs, width: W, height: plotH, theme, formatter, measure, hidden });
  const { byType, cartesian: cart, plot, legend } = scene;
  const ctx: LayoutContext = {
    now: 0,
    transition: { duration: 0, easing: 'linear', stagger: 0 },
    firstRender: false,
    enterAnimation: false,
    headless: true,
    theme,
    scheme: theme.scheme,
    formatter,
    plot,
    width: W,
    height: plotH,
    dpr: 1,
    xAxis: (id) => cart?.xAxes.find((a) => a.id === (id ?? 'x')) ?? cart?.xAxes[0],
    yAxis: (id) => cart?.yAxes.find((a) => a.id === (id ?? 'y')) ?? cart?.yAxes[0],
  };
  // Marks only touch the GPU when drawing, so a stub device is enough to lay them out.
  const device = {} as GpuDevice;
  const body: string[] = [];
  if (cart) {
    const g = options.grid;
    const horizontal = g ? !!g.horizontal : true;
    const ya = cart.yAxes[0];
    if (horizontal && ya)
      for (const t of ya.ticks) {
        const zero = !isOrdinal(ya.scaleType) && Number(t.value) === 0;
        body.push(`<line x1="${plot.x}" x2="${plot.x + plot.width}" y1="${t.pos.toFixed(1)}" y2="${t.pos.toFixed(1)}" stroke="${zero ? theme.axisColor : theme.gridColor}"/>`);
      }
  }
  const text = new SvgContext(null);
  const g = text as unknown as CanvasRenderingContext2D;
  for (const [type, list] of byType) {
    const r = defs.get(type)!.createRenderer(device);
    r.layout(list, ctx);
    body.push(r.toSvg?.(0) ?? '');
    r.drawOverlay?.(g, ctx, 1e9);
  }
  if (cart) drawAxes(g, cart, theme);
  const parts: string[] = [];
  const bg = options.backgroundColor && options.backgroundColor !== 'transparent' ? options.backgroundColor : theme.scheme === 'dark' ? '#1b1b1f' : '#ffffff';
  parts.push(`<rect width="${W}" height="${H}" fill="${xml(bg)}"/>`);
  if (title) parts.push(`<text x="8" y="20" font-family="${xml(theme.fontFamily)}" font-size="${theme.titleFontSize}" font-weight="700" fill="${xml(theme.textColor)}">${xml(title)}</text>`);
  parts.push(`<g transform="translate(0,${titleH})">${body.join('')}${text}</g>`);
  if (showLegend) {
    let x = 12;
    const y = H - legendH / 2;
    for (const e of legend) {
      const label = xml(e.label);
      parts.push(`<rect x="${x}" y="${y - 6}" width="12" height="12" rx="3" fill="${xml(e.color)}"${hidden.has(e.id) ? ' opacity="0.38"' : ''}/><text x="${x + 18}" y="${y}" dominant-baseline="central" font-family="${xml(theme.fontFamily)}" font-size="${theme.fontSize}" fill="${xml(theme.textColor)}">${label}</text>`);
      x += 32 + measure(e.label);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" data-rgl-ssr="" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}
