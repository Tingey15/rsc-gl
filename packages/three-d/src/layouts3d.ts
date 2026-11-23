import { geoEqualEarth, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { createScale, getInterpolator, packColor, resolveColor, rgbaToCss, type ChartScale, type MarkItem } from '@rsc-gl/core';
import type { BoxAttrs, Label3D, SpriteAttrs } from './marks3d';
import type { MeshPart } from './mesh3d';
import { MeshBuilder, frustum, greatArc, latLon, prism, ribbon, sectorPrism, sphere, wall } from './geometry3d';
import type { Vec3 } from './math';

/* ---------------------------------------------------------------- option types */

export interface Common3D {
  colorScheme?: 'light' | 'dark';
  colors?: string | string[];
  valueFormatter?: (v: number) => string;
}

export interface StackedBar3DOptions {
  type: 'stackedBar';
  x: string[];
  z: string[];
  /** One entry per stack layer; values[zIndex][xIndex]. */
  stacks: { label: string; color?: string; values: number[][] }[];
  shape?: BarShape;
  barSize?: number;
}

import type { BarShape } from './shapes3d';
import { boxesToMeshes } from './shapes3d';
import { minOf, maxOf } from '@rsc-gl/core';
export type { BarShape };

export interface Pie3DOptions {
  type: 'pie';
  data: { label: string; value: number; color?: string }[];
  /** Hole size 0..1 (donut). */
  innerRadius?: number;
  /** Slice thickness in world units. Default 0.16. */
  thickness?: number;
  /** Slice heights proportional to value (a "3D rose"). */
  heightByValue?: boolean;
  /** Gap pushed between slices. Default 0.03. */
  explode?: number;
  showLabels?: boolean;
}

export interface Ribbon3DOptions {
  type: 'ribbon';
  /** Shared x positions (numbers) or categories. */
  x: (number | string)[];
  series: { label: string; color?: string; data: number[] }[];
  /** Flat bands, walls down to the floor (ridgeline), or both. */
  variant?: 'ribbon' | 'wall';
  /** Band width as a fraction of the row spacing. Default 0.55. */
  width?: number;
}

export interface Globe3DOptions {
  type: 'globe';
  points?: { lat: number; lon: number; value?: number; label?: string; color?: string }[];
  arcs?: { from: [number, number]; to: [number, number]; value?: number; color?: string; label?: string }[];
  /** GeoJSON features whose outlines are drawn on the globe (land, borders). */
  outlines?: { features: { geometry: GeoGeometry | null }[] };
  /** Draw values as spikes rising from the surface instead of dots. */
  spikes?: boolean;
  oceanColor?: string;
  landColor?: string;
}

export interface Network3DOptions {
  type: 'network';
  nodes: { id: string; label?: string; group?: string; size?: number }[];
  links: { source: string; target: string; value?: number }[];
  /** Force-layout iterations. Default 300. */
  iterations?: number;
}

export interface VectorField3DOptions {
  type: 'vectorField';
  vectors: { x: number; y: number; z: number; u: number; v: number; w: number }[];
  sequentialScheme?: string;
  /** Arrow length multiplier. Default 1. */
  arrowScale?: number;
}

export interface Histogram3DOptions {
  type: 'histogram';
  points: { x: number; z: number }[];
  /** Bins per axis. Default 16. */
  bins?: number | [number, number];
  sequentialScheme?: string;
}

export interface Funnel3DOptions {
  type: 'funnel';
  data: { label: string; value: number; color?: string }[];
  shape?: 'cone' | 'pyramid';
}

export interface Treemap3DNode {
  name: string;
  value?: number;
  children?: Treemap3DNode[];
}

export interface Treemap3DOptions {
  type: 'treemap';
  root: Treemap3DNode;
  /** Tile height from the value or from the depth in the tree. Default 'value'. */
  heightBy?: 'value' | 'depth';
}

type GeoGeometry = { type: string; coordinates: unknown };

export interface Map3DOptions {
  type: 'map';
  /** GeoJSON FeatureCollection (polygons / multipolygons). */
  features: { type?: string; features: { id?: string | number; properties?: Record<string, unknown> | null; geometry: GeoGeometry | null }[] };
  /** Value per feature id / name (see `nameKey`). */
  values: Record<string, number>;
  /** Property used as the feature name. Default 'name'. */
  nameKey?: string;
  projection?: 'equalEarth' | 'mercator';
  sequentialScheme?: string;
  /** Max extrusion height. Default 0.24. */
  maxHeight?: number;
}

export interface Trajectory3DOptions {
  type: 'trajectory';
  series: { label: string; color?: string; points: { x: number; y: number; z: number }[] }[];
  /** Tube radius in world units (0 draws thin lines). Default 0.012. */
  tubeRadius?: number;
}

export type ExtraChart3DOptions =
  | StackedBar3DOptions
  | Pie3DOptions
  | Ribbon3DOptions
  | Globe3DOptions
  | Network3DOptions
  | VectorField3DOptions
  | Histogram3DOptions
  | Funnel3DOptions
  | Treemap3DOptions
  | Map3DOptions
  | Trajectory3DOptions;

/* ---------------------------------------------------------------- output */

export interface HoverItem {
  key: string;
  pos: Vec3;
  info: { seriesIndex: number; dataIndex: number; label: string; color: string; rows: { label: string; value: string; color?: string }[]; hlIndex?: number };
}

export interface Parts3D {
  /** 'box': grid walls and tick labels; 'none': free-standing scene. */
  frame: 'box' | 'none';
  scales?: { x: ChartScale | null; y: ChartScale | null; z: ChartScale | null };
  boxes?: MarkItem<BoxAttrs>[];
  sprites?: MarkItem<SpriteAttrs>[];
  meshes?: MeshPart[];
  lines?: { segs: number[]; colors: number[] };
  items: HoverItem[];
  labels?: Label3D[];
  /** Hover resolution: GPU id picking or nearest projected point. */
  picking?: 'gpu' | 'cpu';
}

export interface Env {
  scheme: 'light' | 'dark';
  palette: string[];
  fv: (v: number) => string;
  /** World-space center of free-standing scenes (camera target). */
  center: Vec3;
}

export const SIZE_X = 2;
export const SIZE_Z = 2;
export const SIZE_Y = 1.25;

const rgba = (css: string, scheme: 'light' | 'dark', alpha = 1): [number, number, number, number] => {
  const c = resolveColor(css, scheme);
  return [c[0], c[1], c[2], c[3] * alpha];
};

/* ---------------------------------------------------------------- layouts */

export function layoutExtra(o: ExtraChart3DOptions, env: Env): Parts3D {
  switch (o.type) {
    case 'stackedBar':
      return stackedBars(o, env);
    case 'pie':
      return pie(o, env);
    case 'ribbon':
      return ribbons(o, env);
    case 'globe':
      return globe(o, env);
    case 'network':
      return network(o, env);
    case 'vectorField':
      return vectorField(o, env);
    case 'histogram':
      return histogram(o, env);
    case 'funnel':
      return funnel(o, env);
    case 'treemap':
      return treemap3d(o, env);
    case 'map':
      return prismMap(o, env);
    case 'trajectory':
      return trajectory(o, env);
  }
}

function stackedBars(o: StackedBar3DOptions, env: Env): Parts3D {
  const x = createScale({ type: 'band', domain: o.x, range: [-SIZE_X / 2, SIZE_X / 2], paddingInner: 0, paddingOuter: 0 });
  const z = createScale({ type: 'band', domain: o.z, range: [-SIZE_Z / 2, SIZE_Z / 2], paddingInner: 0, paddingOuter: 0 });
  let max = 0;
  o.z.forEach((_, zi) => o.x.forEach((__, xi) => (max = Math.max(max, o.stacks.reduce((a, s) => a + Math.max(0, s.values[zi]?.[xi] ?? 0), 0)))));
  const y = createScale({ type: 'linear', domain: [0, max], range: [0, SIZE_Y] });
  const frac = o.barSize ?? 0.6;
  const boxes: MarkItem<BoxAttrs>[] = [];
  const items: HoverItem[] = [];
  const nx = o.x.length;
  o.z.forEach((zc, zi) =>
    o.x.forEach((xc, xi) => {
      let acc = 0;
      o.stacks.forEach((s, si) => {
        const v = Math.max(0, s.values[zi]?.[xi] ?? 0);
        const c = rgba(s.color ?? env.palette[si % env.palette.length], env.scheme);
        const y0 = y.map(acc);
        const h = y.map(acc + v) - y0;
        acc += v;
        const value: BoxAttrs = { x: x.map(xc) + x.bandwidth() / 2, z: z.map(zc) + z.bandwidth() / 2, y0, height: h, width: x.bandwidth() * frac, depth: z.bandwidth() * frac, color: c };
        const key = `${si}|${zc}|${xc}`;
        boxes.push({ key, seriesIndex: si, dataIndex: zi * nx + xi, value, enter: { ...value, y0: 0, height: 0 }, delay: (zi * nx + xi) / Math.max(1, o.z.length * nx - 1) });
        items.push({ key, pos: [value.x, y0 + h, value.z], info: { seriesIndex: si, dataIndex: zi * nx + xi, label: `${s.label} · ${xc} · ${zc}`, color: rgbaToCss(c), rows: [{ label: 'Value', value: env.fv(v) }, { label: 'Stack total', value: env.fv(acc) }] } });
      });
    }),
  );
  const shape = o.shape ?? 'box';
  return { frame: 'box', scales: { x, y, z }, ...(shape === 'box' ? { boxes } : { meshes: boxesToMeshes(boxes, shape) }), items };
}

function pie(o: Pie3DOptions, env: Env): Parts3D {
  const total = o.data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  const max = Math.max(maxOf(o.data.map((d) => d.value)), 1e-9);
  // Leaves room around the pie for labels.
  const R = 0.8;
  const r0 = (o.innerRadius ?? 0) * R;
  const thick = o.thickness ?? 0.16;
  const explode = o.explode ?? 0.03;
  const [cx, , cz] = env.center;
  const meshes: MeshPart[] = [];
  const items: HoverItem[] = [];
  const labels: Label3D[] = [];
  let a = 0;
  o.data.forEach((d, i) => {
    const sweep = (Math.max(0, d.value) / total) * Math.PI * 2;
    const mid = a + sweep / 2;
    const ox = Math.sin(mid) * explode;
    const oz = -Math.cos(mid) * explode;
    const h = o.heightByValue ? 0.06 + 0.55 * (d.value / max) : thick;
    const m = new MeshBuilder();
    sectorPrism(m, cx + ox, cz + oz, r0, R, a, a + sweep, 0, h);
    const c = rgba(d.color ?? env.palette[i % env.palette.length], env.scheme);
    meshes.push({ key: `slice|${d.label}`, seriesIndex: 0, dataIndex: i, ...m.build(), color: c, enter: 'floor', delay: i / Math.max(1, o.data.length - 1) });
    const pos: Vec3 = [cx + ox + Math.sin(mid) * (r0 + R) * 0.5, h, cz + oz - Math.cos(mid) * (r0 + R) * 0.5];
    items.push({ key: `slice|${d.label}`, pos, info: { seriesIndex: 0, dataIndex: i, label: d.label, color: rgbaToCss(c), rows: [{ label: 'Value', value: env.fv(d.value) }, { label: 'Share', value: `${((d.value / total) * 100).toFixed(1)}%` }] } });
    if (o.showLabels !== false && sweep > 0.12) labels.push({ text: `${d.label} ${Math.round((d.value / total) * 100)}%`, pos: [cx + Math.sin(mid) * (R + 0.16), h * 0.5 + 0.02, cz - Math.cos(mid) * (R + 0.16)], size: 12, align: 'center' });
    a += sweep;
  });
  return { frame: 'none', meshes, items, labels };
}

function ribbons(o: Ribbon3DOptions, env: Env): Parts3D {
  const numeric = o.x.every((v) => typeof v === 'number');
  const x = numeric
    ? createScale({ type: 'linear', domain: [minOf((o.x as number[])), maxOf((o.x as number[]))], range: [-SIZE_X / 2, SIZE_X / 2], domainLimit: 'strict' })
    : createScale({ type: 'point', domain: o.x.map(String), range: [-SIZE_X / 2, SIZE_X / 2] });
  const z = createScale({ type: 'band', domain: o.series.map((s) => s.label), range: [-SIZE_Z / 2, SIZE_Z / 2], paddingInner: 0, paddingOuter: 0 });
  const all = o.series.flatMap((s) => s.data);
  const y = createScale({ type: 'linear', domain: [Math.min(0, minOf(all)), maxOf(all)], range: [0, SIZE_Y] });
  const meshes: MeshPart[] = [];
  const items: HoverItem[] = [];
  const segs: number[] = [];
  const cols: number[] = [];
  o.series.forEach((s, si) => {
    const zc = z.map(s.label) + z.bandwidth() / 2;
    const pts: Vec3[] = s.data.map((v, i) => [x.map(numeric ? (o.x[i] as number) : String(o.x[i])), y.map(v), zc]);
    const c = rgba(s.color ?? env.palette[si % env.palette.length], env.scheme);
    const m = new MeshBuilder();
    if ((o.variant ?? 'ribbon') === 'wall') wall(m, pts);
    else ribbon(m, pts, z.bandwidth() * (o.width ?? 0.55));
    meshes.push({ key: `ribbon|${s.label}`, seriesIndex: si, dataIndex: 0, ...m.build(), color: c, enter: 'floor', delay: si / Math.max(1, o.series.length - 1) });
    // Crisp edge line along the top.
    const edge = packColor([Math.min(1, c[0] * 0.7), Math.min(1, c[1] * 0.7), Math.min(1, c[2] * 0.7), 1]);
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push(pts[i][0], pts[i][1] + 0.002, pts[i][2], pts[i + 1][0], pts[i + 1][1] + 0.002, pts[i + 1][2]);
      cols.push(edge);
    }
    s.data.forEach((v, i) =>
      items.push({ key: `${si}|${i}`, pos: pts[i], info: { seriesIndex: si, dataIndex: i, hlIndex: -1, label: s.label, color: rgbaToCss(c), rows: [{ label: 'x', value: String(o.x[i]) }, { label: 'Value', value: env.fv(v) }] } }),
    );
  });
  return { frame: 'box', scales: { x, y, z }, meshes, lines: { segs, colors: cols }, items, picking: 'cpu' };
}

