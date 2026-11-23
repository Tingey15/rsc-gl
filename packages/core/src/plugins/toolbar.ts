import type { Chart } from '../chart/chart';
import type { ChartPlugin } from '../chart/plugin';

export type ToolbarBuiltin = 'zoomIn' | 'zoomOut' | 'resetZoom' | 'downloadPng' | 'downloadSvg' | 'downloadCsv' | 'downloadXlsx' | 'copy' | 'print' | 'fullscreen';

export interface ToolbarItem {
  id: string;
  label: string;
  /** SVG markup (24×24 viewBox, `currentColor`). */
  icon?: string;
  onClick: (chart: Chart) => void;
}

export interface ToolbarOptions {
  /** Built-in ids and / or custom items, in display order. */
  items?: Array<ToolbarBuiltin | ToolbarItem>;
  /** 'hover' shows the bar while the pointer or focus is on the chart. Default 'hover'. */
  visibility?: 'hover' | 'always';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

const I = (d: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const BUILTIN: Record<ToolbarBuiltin, { label: string; icon: string; zoom?: boolean; run: (c: Chart) => void }> = {
  zoomIn: { label: 'Zoom in', icon: I('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>'), zoom: true, run: (c) => zoomBy(c, 0.6) },
  zoomOut: { label: 'Zoom out', icon: I('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>'), zoom: true, run: (c) => zoomBy(c, 1 / 0.6) },
  resetZoom: { label: 'Reset zoom', icon: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'), zoom: true, run: (c) => c.zoomableAxes().forEach((a) => c.setZoom(a.id, null, true)) },
  downloadPng: { label: 'Download PNG', icon: I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>'), run: (c) => void c.download() },
  downloadSvg: { label: 'Download SVG', icon: I('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'), run: (c) => c.downloadSvg() },
  downloadCsv: { label: 'Download CSV', icon: I('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h8"/>'), run: (c) => c.downloadData('csv') },
  downloadXlsx: { label: 'Download spreadsheet (.xlsx)', icon: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'), run: (c) => c.downloadData('xlsx') },
  copy: { label: 'Copy image', icon: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'), run: (c) => void c.copyToClipboard() },
  print: { label: 'Print', icon: I('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'), run: (c) => c.print() },
  fullscreen: {
    label: 'Full screen',
    icon: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    run: (c) => {
      const el = c.root;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen?.();
    },
  },
};

const DEFAULT_ITEMS: ToolbarBuiltin[] = ['zoomIn', 'zoomOut', 'resetZoom', 'downloadPng', 'downloadSvg', 'downloadCsv', 'print', 'fullscreen'];

function zoomBy(c: Chart, factor: number): void {
  for (const a of c.zoomableAxes()) {
    const full = c.fullDomain(a.id);
    const cur = c.getZoom(a.id) ?? full;
    const mid = (cur[0] + cur[1]) / 2;
    const half = ((cur[1] - cur[0]) * factor) / 2;
    const lo = Math.max(full[0], mid - half);
    const hi = Math.min(full[1], mid + half);
    if (hi - lo >= full[1] - full[0] - 1e-9) c.setZoom(a.id, null, true);
    else c.setZoom(a.id, [lo, hi], true);
  }
}

let styled = false;
function injectToolbarStyles(doc: Document): void {
  if (styled) return;
  styled = true;
  const st = doc.createElement('style');
  st.textContent = `
.rgl-toolbar{position:absolute;z-index:4;display:flex;gap:2px;padding:3px;border-radius:9px;background:var(--rgl-tooltip-bg);border:1px solid var(--rgl-tooltip-border);box-shadow:0 4px 14px rgba(0,0,0,.12);transition:opacity .15s ease}
.rgl-toolbar[data-visibility=hover]{opacity:0;pointer-events:none}
.rgl-root:hover .rgl-toolbar,.rgl-root:focus-within .rgl-toolbar{opacity:1;pointer-events:auto}
.rgl-toolbar button{all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:6px;color:var(--rgl-text)}
.rgl-toolbar button:hover{background:var(--rgl-hover)}
.rgl-toolbar button:focus-visible{outline:2px solid var(--rgl-focus);outline-offset:1px}
.rgl-toolbar button[disabled]{opacity:.35;cursor:default}
.rgl-root:fullscreen{background:var(--rgl-tooltip-bg);padding:16px}`;
  doc.head.appendChild(st);
}

/**
 * Chart toolbar: zoom controls, image / vector / data downloads, copy, print
 * and full screen, plus custom actions. Zoom buttons only appear on charts
 * with zoomable axes.
 */
export function toolbarPlugin(options: ToolbarOptions = {}): ChartPlugin {
  let el: HTMLElement | null = null;
  let chart: Chart | null = null;
  const render = () => {
    if (!el || !chart) return;
    const c = chart;
    const zoomable = c.zoomableAxes().length > 0;
    el.innerHTML = '';
    for (const item of options.items ?? DEFAULT_ITEMS) {
      const spec = typeof item === 'string' ? BUILTIN[item] : null;
      if (spec?.zoom && !zoomable) continue;
      if (typeof item === 'string' && !spec) continue;
      const b = document.createElement('button');
      b.type = 'button';
      const label = spec ? spec.label : (item as ToolbarItem).label;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = spec ? spec.icon : ((item as ToolbarItem).icon ?? `<span style="font:600 11px var(--rgl-font);padding:0 6px">${label.replace(/[<&]/g, '')}</span>`);
      if (!spec && !(item as ToolbarItem).icon) b.style.width = 'auto';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (spec) spec.run(c);
        else (item as ToolbarItem).onClick(c);
      });
      el.appendChild(b);
    }
  };
  let lastZoomable: boolean | null = null;
  return {
    name: 'toolbar',
    attach(c) {
      chart = c;
      injectToolbarStyles(c.root.ownerDocument);
      el = document.createElement('div');
      el.className = 'rgl-toolbar';
      el.setAttribute('role', 'toolbar');
      el.setAttribute('aria-label', 'Chart actions');
      el.dataset.visibility = options.visibility ?? 'hover';
      const pos = options.position ?? 'top-right';
      el.style[pos.startsWith('top') ? 'top' : 'bottom'] = '6px';
      el.style[pos.endsWith('right') ? 'right' : 'left'] = '6px';
      // Pointer events on the bar must not reach the plot (tooltips, marquee).
      for (const t of ['pointerdown', 'pointermove', 'wheel', 'dblclick'] as const) el.addEventListener(t, (e) => e.stopPropagation());
      c.plotEl.appendChild(el);
      render();
    },
    layout(c) {
      const z = c.zoomableAxes().length > 0;
      if (z !== lastZoomable) {
        lastZoomable = z;
        render();
      }
    },
    destroy() {
      el?.remove();
      el = null;
      chart = null;
    },
  };
}
