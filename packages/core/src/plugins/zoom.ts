import type { Chart } from '../chart/chart';
import type { ChartPlugin, PlotPoint } from '../chart/plugin';
import type { ResolvedAxis } from '../series/types';

export interface ZoomRangeButton {
  label: string;
  /** Visible span in axis units (ms for time axes); null resets. */
  span: number | null;
}

export interface ZoomPluginOptions {
  /** Zoom slider with a data preview below the plot. */
  slider?: boolean;
  /** Wheel / trackpad-pinch zoom. Default true. */
  wheel?: boolean;
  /** Drag to pan. Default true (Shift+drag when a marquee owns plain drags). */
  pan?: boolean;
  /** +/- / 0 and Shift+arrows. Default true. */
  keyboard?: boolean;
  /** Preset spans shown as buttons in the top-right corner. */
  rangeButtons?: ZoomRangeButton[];
  /** Smallest visible span, in axis units. */
  minSpan?: number;
}

const SLIDER_H = 30;

type Drag =
  | { kind: 'pan'; x: number; start: Map<string, [number, number]> }
  | { kind: 'slider'; handle: 'left' | 'right' | 'window'; x: number; start: [number, number]; axis: string };

/**
 * Zoom & pan for continuous x axes that set `zoom: true`: wheel and pinch
 * zoom around the cursor, drag to pan, double-click to reset, keyboard
 * shortcuts, preset range buttons and an optional slider with a preview.
 */