function globe(o: Globe3DOptions, env: Env): Parts3D {
  const R = 0.95;
  const c = env.center;
  const at = (lat: number, lon: number, r = R): Vec3 => {
    const p = latLon(lat, lon, r);
    return [p[0] + c[0], p[1] + c[1], p[2] + c[2]];
  };
  const meshes: MeshPart[] = [];
  const ocean = new MeshBuilder();
  sphere(ocean, c, R, 32, 64);
  meshes.push({ key: 'ocean', seriesIndex: 0, dataIndex: 0, ...ocean.build(), color: rgba(o.oceanColor ?? (env.scheme === 'dark' ? '#1d2a44' : '#dfe8f5'), env.scheme), enter: 'center', inert: true });
  const segs: number[] = [];
  const cols: number[] = [];
  const land = packColor(rgba(o.landColor ?? (env.scheme === 'dark' ? '#8fa3c7' : '#5b6b86'), env.scheme, 0.85));
  const ring = (coords: [number, number][]) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = at(coords[i][1], coords[i][0], R * 1.002);
      const b = at(coords[i + 1][1], coords[i + 1][0], R * 1.002);
      segs.push(...a, ...b);
      cols.push(land);
    }
  };
  for (const f of o.outlines?.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') (g.coordinates as [number, number][][]).forEach(ring);
    else if (g.type === 'MultiPolygon') (g.coordinates as [number, number][][][]).forEach((p) => p.forEach(ring));
    else if (g.type === 'LineString') ring(g.coordinates as [number, number][]);
  }
  // Graticule.
  const grat = packColor(rgba(env.scheme === 'dark' ? '#ffffff' : '#000000', env.scheme, 0.08));
  for (let lat = -60; lat <= 60; lat += 30)
    for (let lon = -180; lon < 180; lon += 6) {
      segs.push(...at(lat, lon, R * 1.001), ...at(lat, lon + 6, R * 1.001));
      cols.push(grat);
    }
  for (let lon = -180; lon < 180; lon += 30)
    for (let lat = -84; lat < 84; lat += 6) {
      segs.push(...at(lat, lon, R * 1.001), ...at(lat + 6, lon, R * 1.001));
      cols.push(grat);
    }
  const items: HoverItem[] = [];
  const sprites: MarkItem<SpriteAttrs>[] = [];
  const pts = o.points ?? [];
  const vmax = Math.max(1e-9, maxOf(pts.map((p) => p.value ?? 1)));
  pts.forEach((p, i) => {
    const col = rgba(p.color ?? env.palette[0], env.scheme);
    const v = p.value ?? 1;
    if (o.spikes) {
      const m = new MeshBuilder();
      const base = at(p.lat, p.lon, R);
      const tip = at(p.lat, p.lon, R + 0.04 + 0.45 * (v / vmax));
      frustum(m, base, tip, 0.012, 0.012, 6);
      meshes.push({ key: `spike|${i}`, seriesIndex: 0, dataIndex: i, ...m.build(), color: col, enter: { from: base }, delay: i / Math.max(1, pts.length - 1) });
      items.push({ key: `p${i}`, pos: tip, info: { seriesIndex: 0, dataIndex: i, label: p.label ?? `${p.lat.toFixed(1)}, ${p.lon.toFixed(1)}`, color: rgbaToCss(col), rows: [{ label: 'Value', value: env.fv(v) }] } });
    } else {
      const pos = at(p.lat, p.lon, R * 1.01);
      const value: SpriteAttrs = { x: pos[0], y: pos[1], z: pos[2], size: 5 + 14 * Math.sqrt(v / vmax), color: col };
      sprites.push({ key: `p${i}`, seriesIndex: 0, dataIndex: i, value, enter: { ...value, size: 0 } });
      items.push({ key: `p${i}`, pos, info: { seriesIndex: 0, dataIndex: i, label: p.label ?? `${p.lat.toFixed(1)}, ${p.lon.toFixed(1)}`, color: rgbaToCss(col), rows: [{ label: 'Value', value: env.fv(v) }] } });
    }
  });
  (o.arcs ?? []).forEach((a, i) => {
    const col = packColor(rgba(a.color ?? env.palette[1 % env.palette.length], env.scheme, 0.9));
    const path = greatArc(a.from, a.to, R, 0.35).map((p) => [p[0] + c[0], p[1] + c[1], p[2] + c[2]] as Vec3);
    for (let k = 0; k < path.length - 1; k++) {
      segs.push(...path[k], ...path[k + 1]);
      cols.push(col);
    }
    void i;
  });
  return { frame: 'none', meshes, sprites, lines: { segs, colors: cols }, items };
}

