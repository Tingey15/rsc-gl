import type { GpuDevice, GpuRenderTarget, GpuSurface } from '@rsc-gl/gpu';
import {
  RenderEngine,
  GlyphAtlas,
  createScale,
  getFormatter,
  getInterpolator,
  getTheme,
  packColor,
  prefersReducedMotion,
  parseCss,
  resolveColor,
  resolvePalette,
  rgbaToCss,
  type ChartScale,
  type ChartTheme,
  type MarkItem,
  type Renderable,
  type RenderEngineOptions,
  type TransitionOptions,
} from '@rsc-gl/core';
import { lookAt, multiply, perspective, project, type Mat4, type Vec3 } from './math';
import { BoxMark, Lines3D, SpriteMark, SurfaceMark, TextMark3D, type BoxAttrs, type Frame3D, type Label3D, type SpriteAttrs } from './marks3d';
import { MeshMark3D } from './mesh3d';
import { boxesToMeshes, contourSegments, type BarShape } from './shapes3d';
import type { ExtraChart3DOptions, Parts3D } from './layouts3d';

// The newer chart types (globe, map, treemap, ...) live in a separate chunk loaded on first use.
type ExtraModule = typeof import('./layouts3d');
let extraModule: ExtraModule | null = null;
let extraLoading: Promise<ExtraModule> | null = null;

let sharedAtlas: GlyphAtlas | null = null;
const atlas = () => (sharedAtlas ??= new GlyphAtlas());

/* ---------------------------------------------------------------- options */

export interface Axis3DOptions {
  label?: string;
  min?: number;
  max?: number;
  format?: (v: number | string) => string;
}

export interface CameraOptions {
  /** Degrees around the vertical axis. */
  azimuth?: number;
  /** Degrees above the floor. */
  elevation?: number;
  distance?: number;
  autoRotate?: boolean;
  /** Degrees per second. */
  autoRotateSpeed?: number;
}

interface BaseOptions3D {
  colorScheme?: 'light' | 'dark';
  colors?: string | string[];
  xAxis?: Axis3DOptions;
  yAxis?: Axis3DOptions;
  zAxis?: Axis3DOptions;
  camera?: CameraOptions;
  animation?: boolean | Partial<TransitionOptions>;
  locale?: string;
  /**
   * 'sdf' draws axis labels as depth-tested SDF text in the scene (occluded by
   * data); 'overlay' draws them on a 2D canvas on top.
   */
  textMode?: 'sdf' | 'overlay';
  /** 'gpu' picks the front-most item with an id render pass; 'cpu' uses screen-space distance. */
  picking?: 'gpu' | 'cpu';
  /** Called with item details on click. */
  onItemClick?: (item: Item3D) => void;
  valueFormatter?: (v: number) => string;
}

export interface Bar3DOptions extends BaseOptions3D {
  type: 'bar';
  /** Categories along x. */
  x: string[];
  /** Categories along z (one row of bars per entry). */
  z: string[];
  /** values[zIndex][xIndex] */
  values: number[][];
  /** Color by row (z), column (x) or a sequential scale on the value. */
  colorBy?: 'z' | 'x' | 'value';
  sequentialScheme?: string;
  /** Footprint fraction of each cell (0..1). */
  barSize?: number;
  /** Bar geometry. Default 'box'. */
  shape?: BarShape;
}

export interface Scatter3DPoint {
  x: number;
  y: number;
  z: number;
  size?: number;
  label?: string;
}

export interface Scatter3DOptions extends BaseOptions3D {
  type: 'scatter';
  series: { id?: string; label: string; color?: string; data: Scatter3DPoint[]; size?: number }[];
}

export interface Surface3DOptions extends BaseOptions3D {
  type: 'surface';
  xs: number[];
  zs: number[];
  /** values[zIndex][xIndex] or a function of (x, z). */
  values: number[][] | ((x: number, z: number) => number);
  sequentialScheme?: string;
  wireframe?: boolean;
  /** Iso-lines: a count of evenly spaced levels or explicit values. */
  contours?: number | number[];
  /** Also project the iso-lines onto the floor. */
  floorContours?: boolean;
}

/** The newer chart types share the base options (camera, colors, formatters). */
export type Extra3DOptions = ExtraChart3DOptions & BaseOptions3D;

export type Chart3DOptions = Bar3DOptions | Scatter3DOptions | Surface3DOptions | Extra3DOptions;

export interface Item3D {
  seriesIndex: number;
  dataIndex: number;
  label: string;
  rows: { label: string; value: string; color?: string }[];
  color: string;
  anchor: { x: number; y: number };
  /** Data index used for highlighting (-1 highlights the whole series). */
  hlIndex?: number;
}

/* ---------------------------------------------------------------- world layout */

const SIZE_X = 2;
const SIZE_Z = 2;
const SIZE_Y = 1.25;

