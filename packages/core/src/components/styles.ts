/** Base styles for HTML chart chrome. Injected once per document on first chart creation. */
const CSS = `
.rgl-root{position:relative;box-sizing:border-box;width:100%;height:100%;display:grid;font-family:var(--rgl-font);font-size:var(--rgl-font-size);color:var(--rgl-text);outline:none;min-width:0;min-height:0}
.rgl-root *{box-sizing:border-box}
.rgl-root:focus-visible{box-shadow:0 0 0 2px var(--rgl-focus)}
.rgl-title{grid-area:title;padding:2px 8px 6px;line-height:1.25}
.rgl-title-main{font-size:var(--rgl-title-size);font-weight:700}
.rgl-title-sub{color:var(--rgl-muted);margin-top:2px}
.rgl-plot{grid-area:plot;position:relative;min-width:0;min-height:0;overflow:hidden}
.rgl-plot canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.rgl-overlay{pointer-events:none}
.rgl-legend{grid-area:legend;display:flex;flex-wrap:wrap;gap:4px 14px;padding:6px 8px;align-content:flex-start;user-select:none}
.rgl-legend[data-vertical]{flex-direction:column;flex-wrap:nowrap;overflow:auto;max-height:100%}
.rgl-legend-title{font-weight:600;align-self:center;margin-right:4px}
.rgl-legend[data-vertical] .rgl-legend-title{margin:0 0 2px}
.rgl-legend-item{display:inline-flex;align-items:center;gap:6px;cursor:default;padding:2px 4px;border-radius:4px;border:0;background:none;font:inherit;color:inherit;text-align:left;transition:opacity .15s}
.rgl-legend-item[data-toggleable]{cursor:pointer}
.rgl-legend-item[data-toggleable]:hover{background:var(--rgl-hover)}
.rgl-legend-item[data-hidden]{opacity:.38}
.rgl-legend-item[data-hidden] .rgl-legend-label{text-decoration:line-through}
.rgl-legend-item[data-faded]{opacity:.45}
.rgl-swatch{flex:none;display:inline-block}
.rgl-tooltip{position:absolute;left:0;top:0;pointer-events:none;z-index:5;min-width:120px;max-width:320px;padding:8px 10px;border-radius:8px;background:var(--rgl-tooltip-bg);color:var(--rgl-tooltip-text);border:1px solid var(--rgl-tooltip-border);box-shadow:0 6px 24px rgba(0,0,0,.14);font-size:12px;line-height:1.4;opacity:0;transform:translate3d(-9999px,0,0);transition:opacity .12s ease}
.rgl-tooltip[data-open]{opacity:1}
.rgl-tooltip-header{font-weight:600;margin-bottom:4px}
.rgl-tooltip-row{display:flex;align-items:center;gap:8px;white-space:nowrap}
.rgl-tooltip-row[data-active]{font-weight:600}
.rgl-tooltip-swatch{width:10px;height:10px;border-radius:3px;flex:none}
.rgl-tooltip-label{flex:1;overflow:hidden;text-overflow:ellipsis;color:var(--rgl-muted)}
.rgl-tooltip-value{font-variant-numeric:tabular-nums;font-weight:600}
.rgl-state{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--rgl-muted);z-index:4;pointer-events:none}
.rgl-spinner{width:28px;height:28px;border-radius:50%;border:3px solid var(--rgl-hover);border-top-color:var(--rgl-focus);animation:rgl-spin .8s linear infinite}
@keyframes rgl-spin{to{transform:rotate(360deg)}}
.rgl-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.rgl-focus{position:absolute;pointer-events:none;border:2px solid var(--rgl-focus);border-radius:6px;display:none;z-index:3}
`;

let injected = false;

export function injectStyles(doc: Document = document): void {
  if (injected || typeof doc === 'undefined') return;
  injected = true;
  const style = doc.createElement('style');
  style.setAttribute('data-rsc-gl', '');
  style.textContent = CSS;
  doc.head.appendChild(style);
}