function network(o: Network3DOptions, env: Env): Parts3D {
  const n = o.nodes.length;
  const index = new Map(o.nodes.map((d, i) => [d.id, i]));
  const links = o.links.map((l) => [index.get(l.source), index.get(l.target), l.value ?? 1] as const).filter((l) => l[0] !== undefined && l[1] !== undefined) as [number, number, number][];
  // Deterministic seed positions on a sphere (Fibonacci), then a simple force simulation.
  const pos = Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  });
  const vel = pos.map(() => [0, 0, 0]);
  const iters = o.iterations ?? 300;
  const ideal = 1.6 / Math.cbrt(Math.max(1, n));
  const groupOf = o.nodes.map((d) => d.group ?? '');
  const groupNames = [...new Set(groupOf)];
  for (let it = 0; it < iters; it++) {
    const cool = 1 - it / iters;
    // Group cohesion: nodes drift toward their group's centroid.
    if (groupNames.length > 1) {
      const cen = new Map(groupNames.map((g) => [g, [0, 0, 0, 0]]));
      for (let i = 0; i < n; i++) {
        const c = cen.get(groupOf[i])!;
        c[0] += pos[i][0];
        c[1] += pos[i][1];
        c[2] += pos[i][2];
        c[3]++;
      }
      for (let i = 0; i < n; i++) {
        const c = cen.get(groupOf[i])!;
        for (let k = 0; k < 3; k++) vel[i][k] += (c[k] / c[3] - pos[i][k]) * 0.012;
      }
    }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i][0] - pos[j][0];
        const dy = pos[i][1] - pos[j][1];
        const dz = pos[i][2] - pos[j][2];
        const d2 = dx * dx + dy * dy + dz * dz + 1e-4;
        const f = (ideal * ideal * 0.08) / d2;
        vel[i][0] += dx * f;
        vel[i][1] += dy * f;
        vel[i][2] += dz * f;
        vel[j][0] -= dx * f;
        vel[j][1] -= dy * f;
        vel[j][2] -= dz * f;
      }
    for (const [a, b] of links) {
      const dx = pos[b][0] - pos[a][0];
      const dy = pos[b][1] - pos[a][1];
      const dz = pos[b][2] - pos[a][2];
      const d = Math.hypot(dx, dy, dz) || 1e-4;
      const f = ((d - ideal) / d) * 0.06;
      vel[a][0] += dx * f;
      vel[a][1] += dy * f;
      vel[a][2] += dz * f;
      vel[b][0] -= dx * f;
      vel[b][1] -= dy * f;
      vel[b][2] -= dz * f;
    }
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) {
        vel[i][k] -= pos[i][k] * 0.004;
        pos[i][k] += Math.max(-0.05, Math.min(0.05, vel[i][k])) * cool;
        vel[i][k] *= 0.6;
      }
  }
  // Fit into the scene using the 95th-percentile radius so a few outliers do not shrink the graph.
  const radii = pos.map((p) => Math.hypot(p[0], p[1], p[2])).sort((a, b) => a - b);
  const ext = Math.max(1e-6, radii[Math.floor(radii.length * 0.95)] ?? 1);
  for (const p of pos) {
    const r = Math.hypot(p[0], p[1], p[2]);
    if (r > ext * 1.15) for (let k = 0; k < 3; k++) p[k] *= (ext * 1.15) / r;
  }
  const c = env.center;
  const P = pos.map((p) => [c[0] + (p[0] / ext) * 1.2, c[1] + (p[1] / ext) * 0.75, c[2] + (p[2] / ext) * 1.2] as Vec3);
  const groups = [...new Set(o.nodes.map((d) => d.group ?? ''))];
  const degree = new Array(n).fill(0);
  for (const [a, b] of links) {
    degree[a]++;
    degree[b]++;
  }
  const sprites: MarkItem<SpriteAttrs>[] = [];
  const items: HoverItem[] = [];
  o.nodes.forEach((d, i) => {
    const col = rgba(env.palette[groups.indexOf(d.group ?? '') % env.palette.length], env.scheme);
    const value: SpriteAttrs = { x: P[i][0], y: P[i][1], z: P[i][2], size: d.size ?? 7 + Math.sqrt(degree[i]) * 3, color: col };
    sprites.push({ key: d.id, seriesIndex: 0, dataIndex: i, value, enter: { ...value, x: c[0], y: c[1], z: c[2], size: 0 }, delay: i / Math.max(1, n - 1) });
    items.push({ key: d.id, pos: P[i], info: { seriesIndex: 0, dataIndex: i, label: d.label ?? d.id, color: rgbaToCss(col), rows: [...(d.group ? [{ label: 'Group', value: d.group }] : []), { label: 'Connections', value: String(degree[i]) }] } });
  });
  const segs: number[] = [];
  const cols: number[] = [];
  const lc = packColor(rgba(env.scheme === 'dark' ? '#c8cfe0' : '#4b5568', env.scheme, 0.35));
  for (const [a, b] of links) {
    segs.push(...P[a], ...P[b]);
    cols.push(lc);
  }
  return { frame: 'none', sprites, lines: { segs, colors: cols }, items };
}

