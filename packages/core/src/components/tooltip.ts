import type { TooltipContext, TooltipOptions } from '../types';

const escape = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Positioned HTML tooltip. Content is either built in, a DOM render hook, or provided by the host. */
export class TooltipView {
  readonly el: HTMLElement;
  private open = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'rgl-tooltip';
    this.el.setAttribute('role', 'tooltip');
  }

  show(ctx: TooltipContext, options: TooltipOptions, bounds: { width: number; height: number }, activeSeries?: string): void {
    if (!options.customContent) {
      if (options.render) {
        const out = options.render(ctx);
        if (out === null) return this.hide();
        if (typeof out === 'string') this.el.innerHTML = out;
        else this.el.replaceChildren(out);
      } else {
        this.el.innerHTML = defaultContent(ctx, options, activeSeries);
      }
    }
    this.el.toggleAttribute('data-open', true);
    this.open = true;
    this.position(ctx.x, ctx.y, options, bounds);
  }

  position(x: number, y: number, options: TooltipOptions, bounds: { width: number; height: number }): void {
    const w = this.el.offsetWidth || 160;
    const h = this.el.offsetHeight || 60;
    const gap = 12;
    const placement = options.placement ?? (options.anchor === 'mark' ? 'top' : 'right');
    let left = x;
    let top = y;
    switch (placement) {
      case 'top':
        left = x - w / 2;
        top = y - h - gap;
        break;
      case 'bottom':
        left = x - w / 2;
        top = y + gap;
        break;
      case 'left':
        left = x - w - gap;
        top = y - h / 2;
        break;
      default:
        left = x + gap;
        top = y - h / 2;
    }
    // Flip / clamp inside the chart.
    if (left + w > bounds.width) left = placement === 'right' ? x - w - gap : bounds.width - w - 2;
    if (left < 0) left = placement === 'left' ? x + gap : 2;
    if (top < 0) top = placement === 'top' ? y + gap : 2;
    if (top + h > bounds.height) top = Math.max(2, bounds.height - h - 2);
    this.el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.removeAttribute('data-open');
  }

  get isOpen(): boolean {
    return this.open;
  }
}

function defaultContent(ctx: TooltipContext, options: TooltipOptions, active?: string): string {
  let items = [...ctx.items];
  if (options.sort === 'asc') items.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  else if (options.sort === 'desc') items.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  items = items.filter((i) => i.formattedValue !== '' || i.value !== null);
  const header = ctx.axisLabel ? `<div class="rgl-tooltip-header">${escape(ctx.axisLabel)}</div>` : '';
  const rows = items
    .map(
      (i) =>
        `<div class="rgl-tooltip-row" ${i.seriesId === active && items.length > 1 ? 'data-active' : ''}><span class="rgl-tooltip-swatch" style="background:${i.color}"></span><span class="rgl-tooltip-label">${escape(i.label ?? i.seriesLabel)}</span><span class="rgl-tooltip-value">${escape(i.formattedValue)}</span></div>`,
    )
    .join('');
  return header + rows;
}
