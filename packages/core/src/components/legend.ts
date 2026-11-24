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

  /** Returns true when the legend's DOM changed (its size may differ). */
  update(entries: LegendEntry[], options: LegendOptions, hidden: Set<string>): boolean {
    this.hidden = hidden;
    const visible = entries.filter((e) => !options.hiddenEntries?.includes(e.id));
    const sig = JSON.stringify([
      visible.map((e) => [e.id, e.label, e.color, e.shape, e.dash]),
      options.labels,
      options.title,
      options.toggleable,
      options.clickable,
      options.highlight,
      options.position,
      options.align,
      options.descriptions,
      options.labelLimit,
      options.titleLimit,
    ]);
    if (sig === this.signature) {
      // Same entries: update state in place so keyboard focus survives toggles.
      // Only touch nodes whose state changed (no style invalidation on plain data updates).
      this.el.querySelectorAll<HTMLElement>('.rgl-legend-item').forEach((node) => {
        const e = this.entries[Number(node.dataset.i)];
        const isHidden = hidden.has(e.id);
        if (node.hasAttribute('data-hidden') !== isHidden) node.toggleAttribute('data-hidden', isHidden);
        if (node.hasAttribute('aria-pressed') && node.getAttribute('aria-pressed') !== String(!isHidden)) node.setAttribute('aria-pressed', String(!isHidden));
      });
      return false;
    }
    this.signature = sig;
    this.entries = visible;
    const vertical = options.position === 'left' || options.position === 'right';
    this.el.toggleAttribute('data-vertical', vertical);
    this.el.style.justifyContent = vertical ? '' : options.align === 'end' ? 'flex-end' : options.align === 'start' ? 'flex-start' : 'center';
    const toggleable = options.toggleable !== false;
    // Entries are real buttons whenever a click does something (toggle or callback).
    const clickable = toggleable || !!options.clickable;
    const tag = clickable ? 'button' : 'div';
    // A list of buttons is a group (role="listitem" would hide the button role and its pressed state).
    this.el.setAttribute('role', clickable ? 'group' : 'list');
    this.el.setAttribute('aria-label', options.title ?? 'Legend');
    const html: string[] = [];
    const limit = (px: number | undefined) => (px ? ` style="max-width:${px}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom"` : '');
    if (options.title) html.push(`<div class="rgl-legend-title" title="${escape(options.title)}"${limit(options.titleLimit)}>${escape(options.title)}</div>`);
    this.entries.forEach((e, i) => {
      const label = options.labels?.[e.id] ?? e.label;
      const desc = options.descriptions?.[e.id];
      const isHidden = hidden.has(e.id);
      // Full text on hover when the label may be cut off, otherwise the description.
      const tip = desc ?? (options.labelLimit ? label : undefined);
      const attrs = clickable ? `type="button" ${toggleable ? `data-toggleable aria-pressed="${!isHidden}"` : ''}` : 'role="listitem"';
      html.push(
        `<${tag} class="rgl-legend-item" data-i="${i}" ${attrs} ${isHidden ? 'data-hidden' : ''} ${tip ? `title="${escape(tip)}"` : ''}>${swatch(e)}<span class="rgl-legend-label"${limit(options.labelLimit)}>${escape(label)}</span></${tag}>`,
      );
    });
    this.el.innerHTML = html.join('');
    this.el.querySelectorAll<HTMLElement>('.rgl-legend-item').forEach((node) => {
      const entry = this.entries[Number(node.dataset.i)];
      if (clickable) node.addEventListener('click', () => this.callbacks.onToggle(entry));
      if (options.highlight !== false) {
        node.addEventListener('pointerenter', () => !this.hidden.has(entry.id) && this.callbacks.onHover(entry));
        node.addEventListener('focus', () => !this.hidden.has(entry.id) && this.callbacks.onHover(entry));
        node.addEventListener('blur', () => this.callbacks.onHover(null));
      }
    });
    return true;
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