function vectorField(o: VectorField3DOptions, env: Env): Parts3D {
  const v = o.vectors;
  const ext = (k: 'x' | 'y' | 'z') => [minOf(v.map((p) => p[k])), maxOf(v.map((p) => p[k]))] as [number, number];
  const x = createScale({ type: 'linear', domain: ext('x'), range: [-SIZE_X / 2, SIZE_X / 2], domainLimit: 'strict' });
  const y = createScale({ type: 'linear', domain: ext('y'), range: [0.05, SIZE_Y], domainLimit: 'strict' });
  const z = createScale({ type: 'linear', domain: ext('z'), range: [-SIZE_Z / 2, SIZE_Z / 2], domainLimit: 'strict' });
  const mags = v.map((p) => Math.hypot(p.u, p.v, p.w));
  const mmax = Math.max(1e-9, maxOf(mags));
  const spacing = SIZE_X / Math.max(2, Math.cbrt(v.length));
  const seq = getInterpolator(o.sequentialScheme ?? 'turbo') ?? getInterpolator('viridis')!;
  const meshes: MeshPart[] = [];
  const items: HoverItem[] = [];
  v.forEach((p, i) => {
    const mag = mags[i];
    const len = (mag / mmax) * spacing * 0.9 * (o.arrowScale ?? 1);
    if (len < 1e-5) return;
    const d: Vec3 = [p.u / mag, p.v / mag, p.w / mag];
    const base: Vec3 = [x.map(p.x), y.map(p.y), z.map(p.z)];
    const neck: Vec3 = [base[0] + d[0] * len * 0.65, base[1] + d[1] * len * 0.65, base[2] + d[2] * len * 0.65];
    const tip: Vec3 = [base[0] + d[0] * len, base[1] + d[1] * len, base[2] + d[2] * len];
    const m = new MeshBuilder();
    frustum(m, base, neck, len * 0.05, len * 0.05, 6, false);
    frustum(m, neck, tip, len * 0.14, 0, 8);
    const col = rgba(seq(0.1 + 0.9 * (mag / mmax)), env.scheme);
    meshes.push({ key: `v${i}`, seriesIndex: 0, dataIndex: i, ...m.build(), color: col, enter: { from: base }, delay: i / Math.max(1, v.length - 1) });
    items.push({ key: `v${i}`, pos: neck, info: { seriesIndex: 0, dataIndex: i, label: 'Vector', color: rgbaToCss(col), rows: [{ label: 'Position', value: `${p.x}, ${p.y}, ${p.z}` }, { label: 'Magnitude', value: env.fv(mag) }] } });
  });
  return { frame: 'box', scales: { x, y, z }, meshes, items };
}

