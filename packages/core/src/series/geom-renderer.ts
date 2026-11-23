import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import { EASING_ID, ease } from '../animation/easing';
import { ArcMark, type ArcAttrs } from '../marks/arc-mark';
import type { FrameState, MarkItem } from '../marks/instance-mark';
import { MeshMark, hitTriangles, type MeshItem } from '../marks/mesh-mark';
import { LineMark, type LineStyle, type PathPoint } from '../marks/path-mark';
import { PointMark, type PointAttrs } from '../marks/point-mark';
import { RectMark, type RectAttrs, type RectStyle } from '../marks/rect-mark';
import type { TooltipItem } from '../types';
import type { HitResult, LayoutContext, ResolvedSeries, SeriesRenderer } from './types';

export interface GeomLabel {
  text: string;
  x: number;
  y: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** CSS font weight / size override, e.g. '600 12px'. */
  font?: string;
  /** Hide when wider than this (px). */
  maxWidth?: number;
  /** Paints a rounded badge behind the text. */
  background?: string;
}

export type GeomHit =
  | { kind: 'rect'; key: string; series: ResolvedSeries; dataIndex: number; anchor: { x: number; y: number } }
  | { kind: 'mesh'; key: string; series: ResolvedSeries; dataIndex: number; anchor: { x: number; y: number } }
  | { kind: 'arc'; key: string; series: ResolvedSeries; dataIndex: number; anchor: { x: number; y: number } }
  | { kind: 'circle'; key: string; series: ResolvedSeries; dataIndex: number; anchor: { x: number; y: number }; cx: number; cy: number; r: number };

export interface GeomLine {
  key: string;
  points: PathPoint[];
  style: LineStyle;
}

export interface GeomOutput {
  rects?: MarkItem<RectAttrs>[];
  rectStyle?: Partial<RectStyle>;
  meshes?: MeshItem[];
  arcs?: MarkItem<ArcAttrs>[];
  arcStyle?: { padding?: number; cornerRadius?: number; hoverGrow?: number };
  points?: MarkItem<PointAttrs>[];
  lines?: GeomLine[];
  labels?: GeomLabel[];
  hits?: GeomHit[];
  /** Items listed in the axis tooltip for a category. */
  axisItems?: (index: number, value: unknown) => TooltipItem[];
}

/**
 * Base renderer for series built from marks: subclasses return geometry,
 * this class keeps the GPU marks, animates them, fades labels in, and
 * performs hit testing on the animated (on-screen) state.
 */
export abstract class GeomRenderer implements SeriesRenderer {
  private rects: RectMark | null = null;
  private meshes: MeshMark | null = null;
  private arcs: ArcMark | null = null;
  private points: PointMark | null = null;
  private lines = new Map<string, LineMark>();
  private lineOrder: string[] = [];
  private labels: GeomLabel[] = [];
  private hits: GeomHit[] = [];
  private labelStart = 0;
  private labelDuration = 0;
  private axisItems: GeomOutput['axisItems'];

  constructor(protected device: GpuDevice) {}

  protected abstract build(series: ResolvedSeries[], ctx: LayoutContext): GeomOutput;

  layout(all: ResolvedSeries[], ctx: LayoutContext): void {
    const out = this.build(all.filter((s) => !s.hidden), ctx);
    const t = ctx.transition;
    if (out.rects || this.rects) {
      this.rects ??= new RectMark(this.device);
      this.rects.style = { strokeColor: [0, 0, 0, 0], strokeWidth: 0, hoverGrow: 0, ...out.rectStyle };
      this.rects.update(out.rects ?? [], t, ctx.now);
    }
    if (out.meshes || this.meshes) {
      this.meshes ??= new MeshMark(this.device);
      this.meshes.update(out.meshes ?? [], t, ctx.now);
    }
    if (out.arcs || this.arcs) {
      this.arcs ??= new ArcMark(this.device);
      this.arcs.padding = out.arcStyle?.padding ?? 1;
      this.arcs.cornerRadius = out.arcStyle?.cornerRadius ?? 0;
      this.arcs.hoverGrow = out.arcStyle?.hoverGrow ?? 4;
      this.arcs.update(out.arcs ?? [], t, ctx.now);
    }
    if (out.points || this.points) {
      this.points ??= new PointMark(this.device);
      this.points.strokeWidth = 1.5;
      this.points.update(out.points ?? [], t, ctx.now);
    }
    const seen = new Set<string>();
    for (const l of out.lines ?? []) {
      seen.add(l.key);
      let m = this.lines.get(l.key);
      if (!m) {
        m = new LineMark(this.device);
        this.lines.set(l.key, m);
      }
      m.style = l.style;
      m.update(l.points, t, ctx.now, (p) => ({ x: p.x, y: l.points[0]?.y ?? p.y, y0: 0 }));
    }
    for (const [k, m] of this.lines) {
      if (!seen.has(k)) {
        m.destroy();
        this.lines.delete(k);
      }
    }
    this.lineOrder = (out.lines ?? []).map((l) => l.key);
    this.labels = out.labels ?? [];
    this.hits = out.hits ?? [];
    this.axisItems = out.axisItems;
    this.labelStart = ctx.now;
    this.labelDuration = ctx.firstRender ? t.duration : 0;
  }

