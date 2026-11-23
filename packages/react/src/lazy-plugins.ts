import { annotationsPlugin, marqueePlugin, toolbarPlugin, zoomPlugin, type MarqueeOptions, type ChartOptions, type ChartPlugin } from '@rsc-gl/core';

/**
 * Optional plugins, loaded with a dynamic import only when a chart's options
 * ask for them, so apps that never zoom or annotate do not ship that code.
 */
const latestOptions = new WeakMap<object, () => ChartOptions>();
const latestMarquee = (o: ChartOptions) => {
  const b = (latestOptions.get(o)?.() ?? o).marquee;
  return typeof b === 'object' ? b : undefined;
};

/** Lets marquee callbacks read the chart's current options instead of the ones at creation. */
export function trackOptions(o: ChartOptions, get: () => ChartOptions): void {
  latestOptions.set(o, get);
}

export function createLazyPlugins(o: ChartOptions, names: string[]): ChartPlugin[] {
  const out: ChartPlugin[] = [];
  for (const n of names) {
    if (n === 'zoom') {
      const zoomAxes = (o.xAxis ?? []).filter((a) => a.zoom);
      out.push(zoomPlugin({ slider: zoomAxes.some((a) => typeof a.zoom === 'object' && a.zoom.slider) }));
    } else if (n === 'annotations') out.push(annotationsPlugin());
    else if (n === 'toolbar') out.push(toolbarPlugin(typeof o.toolbar === 'object' ? o.toolbar : {}));
    else if (n === 'marquee') {
      const opts: MarqueeOptions = typeof o.marquee === 'object' ? o.marquee : {};
      // Callbacks may change identity on re-render: always call the latest ones.
      out.push(marqueePlugin({ ...opts, onMarquee: (s) => latestMarquee(o)?.onMarquee?.(s), onMarqueeEnd: (s) => latestMarquee(o)?.onMarqueeEnd?.(s) }));
    }
  }
  return out;
}
