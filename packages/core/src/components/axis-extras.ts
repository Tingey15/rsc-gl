import { isOrdinal, isTimeScale, type DomainValue } from '../scales/scales';
import type { Rect } from '../series/types';
import { resolveColor, rgbaToCss } from '../theme/colors';
import type { ChartTheme } from '../theme/theme';
import type { AxisAnnotation, AxisGroupLevel } from '../types';
import type { AxisLayout, CartesianLayout } from './axes';
import { loadImage } from './images';

/** Thickness of the annotation lane (px). */
export const ANNOTATION_LANE = 16;

export interface GroupRun {
  label: string;
  start: number;
  end: number;
}

/** Consecutive categories sharing a group key, with their pixel extents. */
export function groupRuns(a: AxisLayout, level: AxisGroupLevel): GroupRun[] {
  const s = a.scale;
  const dom = s.domain();
  const step = Math.abs(s.step()) || 0;
  const bw = s.bandwidth();
  const pad = bw > 0 ? (step - bw) / 2 : step / 2;
  const runs: GroupRun[] = [];
  dom.forEach((v, i) => {
    const key = level.getValue(v, i);
    const label = key === null || key === undefined ? '' : level.format ? level.format(String(key)) : String(key);
    const p0 = s.map(v);
    const lo = Math.min(p0, p0 + bw) - pad;
    const hi = Math.max(p0, p0 + bw) + pad;
    const last = runs[runs.length - 1];
    if (last && last.label === label) {
      last.start = Math.min(last.start, lo);
      last.end = Math.max(last.end, hi);
    } else runs.push({ label, start: lo, end: hi });
  });
  return runs;
}

/** Draws a tick thumbnail; SVG contexts receive the URL directly. */
export function drawThumb(g: CanvasRenderingContext2D, url: string | undefined, x: number, y: number, size: number, radius: number): void {
  if (!url) return;
  const svg = g as unknown as { drawImageUrl?: (u: string, x: number, y: number, w: number, h: number, r: number) => void };
  if (typeof svg.drawImageUrl === 'function') {
    svg.drawImageUrl(url, x, y, size, size, radius);
    return;
  }
  const img = loadImage(url);
  if (!img) return;
  g.save();
  g.beginPath();
  g.roundRect(x, y, size, size, radius);
  g.clip();
  const k = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  g.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  g.restore();
}

/** Bracketed group labels, one row (x) or column (y) per level. */
export function drawGroups(g: CanvasRenderingContext2D, a: AxisLayout, plot: Rect, theme: ChartTheme, origin: number, dir: number): void {
  const levels = isOrdinal(a.scaleType) ? (a.options.groups ?? []) : [];
  if (!levels.length || !a.box) return;
  const box = a.box;
  let c = box.group;
  g.save();
  g.strokeStyle = theme.axisColor;
  g.fillStyle = theme.textColor;
  g.font = `600 ${theme.fontSize}px ${theme.fontFamily}`;
  levels.forEach((level, li) => {
    const size = box.groupSizes[li] ?? 0;
    for (const r of groupRuns(a, level)) {
      if (a.direction === 'x') {
        const lo = Math.max(plot.x, r.start);
        const hi = Math.min(plot.x + plot.width, r.end);
        if (hi <= lo) continue;
        g.beginPath();
        g.moveTo(Math.round(lo) + 0.5, origin + dir * (c - 2));
        g.lineTo(Math.round(lo) + 0.5, origin + dir * (c + size - 2));
        g.moveTo(Math.round(hi) - 0.5, origin + dir * (c - 2));
        g.lineTo(Math.round(hi) - 0.5, origin + dir * (c + size - 2));
        g.stroke();
        g.textAlign = 'center';
        g.textBaseline = dir > 0 ? 'top' : 'bottom';
        g.fillText(r.label, (lo + hi) / 2, origin + dir * (c + 3));
      } else {
        const lo = Math.max(plot.y, r.start);
        const hi = Math.min(plot.y + plot.height, r.end);
        if (hi <= lo) continue;
        g.beginPath();
        g.moveTo(origin + dir * (c + 2), Math.round(lo) + 0.5);
        g.lineTo(origin + dir * (c + size - 2), Math.round(lo) + 0.5);
        g.moveTo(origin + dir * (c + 2), Math.round(hi) - 0.5);
        g.lineTo(origin + dir * (c + size - 2), Math.round(hi) - 0.5);
        g.stroke();
        g.textAlign = dir < 0 ? 'right' : 'left';
        g.textBaseline = 'middle';
        g.fillText(r.label, origin + dir * (c + 6), (lo + hi) / 2);
      }
    }
    c += size;
  });
  g.restore();
}

/** Hit box of a drawn axis annotation (plot-element coordinates). */
export interface AxisAnnotationBox {
  axisId: string;
  direction: 'x' | 'y';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Annotations represented by this box (several for a summary badge). */
  annotations: AxisAnnotation[];
  color: string;
  label: string;
  summary: boolean;
}

function posOf(a: AxisLayout, v: DomainValue | undefined, edge: 'start' | 'end' | 'mid'): number | null {
  if (v === undefined || v === null) return null;
  const s = a.scale;
  const bw = s.bandwidth();
  const val = typeof v === 'string' && isTimeScale(a.scaleType) ? Date.parse(v) : v;
  const raw = s.map(val);
  if (!Number.isFinite(raw)) return null;
  if (!bw) return raw;
  const lo = Math.min(raw, raw + bw);
  return edge === 'start' ? lo : edge === 'end' ? lo + bw : lo + bw / 2;
}

