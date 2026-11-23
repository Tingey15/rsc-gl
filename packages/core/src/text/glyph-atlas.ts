/**
 * Signed-distance-field glyph atlas. Glyphs are rasterized with Canvas2D at a
 * fixed size, converted to an SDF with a Euclidean distance transform
 * (Felzenszwalb & Huttenlocher), and shelf-packed into a single-channel
 * texture. SDF text stays crisp at any scale and can be depth tested in 3D.
 */
const INF = 1e20;

function edt1d(grid: Float64Array, offset: number, stride: number, length: number, f: Float64Array, v: Uint16Array, z: Float64Array): void {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 0; q < length; q++) f[q] = grid[offset + q * stride];
  let k = 0;
  for (let q = 1; q < length; q++) {
    let s: number;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    grid[offset + q * stride] = f[r] + (q - r) * (q - r);
  }
}

function edt(grid: Float64Array, w: number, h: number): void {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const v = new Uint16Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

export interface Glyph {
  /** Atlas rect (px). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Advance width at atlas font size. */
  advance: number;
}

export class GlyphAtlas {
  readonly fontSize = 40;
  readonly buffer = 6;
  readonly radius = 10;
  readonly cutoff = 0.25;
  width = 1024;
  height = 256;
  data: Uint8Array;
  version = 0;
  private glyphs = new Map<string, Glyph>();
  private ctx: CanvasRenderingContext2D;
  private shelfX = 0;
  private shelfY = 0;
  private shelfH = 0;

  constructor(private readonly fontFamily = 'Inter, system-ui, sans-serif', private readonly fontWeight = '500') {
    this.data = new Uint8Array(this.width * this.height);
    const size = this.fontSize + this.buffer * 2;
    const c = document.createElement('canvas');
    c.width = size * 2;
    c.height = size;
    this.ctx = c.getContext('2d', { willReadFrequently: true })!;
    this.ctx.font = `${fontWeight} ${this.fontSize}px ${fontFamily}`;
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillStyle = '#000';
  }

  get(ch: string): Glyph | undefined {
    return this.glyphs.get(ch);
  }

  /** Ensures every character of `text` is in the atlas. Returns true if the atlas changed. */
  ensure(text: string): boolean {
    let changed = false;
    for (const ch of text) if (!this.glyphs.has(ch)) changed = this.add(ch) || changed;
    if (changed) this.version++;
    return changed;
  }

  private add(ch: string): boolean {
    const { ctx, buffer: b, fontSize } = this;
    const advance = ctx.measureText(ch).width;
    const w = Math.max(1, Math.ceil(advance)) + b * 2;
    const h = fontSize + b * 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillText(ch, b, b + fontSize * 0.8);
    const img = ctx.getImageData(0, 0, w, h).data;
    const outer = new Float64Array(w * h);
    const inner = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const a = img[i * 4 + 3] / 255;
      if (a === 0) {
        outer[i] = INF;
        inner[i] = 0;
      } else if (a === 1) {
        outer[i] = 0;
        inner[i] = INF;
      } else {
        const d = 0.5 - a;
        outer[i] = d > 0 ? d * d : 0;
        inner[i] = d < 0 ? d * d : 0;
      }
    }
    edt(outer, w, h);
    edt(inner, w, h);
    // Shelf packing.
    if (this.shelfX + w > this.width) {
      this.shelfX = 0;
      this.shelfY += this.shelfH + 1;
      this.shelfH = 0;
    }
    if (this.shelfY + h > this.height) this.grow();
    const x0 = this.shelfX;
    const y0 = this.shelfY;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
        this.data[(y0 + y) * this.width + x0 + x] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / this.radius + this.cutoff))));
      }
    this.glyphs.set(ch, { x: x0, y: y0, w, h, advance });
    this.shelfX += w + 1;
    this.shelfH = Math.max(this.shelfH, h);
    return true;
  }

  private grow(): void {
    const next = new Uint8Array(this.width * this.height * 2);
    next.set(this.data);
    this.data = next;
    this.height *= 2;
  }

  /**
   * Lays out a string: returns glyph quads in px at `size` relative to the
   * anchor, aligned horizontally and centered vertically.
   */
  layout(text: string, size: number, align: 'left' | 'center' | 'right' = 'center'): { glyph: Glyph; x: number; y: number; w: number; h: number }[] {
    this.ensure(text);
    const k = size / this.fontSize;
    const total = [...text].reduce((a, ch) => a + (this.glyphs.get(ch)?.advance ?? 0), 0) * k;
    let pen = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
    const out: { glyph: Glyph; x: number; y: number; w: number; h: number }[] = [];
    for (const ch of text) {
      const g = this.glyphs.get(ch)!;
      out.push({ glyph: g, x: pen - this.buffer * k, y: -(this.fontSize * 0.5 + this.buffer) * k, w: g.w * k, h: g.h * k });
      pen += g.advance * k;
    }
    return out;
  }
}
