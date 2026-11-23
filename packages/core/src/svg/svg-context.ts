import { xml } from './svg';

type Matrix = [number, number, number, number, number, number];

const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

interface State {
  m: Matrix;
  font: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  dash: number[];
}

/**
 * A recording subset of CanvasRenderingContext2D that emits SVG elements.
 * Lets the same overlay drawing code (axes, labels, annotations) produce
 * vector output for export and server-side rendering.
 */
export class SvgContext {
  readonly parts: string[] = [];
  private stack: State[] = [];
  private s: State = { m: [1, 0, 0, 1, 0, 0], font: '12px sans-serif', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, textAlign: 'start', textBaseline: 'alphabetic', dash: [] };
  private path = '';
  private measurer: CanvasRenderingContext2D | null;

  constructor(measure?: CanvasRenderingContext2D | null) {
    this.measurer = measure ?? null;
  }

  get font() {
    return this.s.font;
  }
  set font(v: string) {
    this.s.font = v;
  }
  get fillStyle() {
    return this.s.fillStyle;
  }
  set fillStyle(v: string) {
    this.s.fillStyle = String(v);
  }
  get strokeStyle() {
    return this.s.strokeStyle;
  }
  set strokeStyle(v: string) {
    this.s.strokeStyle = String(v);
  }
  get lineWidth() {
    return this.s.lineWidth;
  }
  set lineWidth(v: number) {
    this.s.lineWidth = v;
  }
  get globalAlpha() {
    return this.s.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.s.globalAlpha = v;
  }
  get textAlign() {
    return this.s.textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.s.textAlign = v;
  }
  get textBaseline() {
    return this.s.textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.s.textBaseline = v;
  }

  save() {
    this.stack.push({ ...this.s, m: [...this.s.m] as Matrix, dash: [...this.s.dash] });
  }
  restore() {
    const p = this.stack.pop();
    if (p) this.s = p;
  }
  setTransform(a: number, b = 0, c = 0, d = 1, e = 0, f = 0) {
    // The overlay pre-multiplies by devicePixelRatio; vector output ignores that scale.
    this.s.m = [1, b, c, 1, e / (a || 1), f / (d || 1)];
  }
  translate(x: number, y: number) {
    this.s.m = mul(this.s.m, [1, 0, 0, 1, x, y]);
  }
  rotate(a: number) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.s.m = mul(this.s.m, [c, s, -s, c, 0, 0]);
  }
  scale(x: number, y: number) {
    this.s.m = mul(this.s.m, [x, 0, 0, y, 0, 0]);
  }
  setLineDash(d: number[]) {
    this.s.dash = [...d];
  }
  getLineDash() {
    return this.s.dash;
  }

  measureText(text: string): TextMetrics {
    if (this.measurer) {
      this.measurer.font = this.s.font;
      return this.measurer.measureText(text);
    }
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.s.font)?.[1] ?? 12);
    return { width: text.length * size * 0.56 } as TextMetrics;
  }

  beginPath() {
    this.path = '';
  }
  moveTo(x: number, y: number) {
    const [px, py] = this.tp(x, y);
    this.path += `M${px},${py}`;
  }
  lineTo(x: number, y: number) {
    const [px, py] = this.tp(x, y);
    this.path += `L${px},${py}`;
  }
  closePath() {
    this.path += 'Z';
  }
  rect(x: number, y: number, w: number, h: number) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x: number, y: number, w: number, h: number, r: number | number[] = 0) {
    const rr = Math.min(Array.isArray(r) ? (r[0] ?? 0) : r, w / 2, h / 2);
    const [x0, y0] = this.tp(x, y);
    this.path += `M${x0 + rr},${y0}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - 2 * rr}a${rr},${rr} 0 0 1 ${-rr},${rr}h${-(w - 2 * rr)}a${rr},${rr} 0 0 1 ${-rr},${-rr}v${-(h - 2 * rr)}a${rr},${rr} 0 0 1 ${rr},${-rr}Z`;
  }
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    const [cx, cy] = this.tp(x, y);
    const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6;
    if (full) {
      this.path += `M${cx + r},${cy}a${r},${r} 0 1 0 ${-2 * r},0a${r},${r} 0 1 0 ${2 * r},0`;
      return;
    }
    const sx = cx + Math.cos(a0) * r;
    const sy = cy + Math.sin(a0) * r;
    const ex = cx + Math.cos(a1) * r;
    const ey = cy + Math.sin(a1) * r;
    this.path += `${this.path ? 'L' : 'M'}${sx},${sy}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${ex},${ey}`;
  }
  fill() {
    if (this.path) this.parts.push(`<path d="${this.path}" fill="${xml(this.s.fillStyle)}"${this.alpha()}/>`);
  }
  stroke() {
    if (this.path)
      this.parts.push(
        `<path d="${this.path}" fill="none" stroke="${xml(this.s.strokeStyle)}" stroke-width="${this.s.lineWidth}"${this.s.dash.length ? ` stroke-dasharray="${this.s.dash.join(' ')}"` : ''}${this.alpha()}/>`,
      );
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
  }
  clearRect() {}
  drawImage() {}
  clip() {}
  /** Emits an `<image>` by URL (axis thumbnails); `r` rounds the corners. */
  drawImageUrl(url: string, x: number, y: number, w: number, h: number, r = 0) {
    const [px, py] = this.tp(x, y);
    const id = `rgl-img-${Math.random().toString(36).slice(2, 8)}`;
    const clip = r > 0 ? `<clipPath id="${id}"><rect x="${px}" y="${py}" width="${w}" height="${h}" rx="${r}"/></clipPath>` : '';
    this.parts.push(`${clip}<image href="${xml(url)}" x="${px}" y="${py}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"${r > 0 ? ` clip-path="url(#${id})"` : ''}${this.alpha()}/>`);
  }

  fillText(text: string, x: number, y: number) {
    const [px, py] = this.tp(x, y);
    const m = this.s.m;
    const rot = Math.atan2(m[1], m[0]);
    const anchor = this.s.textAlign === 'center' ? 'middle' : this.s.textAlign === 'right' || this.s.textAlign === 'end' ? 'end' : 'start';
    const base = this.s.textBaseline === 'middle' ? 'central' : this.s.textBaseline === 'top' || this.s.textBaseline === 'hanging' ? 'hanging' : this.s.textBaseline === 'bottom' ? 'text-after-edge' : 'alphabetic';
    const fm = /^(?:(\d{3}|bold|normal)\s+)?(\d+(?:\.\d+)?)px\s+(.*)$/.exec(this.s.font.trim());
    const weight = fm?.[1] ?? '400';
    const size = fm?.[2] ?? '12';
    const family = (fm?.[3] ?? 'sans-serif').replace(/"/g, "'");
    const transform = Math.abs(rot) > 1e-3 ? ` transform="rotate(${(rot * 180) / Math.PI} ${px} ${py})"` : '';
    this.parts.push(
      `<text x="${px}" y="${py}" font-family="${xml(family)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${xml(this.s.fillStyle)}"${this.alpha()}${transform}>${xml(text)}</text>`,
    );
  }

  private alpha(): string {
    return this.s.globalAlpha < 1 ? ` opacity="${Math.round(this.s.globalAlpha * 1000) / 1000}"` : '';
  }

  private tp(x: number, y: number): [number, number] {
    const m = this.s.m;
    return [Math.round((m[0] * x + m[2] * y + m[4]) * 100) / 100, Math.round((m[1] * x + m[3] * y + m[5]) * 100) / 100];
  }

  toString(): string {
    return this.parts.join('');
  }
}