const toPacked = (css: string, scheme: 'light' | 'dark', alpha = 1) => {
  const c = resolveColor(css, scheme);
  return packColor([c[0], c[1], c[2], c[3] * alpha]);
};

/**
 * A 3D chart bound to a DOM container. Shares the page-wide GPU device with
 * 2D charts through the render engine.
 */
export class Chart3D implements Renderable {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly tooltip: HTMLElement;
  private readonly engine: RenderEngine;
  private device: GpuDevice | null = null;
  private surface: GpuSurface | null = null;
  private options: Chart3DOptions;
  private theme: ChartTheme;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private first = true;
  private destroyed = false;
  private readonly ro: ResizeObserver;

  // Camera state (radians), with velocity for damping.
  private az = 0;
  private el = 0;
  private dist = 3.7;
  private vAz = 0;
  private vEl = 0;
  private dragging: { x: number; y: number; t: number } | null = null;
  private lastTick = 0;
  private viewProj: Mat4 = new Float32Array(16);

  private boxes: BoxMark | null = null;
  private sprites: SpriteMark | null = null;
  private surfaceMark: SurfaceMark | null = null;
  private grid: Lines3D | null = null;
  private wire: Lines3D | null = null;
  private mesh: MeshMark3D | null = null;
  private frameMode: Parts3D['frame'] = 'box';
  private extraLabels: Label3D[] = [];
  private pickMode: 'gpu' | 'cpu' | undefined;

  private xScale: ChartScale | null = null;
  private zScale: ChartScale | null = null;
  private yScale: ChartScale | null = null;
  private items: { key: string; pos: Vec3; info: Omit<Item3D, 'anchor'> }[] = [];
  private hl: [number, number] | null = null;
  private fade = 0;
  private fadeTarget = 0;
  private lastGridSide = '';
  private text: TextMark3D | null = null;
  private pickTarget: GpuRenderTarget | null = null;
  private pendingPick: { x: number; y: number } | null = null;
  private pickBusy = false;
  private lastPick: Item3D | null = null;