export function zoomPlugin(options: ZoomPluginOptions = {}): ChartPlugin {
  let chart: Chart | null = null;
  let drag: Drag | null = null;
  const full = new Map<string, [number, number]>();
  let buttons: HTMLElement | null = null;
  let initialApplied = false;

  const axes = (): ResolvedAxis[] => chart?.zoomableAxes() ?? [];
  const domainOf = (a: ResolvedAxis) => a.scale.domain().map(Number) as [number, number];
  const fullOf = (a: ResolvedAxis) => full.get(a.id) ?? domainOf(a);

  const clamp = (a: ResolvedAxis, n0: number, n1: number): [number, number] | null => {
    const [f0, f1] = fullOf(a);
    const min = options.minSpan ?? (typeof a.options.zoom === 'object' ? a.options.zoom.minSpan : undefined) ?? (f1 - f0) / 2000;
    let span = Math.max(min, n1 - n0);
    span = Math.min(span, f1 - f0);
    let s0 = n0;
    if (s0 < f0) s0 = f0;
    if (s0 + span > f1) s0 = f1 - span;
    if (span >= f1 - f0 - 1e-9) return null;
    return [s0, s0 + span];
  };

  const zoomBy = (factor: number, centerPx?: number) => {
    for (const a of axes()) {
      const [d0, d1] = domainOf(a);
      const c = centerPx !== undefined ? Number(a.scale.invert(centerPx)) : (d0 + d1) / 2;
      chart!.setZoom(a.id, clamp(a, c - (c - d0) * factor, c + (d1 - c) * factor));
    }
  };

  const panBy = (fraction: number) => {
    for (const a of axes()) {
      const [d0, d1] = domainOf(a);
      const shift = (d1 - d0) * fraction;
      if (chart!.getZoom(a.id)) chart!.setZoom(a.id, clamp(a, d0 + shift, d1 + shift));
    }
  };

  const sliderRect = () => {
    const ctx = chart?.layoutContext;
    const cart = chart?.cartesianLayout;
    if (!ctx || !cart || !options.slider) return null;
    const xa = cart.xAxes[0];
    const y = ctx.plot.y + ctx.plot.height + (xa?.size ?? 24) + 10;
    return { x: ctx.plot.x, y, width: ctx.plot.width, height: SLIDER_H - 6 };
  };

  const windowPx = (a: ResolvedAxis, r: { x: number; width: number }) => {
    const [f0, f1] = fullOf(a);
    const [d0, d1] = domainOf(a);
    const sx = (v: number) => r.x + ((v - f0) / (f1 - f0 || 1)) * r.width;
    return [sx(d0), sx(d1)];
  };

  const setButtons = () => {
    if (!chart || !options.rangeButtons?.length || buttons) return;
    buttons = document.createElement('div');
    buttons.setAttribute('role', 'group');
    buttons.setAttribute('aria-label', 'Zoom ranges');
    Object.assign(buttons.style, { position: 'absolute', top: '4px', right: '8px', display: 'flex', gap: '4px', zIndex: '4' });
    for (const b of options.rangeButtons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      Object.assign(btn.style, {
        font: '600 11px var(--rgl-font)',
        padding: '2px 8px',
        borderRadius: '6px',
        border: '1px solid var(--rgl-tooltip-border)',
        background: 'var(--rgl-tooltip-bg)',
        color: 'var(--rgl-text)',
        cursor: 'pointer',
      });
      btn.addEventListener('click', () => {
        for (const a of axes()) {
          if (b.span === null) chart!.setZoom(a.id, null, true);
          else {
            const [, f1] = fullOf(a);
            chart!.setZoom(a.id, clamp(a, f1 - b.span, f1), true);
          }
        }
      });
      buttons.appendChild(btn);
    }
    chart.plotEl.appendChild(buttons);
  };

  return {
    name: 'zoom',
    attach(c) {
      chart = c;
    },
    reserveBottom: () => (options.slider ? SLIDER_H + 6 : 0),
    layout(c) {
      setButtons();
      if (!drag) for (const a of axes()) full.set(a.id, c.fullDomain(a.id));
      if (!initialApplied) {
        initialApplied = true;
        const init = c.getOptions().initialZoom;
        if (init?.length) queueMicrotask(() => init.forEach((z) => c.setZoom(z.axisId, [z.start, z.end])));
      }
    },
    onWheel(e, p) {
      if (options.wheel === false || !axes().length) return false;
      const ctx = chart!.layoutContext!;
      if (p.y > ctx.plot.y + ctx.plot.height + 4 && !sliderRect()) return false;
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomBy(factor, p.x);
      return true;
    },
    onPointerDown(e, p) {
      if (e.button !== 0 || !axes().length) return false;
      const sr = sliderRect();
      if (sr && p.y >= sr.y - 4 && p.y <= sr.y + sr.height + 4 && p.x >= sr.x - 6 && p.x <= sr.x + sr.width + 6) {
        const a = axes()[0];
        const [w0, w1] = windowPx(a, sr);
        const handle = Math.abs(p.x - w0) < 8 ? 'left' : Math.abs(p.x - w1) < 8 ? 'right' : 'window';
        if (handle === 'window' && (p.x < w0 || p.x > w1)) {
          // Click outside the window: center it there.
          const [f0, f1] = fullOf(a);
          const [d0, d1] = domainOf(a);
          const v = f0 + ((p.x - sr.x) / sr.width) * (f1 - f0);
          chart!.setZoom(a.id, clamp(a, v - (d1 - d0) / 2, v + (d1 - d0) / 2), true);
        }
        drag = { kind: 'slider', handle, x: p.x, start: domainOf(a), axis: a.id };
        return true;
      }
      // A marquee that owns plain drags leaves panning to Shift+drag, and vice versa.
      const marqueeOwnsDrag = chart!.plugins.some((x) => x.name === 'marquee' && x.dragModifier !== 'shift');
      if (options.pan === false || (marqueeOwnsDrag ? !e.shiftKey : e.shiftKey)) return false;
      const ctx = chart!.layoutContext!;
      const pl = ctx.plot;
      if (p.x < pl.x || p.x > pl.x + pl.width || p.y < pl.y || p.y > pl.y + pl.height) return false;
      if (!axes().some((a) => chart!.getZoom(a.id))) return false;
      drag = { kind: 'pan', x: p.x, start: new Map(axes().map((a) => [a.id, domainOf(a)])) };
      return true;
    },
    onPointerMove(_e, p: PlotPoint) {
      if (!drag) return false;
      if (drag.kind === 'pan') {
        const w = chart!.layoutContext!.plot.width;
        for (const a of axes()) {
          const d = drag.start.get(a.id);
          if (!d) continue;
          const shift = (-(p.x - drag.x) / w) * (d[1] - d[0]);
          chart!.setZoom(a.id, clamp(a, d[0] + shift, d[1] + shift));
        }
        return true;
      }
      const sr = sliderRect();
      const a = axes().find((x) => x.id === (drag as { axis: string }).axis);
      if (!sr || !a) return true;
      const [f0, f1] = fullOf(a);
      const dv = ((p.x - drag.x) / sr.width) * (f1 - f0);
      const [s0, s1] = drag.start;
      if (drag.handle === 'window') chart!.setZoom(a.id, clamp(a, s0 + dv, s1 + dv));
      else if (drag.handle === 'left') chart!.setZoom(a.id, clamp(a, Math.min(s0 + dv, s1 - (f1 - f0) / 1000), s1));
      else chart!.setZoom(a.id, clamp(a, s0, Math.max(s1 + dv, s0 + (f1 - f0) / 1000)));
      return true;
    },
    onPointerUp() {
      const was = !!drag;
      drag = null;
      return was;
    },
    onDoubleClick() {
      if (!axes().some((a) => chart!.getZoom(a.id))) return false;
      for (const a of axes()) chart!.setZoom(a.id, null, true);
      return true;
    },
    onKeyDown(e) {
      if (options.keyboard === false || !axes().length) return false;
      if (e.key === '+' || e.key === '=') zoomBy(0.8);
      else if (e.key === '-' || e.key === '_') zoomBy(1.25);
      else if (e.key === '0') axes().forEach((a) => chart!.setZoom(a.id, null, true));
      else if (e.shiftKey && e.key === 'ArrowLeft') panBy(-0.1);
      else if (e.shiftKey && e.key === 'ArrowRight') panBy(0.1);
      else return false;
      e.preventDefault();
      return true;
    },
    drawOverlay(g) {
      const sr = sliderRect();
      const a = axes()[0];
      if (!sr || !a || !chart) return;
      const theme = chart.chartTheme;
      const dark = theme.scheme === 'dark';
      g.save();
      g.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
      g.beginPath();
      g.roundRect(sr.x, sr.y, sr.width, sr.height, 6);
      g.fill();
      // Preview: every visible series, downsampled to the slider width.
      const [f0, f1] = fullOf(a);
      const ya = chart.layoutContext?.yAxis();
      const yd = ya ? (ya.scale.domain().map(Number) as [number, number]) : [0, 1];
      for (const s of chart.resolvedSeries) {
        if (s.hidden || s.xAxisId !== a.id) continue;
        const pts = s.points.filter((pt) => pt.y !== null);
        if (pts.length < 2) continue;
        const step = Math.max(1, Math.floor(pts.length / sr.width));
        g.strokeStyle = s.colorCss;
        g.globalAlpha = 0.75;
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 0; i < pts.length; i += step) {
          const v = typeof pts[i].x === 'string' ? Date.parse(pts[i].x as string) : Number(pts[i].x);
          const x = sr.x + ((v - f0) / (f1 - f0 || 1)) * sr.width;
          const y = sr.y + sr.height - 3 - (((pts[i].y1 ?? pts[i].y ?? 0) - yd[0]) / (yd[1] - yd[0] || 1)) * (sr.height - 6);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      const [w0, w1] = windowPx(a, sr);
      g.fillStyle = dark ? 'rgba(126,162,255,0.16)' : 'rgba(59,111,224,0.14)';
      g.strokeStyle = theme.focusRing;
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(w0, sr.y, Math.max(2, w1 - w0), sr.height, 5);
      g.fill();
      g.stroke();
      g.fillStyle = theme.focusRing;
      for (const x of [w0, w1]) {
        g.beginPath();
        g.roundRect(x - 3, sr.y + sr.height / 2 - 8, 6, 16, 3);
        g.fill();
      }
      g.restore();
    },
    destroy() {
      buttons?.remove();
      buttons = null;
    },
  };
}