function histogram(o: Histogram3DOptions, env: Env): Parts3D {
  const [bx, bz] = Array.isArray(o.bins) ? o.bins : [o.bins ?? 16, o.bins ?? 16];
  const xs = o.points.map((p) => p.x);
  const zs = o.points.map((p) => p.z);
  const x0 = minOf(xs);
  const x1 = maxOf(xs);
  const z0 = minOf(zs);
  const z1 = maxOf(zs);
  const counts = new Array(bx * bz).fill(0);
  for (const p of o.points) {
    const i = Math.min(bx - 1, Math.floor(((p.x - x0) / (x1 - x0 || 1)) * bx));
    const j = Math.min(bz - 1, Math.floor(((p.z - z0) / (z1 - z0 || 1)) * bz));
    counts[j * bx + i]++;
  }
  const cmax = Math.max(1, maxOf(counts));
  const x = createScale({ type: 'linear', domain: [x0, x1], range: [-SIZE_X / 2, SIZE_X / 2], domainLimit: 'strict' });
  const z = createScale({ type: 'linear', domain: [z0, z1], range: [-SIZE_Z / 2, SIZE_Z / 2], domainLimit: 'strict' });
  const y = createScale({ type: 'linear', domain: [0, cmax], range: [0, SIZE_Y] });
  const seq = getInterpolator(o.sequentialScheme ?? 'plasma') ?? getInterpolator('viridis')!;
  const cw = SIZE_X / bx;
  const cd = SIZE_Z / bz;
  const boxes: MarkItem<BoxAttrs>[] = [];
  const items: HoverItem[] = [];
  for (let j = 0; j < bz; j++)
    for (let i = 0; i < bx; i++) {
      const n = counts[j * bx + i];
      if (!n) continue;
      const col = rgba(seq(0.12 + 0.88 * (n / cmax)), env.scheme);
      const value: BoxAttrs = { x: -SIZE_X / 2 + (i + 0.5) * cw, z: -SIZE_Z / 2 + (j + 0.5) * cd, y0: 0, height: y.map(n), width: cw * 0.9, depth: cd * 0.9, color: col };
      const k = j * bx + i;
      boxes.push({ key: `b${k}`, seriesIndex: 0, dataIndex: k, value, enter: { ...value, height: 0 }, delay: (i + j) / (bx + bz - 2 || 1) });
      const lo = (a: number, b: number, t: number) => a + (b - a) * t;
      items.push({ key: `b${k}`, pos: [value.x, value.height, value.z], info: { seriesIndex: 0, dataIndex: k, label: 'Bin', color: rgbaToCss(col), rows: [{ label: 'x', value: `${env.fv(lo(x0, x1, i / bx))} – ${env.fv(lo(x0, x1, (i + 1) / bx))}` }, { label: 'z', value: `${env.fv(lo(z0, z1, j / bz))} – ${env.fv(lo(z0, z1, (j + 1) / bz))}` }, { label: 'Count', value: String(n) }] } });
    }
  return { frame: 'box', scales: { x, y, z }, boxes, items };
}