  draw(pass: RenderPass, frame: FrameState): void {
    this.meshes?.draw(pass, frame);
    this.rects?.draw(pass, frame);
    this.arcs?.draw(pass, frame);
    for (const k of this.lineOrder) this.lines.get(k)?.draw(pass, frame);
    this.points?.draw(pass, frame);
  }

  drawOverlay(g: CanvasRenderingContext2D, ctx: LayoutContext, now: number): void {
    if (!this.labels.length) return;
    // Labels fade in during the entrance (second half of the animation).
    const raw = this.labelDuration > 0 ? (now - this.labelStart) / this.labelDuration : 1;
    const a = ease(Math.min(1, Math.max(0, raw * 2 - 1)), EASING_ID.cubicOut);
    if (a <= 0) return;
    g.save();
    g.globalAlpha = a;
    for (const l of this.labels) {
      g.font = `${l.font ?? `500 ${ctx.theme.fontSize}px`} ${ctx.theme.fontFamily}`;
      if (l.maxWidth !== undefined && g.measureText(l.text).width > l.maxWidth) continue;
      g.textAlign = l.align ?? 'center';
      g.textBaseline = l.baseline ?? 'middle';
      if (l.background) {
        const w = g.measureText(l.text).width + 10;
        const h = ctx.theme.fontSize + 6;
        const x0 = l.align === 'left' ? l.x - 5 : l.align === 'right' ? l.x - w + 5 : l.x - w / 2;
        const y0 = l.baseline === 'top' ? l.y - 3 : l.baseline === 'bottom' ? l.y - h + 3 : l.y - h / 2;
        g.fillStyle = l.background;
        g.beginPath();
        g.roundRect(x0, y0, w, h, 4);
        g.fill();
      }
      g.fillStyle = l.color ?? ctx.theme.textColor;
      g.fillText(l.text, l.x, l.y);
    }
    g.restore();
  }

  toSvg(now: number): string {
    return [this.meshes?.toSvg(now) ?? '', this.rects?.toSvg(now) ?? '', this.arcs?.toSvg(now) ?? '', ...this.lineOrder.map((k) => this.lines.get(k)?.toSvg(now) ?? ''), this.points?.toSvg(now) ?? ''].join('');
  }

  hitTest(x: number, y: number, _ctx: LayoutContext, now: number): HitResult | null {
    let best: HitResult | null = null;
    // Last hit wins (drawn on top).
    for (const h of this.hits) {
      if (h.series.options.excludeFromInteraction) continue;
      let inside = false;
      let distance = 0;
      if (h.kind === 'rect') {
        const r = this.rects?.currentState(h.key, now);
        inside = !!r && x >= Math.min(r.x, r.x + r.width) - 1 && x <= Math.max(r.x, r.x + r.width) + 1 && y >= Math.min(r.y, r.y + r.height) - 1 && y <= Math.max(r.y, r.y + r.height) + 1;
      } else if (h.kind === 'mesh') {
        const tri = this.meshes?.current(h.key, now);
        inside = !!tri && hitTriangles(tri, x, y);
      } else if (h.kind === 'arc') {
        const a = this.arcs?.currentState(h.key, now);
        if (a) {
          const dx = x - a.cx;
          const dy = y - a.cy;
          const r = Math.hypot(dx, dy);
          let ang = Math.atan2(dx, -dy);
          while (ang < a.startAngle) ang += Math.PI * 2;
          while (ang >= a.startAngle + Math.PI * 2) ang -= Math.PI * 2;
          inside = r >= a.innerRadius && r <= a.outerRadius && ang <= a.endAngle;
        }
      } else {
        distance = Math.hypot(x - h.cx, y - h.cy) - h.r;
        inside = distance <= 0;
      }
      if (inside) best = { series: h.series, dataIndex: h.dataIndex, anchor: h.anchor, distance: Math.max(0, distance) };
    }
    return best;
  }

  itemsAtIndex(index: number, value: unknown): TooltipItem[] {
    return this.axisItems?.(index, value) ?? [];
  }

  itemAnchor(seriesId: string, dataIndex: number): { x: number; y: number } | null {
    return this.hits.find((h) => h.series.id === seriesId && h.dataIndex === dataIndex)?.anchor ?? null;
  }

  isAnimating(now: number): boolean {
    return (
      !!this.rects?.isAnimating(now) ||
      !!this.meshes?.isAnimating(now) ||
      !!this.arcs?.isAnimating(now) ||
      !!this.points?.isAnimating(now) ||
      [...this.lines.values()].some((l) => l.isAnimating(now)) ||
      (this.labelDuration > 0 && now - this.labelStart < this.labelDuration)
    );
  }

  setDevice(device: GpuDevice): void {
    this.device = device;
    this.rects?.setDevice(device);
    this.meshes?.setDevice(device);
    this.arcs?.setDevice(device);
    this.points?.setDevice(device);
    for (const l of this.lines.values()) l.setDevice(device);
  }

  destroy(): void {
    this.rects?.destroy();
    this.meshes?.destroy();
    this.arcs?.destroy();
    this.points?.destroy();
    for (const l of this.lines.values()) l.destroy();
    this.lines.clear();
  }
}