/** Geometry of every annotation marker / span on the cartesian axes. */
export function axisAnnotationBoxes(layout: CartesianLayout, theme: ChartTheme, measure?: (t: string) => number): AxisAnnotationBox[] {
  const out: AxisAnnotationBox[] = [];
  const { plot } = layout;
  const L = ANNOTATION_LANE;
  for (const a of [...layout.xAxes, ...layout.yAxes]) {
    const list = a.options.annotations;
    if (!list?.length || !a.box || a.position === 'none') continue;
    const horizontal = a.direction === 'x';
    const dir = a.position === 'bottom' || a.position === 'right' ? 1 : -1;
    const origin = horizontal ? (dir > 0 ? plot.y + plot.height + a.offset : plot.y - a.offset) : dir > 0 ? plot.x + plot.width + a.offset : plot.x - a.offset;
    const laneStart = origin + dir * (a.box.annotation + 3);
    const lane = (from: number, to: number) =>
      horizontal ? { x: from, y: dir > 0 ? laneStart : laneStart - L, width: to - from, height: L } : { x: dir > 0 ? laneStart : laneStart - L, y: from, width: L, height: to - from };
    const lo = horizontal ? plot.x : plot.y;
    const hi = horizontal ? plot.x + plot.width : plot.y + plot.height;
    if (a.options.annotationFormat === 'summary') {
      const label = `${list.length} annotation${list.length === 1 ? '' : 's'}`;
      const w = (measure ? measure(label) : label.length * 6.5) + 26;
      const start = horizontal ? hi - w : lo;
      out.push({ axisId: a.id, direction: a.direction, ...lane(start, start + (horizontal ? w : Math.min(w, hi - lo))), annotations: list, color: rgbaToCss(resolveColor(list[0].color ?? theme.axisColor, theme.scheme)), label, summary: true });
      continue;
    }
    for (const ann of list) {
      const color = rgbaToCss(resolveColor(ann.color ?? theme.mutedTextColor, theme.scheme));
      if (ann.start !== undefined || ann.end !== undefined) {
        const p0 = posOf(a, ann.start ?? ann.end, 'start');
        const p1 = posOf(a, ann.end ?? ann.start, 'end');
        if (p0 === null || p1 === null) continue;
        const from = Math.max(lo, Math.min(p0, p1));
        const to = Math.min(hi, Math.max(p0, p1));
        if (to - from < 1) continue;
        out.push({ axisId: a.id, direction: a.direction, ...lane(from, to), annotations: [ann], color, label: ann.label ?? '', summary: false });
      } else {
        const p = posOf(a, ann.value, 'mid');
        if (p === null || p < lo - 1 || p > hi + 1) continue;
        out.push({ axisId: a.id, direction: a.direction, ...lane(p - L / 2, p + L / 2), annotations: [ann], color, label: ann.label ?? '', summary: false });
      }
    }
  }
  return out;
}

export function drawAnnotations(g: CanvasRenderingContext2D, a: AxisLayout, plot: Rect, theme: ChartTheme): void {
  const boxes = axisAnnotationBoxes({ plot, xAxes: a.direction === 'x' ? [a] : [], yAxes: a.direction === 'y' ? [a] : [] }, theme, (t) => g.measureText(t).width);
  const horizontal = a.direction === 'x';
  g.save();
  g.font = `600 ${theme.fontSize - 1}px ${theme.fontFamily}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  for (const b of boxes) {
    const ann = b.annotations[0];
    const isSpan = b.summary || ann.start !== undefined || ann.end !== undefined;
    if (isSpan) {
      g.fillStyle = b.color;
      g.globalAlpha = 0.2;
      g.beginPath();
      g.roundRect(b.x, b.y, b.width, b.height, 4);
      g.fill();
      g.globalAlpha = 1;
      // Solid edges mark where the span starts and ends.
      if (horizontal) {
        g.fillRect(b.x, b.y, 2, b.height);
        g.fillRect(b.x + b.width - 2, b.y, 2, b.height);
      } else {
        g.fillRect(b.x, b.y, b.width, 2);
        g.fillRect(b.x, b.y + b.height - 2, b.width, 2);
      }
      if (b.label && horizontal && g.measureText(b.label).width < b.width - 10) {
        g.fillStyle = theme.textColor;
        g.fillText(b.label, b.x + 6, b.y + b.height / 2);
      }
    } else {
      drawIcon(g, ann.icon ?? 'dot', b.x + b.width / 2, b.y + b.height / 2, b.color);
      if (b.label && horizontal) {
        g.fillStyle = theme.mutedTextColor;
        g.fillText(b.label, b.x + b.width + 2, b.y + b.height / 2);
      }
    }
  }
  g.restore();
}

export function drawIcon(g: CanvasRenderingContext2D, icon: NonNullable<AxisAnnotation['icon']>, x: number, y: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  switch (icon) {
    case 'diamond':
      g.moveTo(x, y - 6);
      g.lineTo(x + 6, y);
      g.lineTo(x, y + 6);
      g.lineTo(x - 6, y);
      g.closePath();
      break;
    case 'triangle':
      g.moveTo(x, y - 6);
      g.lineTo(x + 6, y + 5);
      g.lineTo(x - 6, y + 5);
      g.closePath();
      break;
    case 'flag':
      g.rect(x - 4, y - 7, 1.6, 14);
      g.fill();
      g.beginPath();
      g.moveTo(x - 2.4, y - 7);
      g.lineTo(x + 6, y - 4);
      g.lineTo(x - 2.4, y - 1);
      g.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 2.8 : 6.5;
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        if (i === 0) g.moveTo(x + r * Math.cos(ang), y + r * Math.sin(ang));
        else g.lineTo(x + r * Math.cos(ang), y + r * Math.sin(ang));
      }
      g.closePath();
      break;
    default:
      g.arc(x, y, 5, 0, Math.PI * 2);
  }
  g.fill();
}