function funnel(o: Funnel3DOptions, env: Env): Parts3D {
  const n = o.data.length;
  const max = Math.max(1e-9, maxOf(o.data.map((d) => d.value)));
  const H = SIZE_Y * 1.05;
  const step = H / n;
  const c = env.center;
  const top = c[1] + H / 2;
  const pyramid = o.shape === 'pyramid';
  const rOf = (v: number) => 0.12 + 0.8 * Math.sqrt(v / max);
  const meshes: MeshPart[] = [];
  const items: HoverItem[] = [];
  const labels: Label3D[] = [];
  o.data.forEach((d, i) => {
    const y1 = top - i * step;
    const y0 = y1 - step * 0.92;
    const r1 = rOf(d.value);
    const r0 = i < n - 1 ? rOf(o.data[i + 1].value) : r1 * 0.7;
    const m = new MeshBuilder();
    frustum(m, [c[0], y0, c[2]], [c[0], y1, c[2]], pyramid ? r0 * Math.SQRT2 : r0, pyramid ? r1 * Math.SQRT2 : r1, pyramid ? 4 : 40, true, pyramid ? Math.PI / 4 : 0);
    const col = rgba(d.color ?? env.palette[i % env.palette.length], env.scheme);
    meshes.push({ key: `stage|${d.label}`, seriesIndex: 0, dataIndex: i, ...m.build(), color: col, enter: 'center', delay: i / Math.max(1, n - 1) });
    items.push({ key: `stage|${d.label}`, pos: [c[0] + r1 * 0.7, (y0 + y1) / 2, c[2]], info: { seriesIndex: 0, dataIndex: i, label: d.label, color: rgbaToCss(col), rows: [{ label: 'Value', value: env.fv(d.value) }, { label: 'Of first stage', value: `${((d.value / o.data[0].value) * 100).toFixed(1)}%` }] } });
    labels.push({ text: `${d.label}  ${env.fv(d.value)}`, pos: [c[0], (y0 + y1) / 2, c[2]], size: 12, align: 'left', dx: 0 });
  });
  // Labels float to the right of each stage (screen space offset applied by distance).
  labels.forEach((l, i) => (l.pos = [c[0] + rOf(o.data[i].value) + 0.12, l.pos[1], c[2]]));
  return { frame: 'none', meshes, items, labels };
}

