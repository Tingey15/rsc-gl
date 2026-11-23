import type { LegendEntry } from '../series/types';
import type { LegendOptions } from '../types';

export interface LegendCallbacks {
  onToggle(entry: LegendEntry): void;
  onHover(entry: LegendEntry | null): void;
}

function swatch(entry: LegendEntry): string {
  const c = entry.color;
  switch (entry.shape) {
    case 'gradient': {
      const stops = (entry.gradient ?? [c]).join(', ');
      return `<span class="rgl-swatch" style="font-size:11px;opacity:.75">${escape(entry.min ?? '')}</span><span class="rgl-swatch" style="width:120px;height:10px;border-radius:5px;background:linear-gradient(90deg, ${stops})"></span><span class="rgl-swatch" style="font-size:11px;opacity:.75">${escape(entry.max ?? '')}</span>`;
    }
    case 'line': {
      const dash = entry.dash && entry.dash.length ? `stroke-dasharray="${entry.dash.join(' ')}"` : '';
      return `<svg class="rgl-swatch" width="18" height="10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" stroke="${c}" stroke-width="2.5" stroke-linecap="round" ${dash}/></svg>`;
    }
    case 'circle':
      return `<svg class="rgl-swatch" width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="${c}"/></svg>`;
    case 'area':
      return `<svg class="rgl-swatch" width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${c}" fill-opacity=".55"/><rect y="0" width="12" height="2.5" rx="1" fill="${c}"/></svg>`;
    default:
      return `<svg class="rgl-swatch" width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${c}"/></svg>`;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

/** HTML legend. Rendered as buttons when toggleable so it is keyboard accessible. */
export class LegendView {
  readonly el: HTMLElement;
  private entries: LegendEntry[] = [];

  constructor(private readonly callbacks: LegendCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'rgl-legend';
    this.el.setAttribute('role', 'list');
    this.el.addEventListener('pointerleave', () => this.callbacks.onHover(null));
  }

  private signature = '';
  private hidden = new Set<string>();

  update(entries: LegendEntry[], options: LegendOptions, hidden: Set<string>): void {
    this.hidden = hidden;
    const visible = entries.filter((e) => !options.hiddenEntries?.includes(e.id));
    const sig = JSON.stringify([visible.map((e) => [e.id, e.label, e.color, e.shape, e.dash]), options.labels, options.title, options.toggleable, options.highlight, options.position, options.align, options.descriptions]);
    if (sig === this.signature) {
      // Same entries: update state in place so keyboard focus survives toggles.
      this.el.querySelectorAll<HTMLElement>('.rgl-legend-item').forEach((node) => {
        const e = this.entries[Number(node.dataset.i)];
        const isHidden = hidden.has(e.id);
        node.toggleAttribute('data-hidden', isHidden);
        if (node.hasAttribute('aria-pressed')) node.setAttribute('aria-pressed', String(!isHidden));
      });
      return;
    }
    this.signature = sig;
    this.entries = visible;
    const vertical = options.position === 'left' || options.position === 'right';
    this.el.toggleAttribute('data-vertical', vertical);
    this.el.style.justifyContent = vertical ? '' : options.align === 'end' ? 'flex-end' : options.align === 'start' ? 'flex-start' : 'center';
    const toggleable = options.toggleable !== false;
    const tag = toggleable ? 'button' : 'div';
    const html: string[] = [];
    if (options.title) html.push(`<div class="rgl-legend-title">${escape(options.title)}</div>`);
    this.entries.forEach((e, i) => {
      const label = options.labels?.[e.id] ?? e.label;
      const desc = options.descriptions?.[e.id];
      const isHidden = hidden.has(e.id);
      html.push(
        `<${tag} class="rgl-legend-item" role="listitem" data-i="${i}" ${toggleable ? `data-toggleable type="button" aria-pressed="${!isHidden}"` : ''} ${isHidden ? 'data-hidden' : ''} ${desc ? `title="${escape(desc)}"` : ''}>${swatch(e)}<span class="rgl-legend-label">${escape(label)}</span></${tag}>`,
      );
    });
    this.el.innerHTML = html.join('');
    this.el.querySelectorAll<HTMLElement>('.rgl-legend-item').forEach((node) => {
      const entry = this.entries[Number(node.dataset.i)];
      if (toggleable) node.addEventListener('click', () => this.callbacks.onToggle(entry));
      if (options.highlight !== false) {
        node.addEventListener('pointerenter', () => !this.hidden.has(entry.id) && this.callbacks.onHover(entry));
        node.addEventListener('focus', () => !this.hidden.has(entry.id) && this.callbacks.onHover(entry));
        node.addEventListener('blur', () => this.callbacks.onHover(null));
      }
    });
  }

  /** Dims entries that are not the highlighted series. */
  setFaded(seriesIndex: number | null, dataIndex?: number): void {
    this.el.querySelectorAll<HTMLElement>('.rgl-legend-item').forEach((node) => {
      const e = this.entries[Number(node.dataset.i)];
      const match = seriesIndex === null || (e.seriesIndex === seriesIndex && (e.dataIndex === undefined || dataIndex === undefined || dataIndex < 0 || e.dataIndex === dataIndex));
      node.toggleAttribute('data-faded', !match);
    });
  }
}
