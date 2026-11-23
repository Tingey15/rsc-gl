import { Chart, type ChartConfig } from '../chart/chart';
import type { ChartOptions } from '../types';

/** Same options, minus the entrance animation (the server already painted the final state). */
export function withoutEntrance(options: ChartOptions): ChartOptions {
  const a = options.animation;
  if (a === false) return options;
  return { ...options, animation: { ...(typeof a === 'object' ? a : {}), enter: false } };
}

/**
 * Takes over server-rendered markup: `container` holds the SVG produced by
 * `renderToSVGString`. The GPU chart mounts behind it without an entrance
 * animation, and the SVG fades out once the first GPU frame is on screen,
 * so the page never flashes or re-animates.
 */
export function hydrateChart(container: HTMLElement, options: ChartOptions, config: ChartConfig, fadeMs = 160): Chart {
  const svg = container.querySelector<SVGSVGElement>('svg[data-rgl-ssr]');
  if (svg) {
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '3', pointerEvents: 'none', transition: `opacity ${fadeMs}ms ease` });
  }
  const chart = new Chart(container, svg ? withoutEntrance(options) : options, config);
  if (svg) {
    let off: (() => void) | null = null;
    off = chart.on('render', () => {
      off?.();
      off = null;
      svg.style.opacity = '0';
      setTimeout(() => svg.remove(), fadeMs + 40);
      chart.emit('hydrated', performance.now());
    });
  }
  return chart;
}