  constructor(container: HTMLElement, options: Chart3DOptions, engine: RenderEngineOptions | RenderEngine) {
    this.options = options;
    this.theme = getTheme(options.colorScheme ?? 'light');
    this.engine = engine instanceof RenderEngine ? engine : RenderEngine.get(engine);
    this.root = document.createElement('div');
    Object.assign(this.root.style, { position: 'relative', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab', outline: 'none' });
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'img');
    this.canvas = document.createElement('canvas');
    this.overlay = document.createElement('canvas');
    for (const c of [this.canvas, this.overlay]) Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    this.overlay.style.pointerEvents = 'none';
    this.tooltip = document.createElement('div');
    Object.assign(this.tooltip.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      padding: '8px 10px',
      borderRadius: '8px',
      font: '12px/1.4 Inter, system-ui, sans-serif',
      boxShadow: '0 6px 24px rgba(0,0,0,.18)',
      opacity: '0',
      transition: 'opacity .12s',
      zIndex: '5',
      whiteSpace: 'nowrap',
    });
    this.root.append(this.canvas, this.overlay, this.tooltip);
    container.appendChild(this.root);
    this.applyCamera(true);
    this.bind();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.root);
    this.engine.add(this);
    this.engine.getDevice().then((d) => {
      if (this.destroyed) return;
      this.device = d;
      this.surface = d.createSurface(this.canvas);
      this.boxes = new BoxMark(d);
      this.sprites = new SpriteMark(d);
      this.surfaceMark = new SurfaceMark(d);
      this.grid = new Lines3D(d);
      this.wire = new Lines3D(d);
      this.mesh = new MeshMark3D(d);
      this.text = new TextMark3D(d, atlas());
      this.resize();
      this.layout();
    });
  }

  get backend(): string | null {
    return this.device?.type ?? null;
  }

  setOptions(options: Chart3DOptions): void {
    const prevCam = this.options.camera;
    this.options = options;
    this.theme = getTheme(options.colorScheme ?? 'light');
    if (JSON.stringify(prevCam) !== JSON.stringify(options.camera)) this.applyCamera(false);
    this.layout();
  }

  destroy(): void {
    this.destroyed = true;
    this.engine.remove(this);
    this.ro.disconnect();
    this.boxes?.destroy();
    this.sprites?.destroy();
    this.surfaceMark?.destroy();
    this.grid?.destroy();
    this.wire?.destroy();
    this.mesh?.destroy();
    this.text?.destroy();
    this.pickTarget?.destroy();
    this.surface?.destroy();
    this.root.remove();
  }

  onDeviceChanged(device: GpuDevice): void {
    this.device = device;
    this.surface = device.createSurface(this.canvas);
    this.boxes?.setDevice(device);
    this.sprites?.setDevice(device);
    this.surfaceMark?.setDevice(device);
    this.grid?.setDevice(device);
    this.wire?.setDevice(device);
    this.mesh?.setDevice(device);
    this.text?.setDevice(device);
    this.pickTarget = null;
    this.layout();
  }

  private applyCamera(initial: boolean): void {
    const c = this.options.camera ?? {};
    if (initial || c.azimuth !== undefined) this.az = ((c.azimuth ?? 35) * Math.PI) / 180;
    if (initial || c.elevation !== undefined) this.el = ((c.elevation ?? 24) * Math.PI) / 180;
    if (initial || c.distance !== undefined) this.dist = c.distance ?? 3.7;
    this.engine.invalidate(this);
  }

  private resize(): void {
    const r = this.root.getBoundingClientRect();
    this.width = r.width;
    this.height = r.height;
    this.dpr = window.devicePixelRatio || 1;
    this.engine.invalidate(this);
  }

  private transition(): TransitionOptions {
    const a = this.options.animation;
    if (a === false || prefersReducedMotion()) return { duration: 0, easing: 'linear', stagger: 0 };
    return { duration: 900, easing: 'cubicInOut', stagger: 0.35, ...(typeof a === 'object' ? a : {}) };
  }

  /* ------------------------------------------------------------ data → marks */

  private layout(): void {
    if (!this.device) return;
    const o = this.options;
    const now = performance.now();
    const tr = this.transition();
    const scheme = this.theme.scheme;
    const palette = resolvePalette(o.colors, scheme);
    this.items = [];
    const fmt = getFormatter(o.locale);
    const fv = (v: number) => (o.valueFormatter ? o.valueFormatter(v) : fmt.number(v));
    this.frameMode = 'box';
    this.extraLabels = [];
    this.pickMode = undefined;

    if (o.type === 'bar') {
      const rows = o.values;
      let max = 0;
      let min = 0;
      for (const r of rows) for (const v of r) {
        max = Math.max(max, v);
        min = Math.min(min, v);
      }
      this.xScale = createScale({ type: 'band', domain: o.x, range: [-SIZE_X / 2, SIZE_X / 2], paddingInner: 0, paddingOuter: 0 });
      this.zScale = createScale({ type: 'band', domain: o.z, range: [-SIZE_Z / 2, SIZE_Z / 2], paddingInner: 0, paddingOuter: 0 });
      this.yScale = createScale({ type: 'linear', domain: [min, max], range: [0, SIZE_Y], min: o.yAxis?.min, max: o.yAxis?.max });
      const bw = this.xScale.bandwidth();
      const bd = this.zScale.bandwidth();
      const frac = o.barSize ?? 0.62;
      const seq = getInterpolator(o.sequentialScheme ?? 'viridis')!;
      const items: MarkItem<BoxAttrs>[] = [];
      o.z.forEach((zc, zi) => {
        o.x.forEach((xc, xi) => {
          const v = rows[zi]?.[xi] ?? 0;
          const css =
            o.colorBy === 'x' ? palette[xi % palette.length] : o.colorBy === 'value' ? seq(max === min ? 0.5 : 0.15 + 0.85 * ((v - min) / (max - min))) : palette[zi % palette.length];
          const c = resolveColor(css, scheme);
          const x = this.xScale!.map(xc) + bw / 2;
          const z = this.zScale!.map(zc) + bd / 2;
          const y0 = this.yScale!.map(Math.min(0, v));
          const h = Math.abs(this.yScale!.map(v) - this.yScale!.map(0));
          const value: BoxAttrs = { x, z, y0, height: h, width: bw * frac, depth: bd * frac, color: c };
          items.push({ key: `${zc}|${xc}`, seriesIndex: zi, dataIndex: xi, value, enter: { ...value, height: 0 } });
          this.items.push({
            key: `${zc}|${xc}`,
            pos: [x, y0 + h, z],
            info: { seriesIndex: zi, dataIndex: xi, label: `${xc} · ${zc}`, color: rgbaToCss(c), rows: [{ label: o.yAxis?.label ?? 'Value', value: fv(v) }] },
          });
        });
      });
      const barTr = this.first ? tr : { ...tr, stagger: 0.15 };
      if ((o.shape ?? 'box') === 'box') {
        this.boxes!.update(items, barTr, now);
        this.mesh!.update([], barTr, now);
      } else {
        // Shaped bars stagger by their position in the grid.
        items.forEach((it, i) => (it.delay = i / Math.max(1, items.length - 1)));
        this.mesh!.update(boxesToMeshes(items, o.shape!), barTr, now);
        this.boxes!.update([], barTr, now);
      }
      this.sprites!.update([], tr, now);
      this.surfaceMark!.update(new Float32Array(0), new Float32Array(0), new Float32Array(0), new Uint32Array(0), 0, now, false);
    } else if (o.type === 'scatter') {
      const all = o.series.flatMap((s) => s.data);
      const ext = (k: 'x' | 'y' | 'z') => [Math.min(...all.map((p) => p[k])), Math.max(...all.map((p) => p[k]))];
      this.xScale = createScale({ type: 'linear', domain: ext('x'), range: [-SIZE_X / 2, SIZE_X / 2], min: o.xAxis?.min, max: o.xAxis?.max });
      this.yScale = createScale({ type: 'linear', domain: ext('y'), range: [0, SIZE_Y], min: o.yAxis?.min, max: o.yAxis?.max });
      this.zScale = createScale({ type: 'linear', domain: ext('z'), range: [-SIZE_Z / 2, SIZE_Z / 2], min: o.zAxis?.min, max: o.zAxis?.max });
      const items: MarkItem<SpriteAttrs>[] = [];
      o.series.forEach((s, si) => {
        const c = resolveColor(s.color ?? palette[si % palette.length], scheme);
        s.data.forEach((p, i) => {
          const pos: Vec3 = [this.xScale!.map(p.x), this.yScale!.map(p.y), this.zScale!.map(p.z)];
          const value: SpriteAttrs = { x: pos[0], y: pos[1], z: pos[2], size: p.size ?? s.size ?? 10, color: c };
          items.push({ key: `${s.id ?? si}|${i}`, seriesIndex: si, dataIndex: i, value, enter: { ...value, size: 0, y: 0 } });
          this.items.push({
            key: `${si}|${i}`,
            pos,
            info: {
              seriesIndex: si,
              dataIndex: i,
              label: p.label ?? s.label,
              color: rgbaToCss(c),
              rows: [
                { label: o.xAxis?.label ?? 'x', value: fv(p.x) },
                { label: o.yAxis?.label ?? 'y', value: fv(p.y) },
                { label: o.zAxis?.label ?? 'z', value: fv(p.z) },
              ],
            },
          });
        });
      });
      this.sprites!.update(items, tr, now);
      this.boxes!.update([], tr, now);
      this.mesh!.update([], tr, now);
      this.surfaceMark!.update(new Float32Array(0), new Float32Array(0), new Float32Array(0), new Uint32Array(0), 0, now, false);
    } else if (o.type === 'surface') {
      const { xs, zs } = o;
      const val = (xi: number, zi: number) => (typeof o.values === 'function' ? o.values(xs[xi], zs[zi]) : (o.values[zi]?.[xi] ?? 0));
      const grid = new Float64Array(xs.length * zs.length);
      let min = Infinity;
      let max = -Infinity;
      for (let j = 0; j < zs.length; j++)
        for (let i = 0; i < xs.length; i++) {
          const v = val(i, j);
          grid[j * xs.length + i] = v;
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      this.xScale = createScale({ type: 'linear', domain: [Math.min(...xs), Math.max(...xs)], range: [-SIZE_X / 2, SIZE_X / 2], domainLimit: 'strict' });
      this.zScale = createScale({ type: 'linear', domain: [Math.min(...zs), Math.max(...zs)], range: [-SIZE_Z / 2, SIZE_Z / 2], domainLimit: 'strict' });
      this.yScale = createScale({ type: 'linear', domain: [min, max], range: [0, SIZE_Y], min: o.yAxis?.min, max: o.yAxis?.max });
      const seq = getInterpolator(o.sequentialScheme ?? 'viridis')!;
      const wx = new Float32Array(xs.map((x) => this.xScale!.map(x)));
      const wz = new Float32Array(zs.map((z) => this.zScale!.map(z)));
      const heights = new Float32Array(grid.length);
      const colors = new Uint32Array(grid.length);
      for (let k = 0; k < grid.length; k++) {
        heights[k] = this.yScale.map(grid[k]);
        const c = parseCss(seq(max === min ? 0.5 : (grid[k] - min) / (max - min)));
        colors[k] = packColor(c);
      }
      this.surfaceMark!.update(wx, wz, heights, colors, tr.duration, now, this.first && tr.duration > 0);
      // Hover targets: every other vertex is plenty for picking.
      const step = Math.max(1, Math.floor(Math.max(xs.length, zs.length) / 40));
      for (let j = 0; j < zs.length; j += step)
        for (let i = 0; i < xs.length; i += step) {
          const k = j * xs.length + i;
          this.items.push({
            key: `${i}|${j}`,
            pos: [wx[i], heights[k], wz[j]],
            info: {
              seriesIndex: 0,
              dataIndex: k,
              label: 'Surface',
              color: rgbaToCss(parseCss(seq(max === min ? 0.5 : (grid[k] - min) / (max - min)))),
              rows: [
                { label: o.xAxis?.label ?? 'x', value: fv(xs[i]) },
                { label: o.zAxis?.label ?? 'z', value: fv(zs[j]) },
                { label: o.yAxis?.label ?? 'value', value: fv(grid[k]) },
              ],
            },
          });
        }
      const segs: number[] = [];
      const cols: number[] = [];
      if (o.contours) {
        const levels = Array.isArray(o.contours) ? o.contours : Array.from({ length: o.contours }, (_, i) => min + ((max - min) * (i + 1)) / (o.contours as number + 1));
        const cc = toPacked(scheme === 'dark' ? '#ffffff' : '#111111', scheme, 0.55);
        const iso = contourSegments(wx, wz, heights, grid, levels);
        for (let i = 0; i < iso.length; i += 6) cols.push(cc);
        segs.push(...iso);
        if (o.floorContours) {
          const fl = contourSegments(wx, wz, heights, grid, levels, 0, true);
          const fc = toPacked(seq(0.55), scheme, 0.9);
          for (let i = 0; i < fl.length; i += 6) cols.push(fc);
          segs.push(...fl);
        }
      }
      if (o.wireframe) {
        const wc = toPacked(scheme === 'dark' ? '#ffffff' : '#000000', scheme, 0.18);
        const lift = 0.002;
        for (let j = 0; j < zs.length; j += step)
          for (let i = 0; i < xs.length - 1; i++) {
            segs.push(wx[i], heights[j * xs.length + i] + lift, wz[j], wx[i + 1], heights[j * xs.length + i + 1] + lift, wz[j]);
            cols.push(wc);
          }
        for (let i = 0; i < xs.length; i += step)
          for (let j = 0; j < zs.length - 1; j++) {
            segs.push(wx[i], heights[j * xs.length + i] + lift, wz[j], wx[i], heights[(j + 1) * xs.length + i] + lift, wz[j + 1]);
            cols.push(wc);
          }
      }
      this.wire!.set(segs, cols);
      this.boxes!.update([], tr, now);
      this.sprites!.update([], tr, now);
      this.mesh!.update([], tr, now);
    } else {
      if (!extraModule) {
        extraLoading ??= import('./layouts3d').then((m) => (extraModule = m));
        extraLoading.then(() => !this.destroyed && this.layout());
        return;
      }
      const parts = extraModule.layoutExtra(o, { scheme, palette, fv, center: [0, SIZE_Y * 0.38, 0] });
      this.xScale = parts.scales?.x ?? null;
      this.yScale = parts.scales?.y ?? null;
      this.zScale = parts.scales?.z ?? null;
      this.boxes!.update(parts.boxes ?? [], tr, now);
      this.sprites!.update(parts.sprites ?? [], tr, now);
      this.mesh!.update(parts.meshes ?? [], tr, now);
      this.surfaceMark!.update(new Float32Array(0), new Float32Array(0), new Float32Array(0), new Uint32Array(0), 0, now, false);
      this.wire!.set(parts.lines?.segs ?? [], parts.lines?.colors ?? []);
      this.items = parts.items;
      this.extraLabels = parts.labels ?? [];
      this.frameMode = parts.frame;
      this.pickMode = parts.picking;
    }
    this.lastGridSide = '';
    this.first = false;
    this.root.setAttribute('aria-label', `3D ${o.type} chart`);
    this.engine.invalidate(this);
  }

  /** Grid walls on the far sides of the box, rebuilt when the camera crosses a quadrant. */
  private buildGrid(): void {
    const sx = Math.sin(this.az) >= 0 ? 1 : -1;
    const sz = Math.cos(this.az) >= 0 ? 1 : -1;
    const key = `${sx}${sz}${this.theme.scheme}`;
    if (key === this.lastGridSide || !this.grid) return;
    this.lastGridSide = key;
    if (this.frameMode === 'none') {
      this.grid.set([], []);
      if (this.text && (this.options.textMode ?? 'sdf') === 'sdf') {
        const dark = this.theme.scheme === 'dark';
        this.text.color = dark ? [0.86, 0.87, 0.9, 1] : [0.2, 0.21, 0.25, 1];
        this.text.set(this.extraLabels);
      }
      return;
    }
    const scheme = this.theme.scheme;
    const gc = toPacked(scheme === 'dark' ? '#ffffff' : '#000000', scheme, 0.1);
    const ec = toPacked(scheme === 'dark' ? '#ffffff' : '#000000', scheme, 0.28);
    const segs: number[] = [];
    const cols: number[] = [];
    const X = SIZE_X / 2;
    const Z = SIZE_Z / 2;
    const backX = -sx * X;
    const backZ = -sz * Z;
    const add = (a: number[], c: number) => {
      segs.push(...a);
      cols.push(c);
    };
    const xt = this.ticks(this.xScale, 6);
    const zt = this.ticks(this.zScale, 6);
    const yt = this.ticks(this.yScale, 5);
    // Floor grid.
    for (const t of xt) add([t.pos, 0, -Z, t.pos, 0, Z], gc);
    for (const t of zt) add([-X, 0, t.pos, X, 0, t.pos], gc);
    // Back walls.
    for (const t of yt) {
      add([-X, t.pos, backZ, X, t.pos, backZ], gc);
      add([backX, t.pos, -Z, backX, t.pos, Z], gc);
    }
    for (const t of xt) add([t.pos, 0, backZ, t.pos, SIZE_Y, backZ], gc);
    for (const t of zt) add([backX, 0, t.pos, backX, SIZE_Y, t.pos], gc);
    // Frame edges.
    add([-X, 0, -Z, X, 0, -Z], ec);
    add([-X, 0, Z, X, 0, Z], ec);
    add([-X, 0, -Z, -X, 0, Z], ec);
    add([X, 0, -Z, X, 0, Z], ec);
    add([backX, 0, backZ, backX, SIZE_Y, backZ], ec);
    this.grid.set(segs, cols);
    if (this.text && (this.options.textMode ?? 'sdf') === 'sdf') this.text.set([...this.sdfLabels(sx, sz), ...this.extraLabels]);
  }

  private sdfLabels(sx: number, sz: number): Label3D[] {
    const o = this.options;
    const X = SIZE_X / 2;
    const Z = SIZE_Z / 2;
    const labels: Label3D[] = [];
    for (const t of this.ticks(this.xScale, 6)) labels.push({ text: t.label, pos: [t.pos, 0, sz * Z * 1.12] });
    for (const t of this.ticks(this.zScale, 6)) labels.push({ text: t.label, pos: [sx * X * 1.12, 0, t.pos] });
    for (const t of this.ticks(this.yScale, 5)) labels.push({ text: t.label, pos: [-sx * X, t.pos, sz * Z * 1.06], align: 'right', dx: -6 });
    if (o.xAxis?.label) labels.push({ text: o.xAxis.label, pos: [0, 0, sz * Z * 1.32], size: 13 });
    if (o.zAxis?.label) labels.push({ text: o.zAxis.label, pos: [sx * X * 1.36, 0, 0], size: 13 });
    if (o.yAxis?.label) labels.push({ text: o.yAxis.label, pos: [-sx * X, SIZE_Y * 1.1, sz * Z], size: 13 });
    const dark = this.theme.scheme === 'dark';
    this.text!.color = dark ? [0.72, 0.73, 0.78, 1] : [0.33, 0.34, 0.38, 1];
    return labels;
  }

  private ticks(scale: ChartScale | null, count: number): { pos: number; label: string }[] {
    if (!scale) return [];
    const o = this.options;
    const fmt = getFormatter(o.locale);
    const half = scale.bandwidth() / 2;
    const vals = scale.type === 'band' ? scale.domain() : scale.ticks(count);
    const axisFmt = scale === this.xScale ? o.xAxis?.format : scale === this.zScale ? o.zAxis?.format : o.yAxis?.format;
    return vals.map((v) => ({ pos: scale.map(v) + half, label: axisFmt ? axisFmt(v as number) : typeof v === 'number' ? (Math.abs(v) >= 10000 ? fmt.number(v, 'shortNumber') : fmt.number(v)) : String(v) }));
  }

  /* ------------------------------------------------------------ rendering */

  renderFrame(now: number): boolean {
    if (!this.surface || this.width <= 0) return false;
    const dt = this.lastTick ? Math.min(0.05, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    const cam = this.options.camera ?? {};
    let moving = false;
    if (!this.dragging) {
      if (Math.abs(this.vAz) > 1e-4 || Math.abs(this.vEl) > 1e-4) {
        this.az += this.vAz;
        this.el = Math.max(0.05, Math.min(1.45, this.el + this.vEl));
        this.vAz *= 0.9;
        this.vEl *= 0.9;
        moving = true;
      }
      if (cam.autoRotate) {
        this.az += (((cam.autoRotateSpeed ?? 12) * Math.PI) / 180) * dt;
        moving = true;
      }
    }
    const target: Vec3 = [0, SIZE_Y * 0.38, 0];
    const eye: Vec3 = [target[0] + this.dist * Math.cos(this.el) * Math.sin(this.az), target[1] + this.dist * Math.sin(this.el), target[2] + this.dist * Math.cos(this.el) * Math.cos(this.az)];
    const proj = perspective((38 * Math.PI) / 180, this.width / Math.max(1, this.height), 0.05, 50);
    this.viewProj = multiply(proj, lookAt(eye, target, [0, 1, 0]));
    this.buildGrid();

    // Highlight fade.
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 14 || 1);
    const fading = Math.abs(this.fadeTarget - this.fade) > 0.01;
    const bg = this.theme.scheme === 'dark' ? [0.11, 0.11, 0.13, 1] : [0.97, 0.97, 0.98, 1];
    const frame: Frame3D = {
      now,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      highlight: this.hl ? [this.hl[0], this.hl[1], 1 - this.fade * 0.7, 1] : [-1, -1, 1, 0],
      viewProj: this.viewProj,
      light: [0.45, 0.85, 0.35, 0.42],
      fadeColor: bg as [number, number, number, number],
    };
    const pw = Math.round(this.width * this.dpr);
    const ph = Math.round(this.height * this.dpr);
    this.surface.resize(pw, ph);
    const pass = this.surface.beginFrame({ clearColor: [0, 0, 0, 0] });
    pass.setViewport({ x: 0, y: 0, width: pw, height: ph });
    this.grid?.draw(pass, frame);
    this.surfaceMark?.draw(pass, frame);
    this.mesh?.draw(pass, frame);
    this.wire?.draw(pass, frame);
    this.boxes?.draw(pass, frame);
    this.sprites?.draw(pass, frame);
    if ((this.options.textMode ?? 'sdf') === 'sdf') this.text?.draw(pass, frame);
    pass.end();
    this.drawLabels();
    this.runPick(frame);

    return moving || fading || !!this.dragging || !!this.boxes?.isAnimating(now) || !!this.sprites?.isAnimating(now) || !!this.surfaceMark?.isAnimating(now) || !!this.mesh?.isAnimating(now);
  }

  /** GPU picking: render ids offscreen and read the pixel under the pointer. */
  private runPick(frame: Frame3D): void {
    const p = this.pendingPick;
    if (!p || this.pickBusy || !this.device) return;
    this.pendingPick = null;
    const pw = Math.round(this.width * this.dpr);
    const ph = Math.round(this.height * this.dpr);
    this.pickTarget ??= this.device.createRenderTarget(pw, ph);
    this.pickTarget.resize(pw, ph);
    const pass = this.pickTarget.beginPass({ clearColor: [0, 0, 0, 0] });
    pass.setViewport({ x: 0, y: 0, width: pw, height: ph });
    this.boxes?.drawPick(pass, frame);
    this.sprites?.drawPick(pass, frame);
    this.mesh?.drawPick(pass, frame);
    pass.end();
    this.pickBusy = true;
    this.pickTarget
      .readPixel(p.x * this.dpr, p.y * this.dpr)
      .then((px) => {
        this.pickBusy = false;
        const id = px[0] + px[1] * 256 + px[2] * 65536;
        let item: Item3D | null = null;
        if (id > 0) {
          const si = Math.floor((id - 1) / 65536);
          const di = (id - 1) % 65536;
          const it = this.items.find((x) => x.info.seriesIndex === si && x.info.dataIndex === di);
          const s = it && project(this.viewProj, it.pos, this.width, this.height);
          if (it && s) item = { ...it.info, anchor: { x: s.x, y: s.y } };
        }
        this.lastPick = item;
        this.applyHover(item);
        if (this.pendingPick) this.engine.invalidate(this);
      })
      .catch(() => {
        this.pickBusy = false;
      });
  }

  private applyHover(item: Item3D | null): void {
    const next: [number, number] | null = item ? [item.seriesIndex, this.options.type === 'surface' ? -1 : (item.hlIndex ?? item.dataIndex)] : null;
    if (next?.[0] !== this.hl?.[0] || next?.[1] !== this.hl?.[1]) {
      this.hl = next;
      this.fadeTarget = next && this.options.type !== 'surface' ? 1 : 0;
      if (next) this.fade = Math.max(this.fade, 0.001);
    }
    this.showTooltip(item);
    this.engine.invalidate(this);
  }

  private drawLabels(): void {
    const o = this.options;
    const g = this.overlay.getContext('2d')!;
    const pw = Math.round(this.width * this.dpr);
    const ph = Math.round(this.height * this.dpr);
    if (this.overlay.width !== pw || this.overlay.height !== ph) {
      this.overlay.width = pw;
      this.overlay.height = ph;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pw, ph);
    if ((o.textMode ?? 'sdf') === 'sdf') return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.font = `11px ${this.theme.fontFamily}`;
    g.fillStyle = this.theme.mutedTextColor;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const sx = Math.sin(this.az) >= 0 ? 1 : -1;
    const sz = Math.cos(this.az) >= 0 ? 1 : -1;
    const X = SIZE_X / 2;
    const Z = SIZE_Z / 2;
    const put = (p: Vec3, text: string, dx = 0, dy = 0) => {
      const s = project(this.viewProj, p, this.width, this.height);
      if (s) g.fillText(text, s.x + dx, s.y + dy);
    };
    // Front edges get the labels.
    for (const t of this.ticks(this.xScale, 6)) put([t.pos, 0, sz * Z * 1.12], t.label);
    for (const t of this.ticks(this.zScale, 6)) put([sx * X * 1.12, 0, t.pos], t.label);
    for (const t of this.ticks(this.yScale, 5)) put([-sx * X, t.pos, sz * Z * 1.06], t.label, sx > 0 ? -12 : 12);
    g.font = `600 12px ${this.theme.fontFamily}`;
    g.fillStyle = this.theme.textColor;
    if (o.xAxis?.label) put([0, 0, sz * Z * 1.32], o.xAxis.label);
    if (o.zAxis?.label) put([sx * X * 1.36, 0, 0], o.zAxis.label);
    if (o.yAxis?.label) put([-sx * X, SIZE_Y * 1.1, sz * Z], o.yAxis.label);
  }

  /* ------------------------------------------------------------ interaction */

  private hit(px: number, py: number): Item3D | null {
    let best: Item3D | null = null;
    let bestD = 28;
    let bestDepth = Infinity;
    for (const it of this.items) {
      const s = project(this.viewProj, it.pos, this.width, this.height);
      if (!s) continue;
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < bestD - 2 || (Math.abs(d - bestD) <= 2 && s.depth < bestDepth)) {
        bestD = d;
        bestDepth = s.depth;
        best = { ...it.info, anchor: { x: s.x, y: s.y } };
      }
    }
    return best;
  }

  private showTooltip(item: Item3D | null): void {
    const t = this.tooltip;
    if (!item) {
      t.style.opacity = '0';
      return;
    }
    const th = this.theme;
    Object.assign(t.style, { background: th.tooltipBackground, color: th.tooltipText, border: `1px solid ${th.tooltipBorder}`, opacity: '1' });
    t.innerHTML = `<div style="font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:3px;background:${item.color}"></span>${escapeHtml(item.label)}</div>${item.rows
      .map((r) => `<div style="display:flex;gap:14px;justify-content:space-between"><span style="opacity:.7">${escapeHtml(r.label)}</span><b>${escapeHtml(r.value)}</b></div>`)
      .join('')}`;
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    let x = item.anchor.x + 14;
    let y = item.anchor.y - h / 2;
    if (x + w > this.width) x = item.anchor.x - w - 14;
    y = Math.max(4, Math.min(this.height - h - 4, y));
    t.style.transform = `translate(${x}px, ${y}px)`;
  }

  private bind(): void {
    const el = this.root;
    el.addEventListener('pointerdown', (e) => {
      this.dragging = { x: e.clientX, y: e.clientY, t: performance.now() };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
      this.showTooltip(null);
      this.engine.invalidate(this);
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      if (this.dragging) {
        const dx = e.clientX - this.dragging.x;
        const dy = e.clientY - this.dragging.y;
        this.dragging.x = e.clientX;
        this.dragging.y = e.clientY;
        this.vAz = -dx * 0.008;
        this.vEl = dy * 0.006;
        this.az += this.vAz;
        this.el = Math.max(0.05, Math.min(1.45, this.el + this.vEl));
        this.engine.invalidate(this);
        return;
      }
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (this.options.type !== 'surface' && this.device && (this.pickMode ?? this.options.picking ?? 'gpu') === 'gpu') {
        this.pendingPick = { x: px, y: py };
        this.engine.invalidate(this);
        return;
      }
      this.applyHover(this.hit(px, py));
    });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = null;
      el.style.cursor = 'grab';
      this.engine.invalidate(this);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => {
      this.hl = null;
      this.fadeTarget = 0;
      this.showTooltip(null);
      this.engine.invalidate(this);
    });
    el.addEventListener('click', (e) => {
      if (!this.options.onItemClick) return;
      const r = el.getBoundingClientRect();
      const item = (this.pickMode ?? this.options.picking ?? 'gpu') === 'gpu' && this.options.type !== 'surface' ? this.lastPick : this.hit(e.clientX - r.left, e.clientY - r.top);
      if (item) this.options.onItemClick(item);
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.dist = Math.max(2.2, Math.min(12, this.dist * Math.exp(e.deltaY * 0.001)));
        this.engine.invalidate(this);
      },
      { passive: false },
    );
    el.addEventListener('keydown', (e) => {
      const step = 0.08;
      if (e.key === 'ArrowLeft') this.vAz = step;
      else if (e.key === 'ArrowRight') this.vAz = -step;
      else if (e.key === 'ArrowUp') this.vEl = step * 0.6;
      else if (e.key === 'ArrowDown') this.vEl = -step * 0.6;
      else if (e.key === '+' || e.key === '=') this.dist = Math.max(2.2, this.dist * 0.9);
      else if (e.key === '-') this.dist = Math.min(12, this.dist * 1.1);
      else return;
      e.preventDefault();
      this.engine.invalidate(this);
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