function treemap3d(o: Treemap3DOptions, env: Env): Parts3D {
  const root = hierarchy(o.root)
    .sum((d) => (d.children?.length ? 0 : (d.value ?? 0)))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const layout = treemap<Treemap3DNode>().tile(treemapSquarify).size([SIZE_X, SIZE_Z]).paddingInner(0.012).paddingOuter(0.02).paddingTop(0.02).round(false);
  const t = layout(root);
  const leaves = t.leaves();
  const vmax = Math.max(1e-9, maxOf(leaves.map((l) => l.value ?? 0)));
  const depthMax = Math.max(1, maxOf(leaves.map((l) => l.depth)));
  const tops = root.children?.map((c) => c.data.name) ?? [];
  const boxes: MarkItem<BoxAttrs>[] = [];
  const items: HoverItem[] = [];
  const c = env.center;
  leaves.forEach((l, i) => {
    let top = l;
    while (top.depth > 1 && top.parent) top = top.parent;
    const ti = Math.max(0, tops.indexOf(top.data.name));
    const col = rgba(env.palette[ti % env.palette.length], env.scheme);
    const h = (o.heightBy ?? 'value') === 'value' ? 0.04 + 0.7 * ((l.value ?? 0) / vmax) : (0.12 * l.depth) / depthMax + 0.05;
    const value: BoxAttrs = { x: c[0] - SIZE_X / 2 + (l.x0 + l.x1) / 2, z: c[2] - SIZE_Z / 2 + (l.y0 + l.y1) / 2, y0: 0, height: h, width: Math.max(0.002, l.x1 - l.x0), depth: Math.max(0.002, l.y1 - l.y0), color: col };
    const path = l.ancestors().reverse().slice(1).map((a) => a.data.name).join(' › ');
    boxes.push({ key: path, seriesIndex: ti, dataIndex: i, value, enter: { ...value, height: 0 }, delay: i / Math.max(1, leaves.length - 1) });
    items.push({ key: path, pos: [value.x, h, value.z], info: { seriesIndex: ti, dataIndex: i, label: path, color: rgbaToCss(col), rows: [{ label: 'Value', value: env.fv(l.value ?? 0) }] } });
  });
  return { frame: 'none', boxes, items };
}

