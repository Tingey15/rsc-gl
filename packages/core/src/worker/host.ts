import { injectStyles } from '../components/styles';
import type { ChartOptions } from '../types';
import { cloneable, type FromWorker, type ToWorker, type WorkerTooltip } from './protocol';

export interface WorkerChartOptions {
  /** Force a backend inside the worker. */
  prefer?: 'webgpu' | 'webgl2';
  onReady?: (backend: string) => void;
  onError?: (message: string) => void;
  /** Frames rendered per second inside the worker (reported once a second). */
  onFrameStats?: (stats: { fps: number; frameMs: number }) => void;
}

/**
 * Page side of a worker-rendered chart: owns a canvas whose drawing is
 * transferred to the worker, forwards size and pointer input, and shows the
 * tooltip the worker computes. Options must be structured-cloneable
 * (functions such as formatters are dropped).
 */
export class WorkerChart {
  readonly canvas: HTMLCanvasElement;
  private readonly tip: HTMLDivElement;
  private readonly ro: ResizeObserver;
  private pending: { x: number; y: number } | null = null;
  private raf = 0;
  private readonly onMessage: (e: MessageEvent<FromWorker>) => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly worker: Worker,
    options: ChartOptions,
    private readonly config: WorkerChartOptions = {},
  ) {
    injectStyles(container.ownerDocument);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { width: '100%', height: '100%', display: 'block' });
    this.canvas.setAttribute('role', 'img');
    const title = typeof options.title === 'string' ? options.title : options.title?.text;
    this.canvas.setAttribute('aria-label', options.description ?? title ?? 'Chart');
    this.tip = document.createElement('div');
    this.tip.className = 'rgl-tooltip';
    Object.assign(this.tip.style, { position: 'absolute', pointerEvents: 'none', opacity: '0', transition: 'opacity .12s', zIndex: '5' });
    container.append(this.canvas, this.tip);
    const r = container.getBoundingClientRect();
    const off = this.canvas.transferControlToOffscreen();
    this.send({ type: 'init', canvas: off, width: r.width, height: r.height, dpr: window.devicePixelRatio || 1, options: cloneable(options), prefer: config.prefer }, [off]);

    this.onMessage = (e) => {
      const m = e.data;
      if (m.type === 'tooltip') this.showTip(m.tip);
      else if (m.type === 'ready') this.config.onReady?.(m.backend);
      else if (m.type === 'error') this.config.onError?.(m.message);
      else if (m.type === 'frame') this.config.onFrameStats?.({ fps: m.fps, frameMs: m.frameMs });
    };
    worker.addEventListener('message', this.onMessage);
    this.ro = new ResizeObserver(() => {
      const b = container.getBoundingClientRect();
      this.send({ type: 'resize', width: b.width, height: b.height, dpr: window.devicePixelRatio || 1 });
    });
    this.ro.observe(container);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerleave', this.leave);
  }

  private send(m: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(m, transfer);
  }

  private move = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.pending = { x: e.clientX - r.left, y: e.clientY - r.top };
    // One pointer message per frame at most.
    if (!this.raf)
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        if (this.pending) this.send({ type: 'pointer', ...this.pending });
      });
  };

  private leave = () => {
    this.pending = null;
    this.send({ type: 'leave' });
  };

  private showTip(t: WorkerTooltip | null): void {
    if (!t) {
      this.tip.style.opacity = '0';
      return;
    }
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    this.tip.innerHTML = `${t.header ? `<div class="rgl-tooltip-header">${esc(t.header)}</div>` : ''}<div class="rgl-tooltip-row"><span class="rgl-tooltip-swatch" style="background:${esc(t.color)}"></span><span>${esc(t.label)}</span><b style="margin-left:12px">${esc(t.value)}</b></div>`;
    const w = this.container.clientWidth;
    this.tip.style.left = `${Math.min(Math.max(4, t.x - this.tip.offsetWidth / 2), w - this.tip.offsetWidth - 4)}px`;
    this.tip.style.top = `${Math.max(4, t.y - this.tip.offsetHeight - 12)}px`;
    this.tip.style.opacity = '1';
  }

  setOptions(options: ChartOptions, animate = true): void {
    this.send({ type: 'options', options: cloneable(options), animate });
  }

  appendData(seriesIndex: number, values: unknown[], maxPoints?: number): void {
    this.send({ type: 'append', seriesIndex, values, maxPoints });
  }

  destroy(): void {
    this.send({ type: 'dispose' });
    this.worker.removeEventListener('message', this.onMessage);
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
    this.tip.remove();
  }
}