function prismMap(o: Map3DOptions, env: Env): Parts3D {
  const key = o.nameKey ?? 'name';
  const proj: GeoProjection = (o.projection === 'mercator' ? geoMercator() : geoEqualEarth()).fitExtent(
    [
      [-SIZE_X / 2, -SIZE_Z / 2],
      [SIZE_X / 2, SIZE_Z / 2],
    ],
    o.features as never,
  );
  const values = o.features.features.map((f) => o.values[String(f.properties?.[key] ?? f.id ?? '')]);
  const finite = values.filter((v): v is number => Number.isFinite(v));
  const vmin = minOf(finite);
  const vmax = maxOf(finite);
  const seq = getInterpolator(o.sequentialScheme ?? 'viridis')!;
  const maxH = o.maxHeight ?? 0.24;
  const base = env.center[1] - 0.2;
  const meshes: MeshPart[] = [];
  const items: HoverItem[] = [];
  const none = rgba(env.scheme === 'dark' ? '#3a3f4b' : '#d7dbe3', env.scheme);
  // geoPath streams through the projection's clipping, so polygons crossing the antimeridian are cut correctly.
  let rings: [number, number][][] = [];
  let cur: [number, number][] = [];
  const sink = {
    moveTo(x: number, y: number) {
      cur = [[x, y]];
    },
    lineTo(x: number, y: number) {
      cur.push([x, y]);
    },
    closePath() {
      if (cur.length > 2) rings.push([...cur, cur[0]]);
      cur = [];
    },
    arc() {},
    rect() {},
  };
  const path = geoPath(proj, sink as never);
  o.features.features.forEach((f, i) => {
    if (!f.geometry) return;
    rings = [];
    path(f as never);
    if (!rings.length) return;
    const v = values[i];
    const has = Number.isFinite(v);
    const tnorm = has ? (vmax === vmin ? 0.5 : (v - vmin) / (vmax - vmin)) : 0;
    const h = has ? 0.01 + maxH * tnorm : 0.006;
    const m = new MeshBuilder();
    let cx = 0;
    let cz = 0;
    let cn = 0;
    for (const ring of rings) {
      // Signed area tells holes (opposite winding) from outer rings; holes are skipped as separate caps.
      let area = 0;
      for (let k = 0; k < ring.length - 1; k++) area += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
      if (area < 0) continue;
      for (const pt of ring) {
        cx += pt[0];
        cz += pt[1];
        cn++;
      }
      prism(m, [ring], base, base + h);
    }
    if (!m.vertexCount) return;
    const name = String(f.properties?.[key] ?? f.id ?? `#${i}`);
    const col = has ? rgba(seq(0.1 + 0.9 * tnorm), env.scheme) : none;
    meshes.push({ key: `geo|${name}`, seriesIndex: 0, dataIndex: i, ...m.build(), color: col, enter: 'floor', delay: cn ? (cx / cn + SIZE_X / 2) / SIZE_X : 0 });
    if (has) items.push({ key: `geo|${name}`, pos: [cx / (cn || 1), base + h, cz / (cn || 1)], info: { seriesIndex: 0, dataIndex: i, label: name, color: rgbaToCss(col), rows: [{ label: 'Value', value: env.fv(v) }] } });
  });
  return { frame: 'none', meshes, items };
}

function trajectory(o: Trajectory3DOptions, env: Env): Parts3D {
  const all = o.series.flatMap((s) => s.points);
  const ext = (k: 'x' | 'y' | 'z') => [minOf(all.map((p) => p[k])), maxOf(all.map((p) => p[k]))] as [number, number];
  const x = createScale({ type: 'linear', domain: ext('x'), range: [-SIZE_X / 2, SIZE_X / 2] });
  const y = createScale({ type: 'linear', domain: ext('y'), range: [0, SIZE_Y] });
  const z = createScale({ type: 'linear', domain: ext('z'), range: [-SIZE_Z / 2, SIZE_Z / 2] });
  const meshes: MeshPart[] = [];
  const items: HoverItem[] = [];
  const segs: number[] = [];
  const cols: number[] = [];
  const r = o.tubeRadius ?? 0.012;
  o.series.forEach((s, si) => {
    const col = rgba(s.color ?? env.palette[si % env.palette.length], env.scheme);
    const P = s.points.map((p) => [x.map(p.x), y.map(p.y), z.map(p.z)] as Vec3);
    if (r > 0) {
      const m = new MeshBuilder();
      for (let i = 0; i < P.length - 1; i++) frustum(m, P[i], P[i + 1], r, r, 6, false);
      meshes.push({ key: `traj|${s.label}`, seriesIndex: si, dataIndex: 0, ...m.build(), color: col, enter: { from: P[0] } });
    } else {
      const pc = packColor(col);
      for (let i = 0; i < P.length - 1; i++) {
        segs.push(...P[i], ...P[i + 1]);
        cols.push(pc);
      }
    }
    const every = Math.max(1, Math.floor(P.length / 120));
    for (let i = 0; i < P.length; i += every)
      items.push({ key: `${si}|${i}`, pos: P[i], info: { seriesIndex: si, dataIndex: i, hlIndex: -1, label: s.label, color: rgbaToCss(col), rows: [{ label: 'x', value: env.fv(s.points[i].x) }, { label: 'y', value: env.fv(s.points[i].y) }, { label: 'z', value: env.fv(s.points[i].z) }] } });
  });
  return { frame: 'box', scales: { x, y, z }, meshes, lines: { segs, colors: cols }, items, picking: 'cpu' };
}

