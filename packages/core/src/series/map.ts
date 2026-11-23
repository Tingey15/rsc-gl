import {
  geoAlbersUsa,
  geoEqualEarth,
  geoEquirectangular,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from 'd3-geo';
import earcut from 'earcut';
import type { MeshItem } from '../marks/mesh-mark';
import { getInterpolator, parseCss, resolveColor, rgbaToCss, type RGBA } from '../theme/colors';
import type { MapSeriesOptions } from '../types-extra';
import { formatSeriesValue } from './format-value';
import { GeomRenderer, type GeomHit, type GeomLine, type GeomOutput } from './geom-renderer';
import type { LayoutContext, LegendEntry, ResolvedSeries, SeriesDefinition, SeriesPoint } from './types';
import { minOf, maxOf } from '../data/extent';

const PROJECTIONS: Record<string, () => GeoProjection> = {
  equalEarth: geoEqualEarth,
  mercator: geoMercator,
  naturalEarth1: geoNaturalEarth1,
  equirectangular: geoEquirectangular,
  albersUsa: geoAlbersUsa as unknown as () => GeoProjection,
  orthographic: geoOrthographic,
};

interface Feature {
  type: 'Feature';
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry: unknown;
}

/** Captures projected rings from d3-geo's path generator. */
function projectRings(feature: Feature, path: ReturnType<typeof geoPath>): number[][] {
  const rings: number[][] = [];
  let cur: number[] = [];
  const ctx = {
    moveTo(x: number, y: number) {
      if (cur.length) rings.push(cur);
      cur = [x, y];
    },
    lineTo(x: number, y: number) {
      cur.push(x, y);
    },
    closePath() {
      if (cur.length) rings.push(cur);
      cur = [];
    },
    arc() {},
  };
  path.context(ctx as unknown as CanvasRenderingContext2D)(feature as unknown as GeoPermissibleObjects);
  if (cur.length) rings.push(cur);
  return rings.filter((r) => r.length >= 6);
}

const signedArea = (r: number[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i += 2) {
    const j = (i + 2) % r.length;
    a += r[i] * r[j + 1] - r[j] * r[i + 1];
  }
  return a / 2;
};

/** Triangulates projected rings; rings with opposite winding to their container are holes. */
function triangulate(rings: number[][]): Float32Array {
  const out: number[] = [];
  const outers: { ring: number[]; holes: number[][] }[] = [];
  const sign = rings.length ? Math.sign(signedArea(rings[0])) || 1 : 1;
  for (const r of rings) {
    if (Math.sign(signedArea(r)) === sign || !outers.length) outers.push({ ring: r, holes: [] });
    else outers[outers.length - 1].holes.push(r);
  }
  for (const o of outers) {
    const flat = [...o.ring];
    const holeIdx: number[] = [];
    for (const h of o.holes) {
      holeIdx.push(flat.length / 2);
      flat.push(...h);
    }
    const idx = earcut(flat, holeIdx.length ? holeIdx : undefined);
    for (const v of idx) out.push(flat[v * 2], flat[v * 2 + 1]);
  }
  return new Float32Array(out);
}

class MapRenderer extends GeomRenderer {
  private cache = new Map<string, Float32Array>();
  private cacheKey = '';

  protected build(series: ResolvedSeries<MapSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const meshes: MeshItem[] = [];
    const hits: GeomHit[] = [];
    const lines: GeomLine[] = [];
    for (const s of series) {
      const o = s.options;
      const geo = o.geoJson as { features: Feature[] } | undefined;
      if (!geo) continue;
      const pl = ctx.plot;
      const proj = (PROJECTIONS[o.projection ?? 'equalEarth'] ?? geoEqualEarth)();
      if (o.rotate && 'rotate' in proj) proj.rotate([o.rotate[0], o.rotate[1]]);
      proj.fitExtent(
        [
          [pl.x + 4, pl.y + 4],
          [pl.x + pl.width - 4, pl.y + pl.height - 4],
        ],
        geo as unknown as GeoPermissibleObjects,
      );
      const path = geoPath(proj);
      const key = `${pl.x}|${pl.y}|${pl.width}|${pl.height}|${o.projection}|${o.rotate?.join(',')}`;
      if (key !== this.cacheKey) {
        this.cache.clear();
        this.cacheKey = key;
      }
      const idProp = o.idProperty ?? 'id';
      const byId = new Map(s.points.map((p) => [p.key, p]));
      const vals = s.points.map((p) => p.y).filter((v): v is number => v !== null);
      const lo = minOf(vals);
      const hi = maxOf(vals);
      const interp = getInterpolator(o.colorScheme ?? 'viridis') ?? getInterpolator('viridis')!;
      const unknown = resolveColor(o.unknownColor ?? (ctx.scheme === 'dark' ? 'gray-200' : 'gray-150'), ctx.scheme);
      geo.features.forEach((f, fi) => {
        const id = String(f.properties?.[idProp] ?? f.id ?? fi);
        let tri = this.cache.get(id);
        if (!tri) {
          tri = triangulate(projectRings(f, path));
          this.cache.set(id, tri);
        }
        if (!tri.length) return;
        const p = byId.get(id);
        const c: RGBA = p && p.y !== null ? parseCss(interp(hi === lo ? 0.5 : (p.y - lo) / (hi - lo))) : unknown;
        const mk = `${s.id}|${id}`;
        meshes.push({ key: mk, seriesIndex: p ? s.index : -1, dataIndex: p ? p.index : -1, triangles: tri, color: c });
        if (p) {
          const centroid = path.centroid(f as unknown as GeoPermissibleObjects);
          hits.push({ kind: 'mesh', key: mk, series: s, dataIndex: p.index, anchor: { x: centroid[0], y: centroid[1] } });
        }
      });
      // Outline for the globe in orthographic projection.
      if (o.projection === 'orthographic') {
        const r = proj.scale();
        const [cx, cy] = proj.translate();
        lines.push({
          key: `${s.id}|sphere`,
          points: Array.from({ length: 97 }, (_, i) => ({ key: `s${i}`, x: cx + Math.cos((i / 96) * Math.PI * 2) * r, y: cy + Math.sin((i / 96) * Math.PI * 2) * r })),
          style: { color: resolveColor(ctx.theme.axisColor), width: 1, dash: [], alternateDash: [], opacity: 1 },
        });
      }
    }
    return { meshes, hits, lines };
  }
}

export const mapSeries: SeriesDefinition<MapSeriesOptions> = {
  type: 'map',
  coordinates: 'polar',
  normalize(o, ctx) {
    const points: SeriesPoint[] = (o.regions ?? []).map((r, i) => ({ key: String(r.id), index: i, x: String(r.id), y: typeof r.value === 'number' ? r.value : null, label: r.name ?? String(r.id), datum: r }));
    const color = resolveColor(o.color ?? '#888', ctx.scheme);
    return [{ id: o.id ?? 'map', type: 'map', label: o.label ?? 'Map', index: ctx.nextIndex(), color, colorCss: rgbaToCss(color), options: o, points, hidden: false, xAxisId: 'x', yAxisId: 'y', legendShape: 'gradient' }];
  },
  legendEntries(series): LegendEntry[] {
    return series.map((s) => {
      const vals = s.points.map((p) => p.y).filter((v): v is number => v !== null);
      const lo = minOf(vals);
      const hi = maxOf(vals);
      const interp = getInterpolator(s.options.colorScheme ?? 'viridis')!;
      const stops = Array.from({ length: 7 }, (_, i) => interp(i / 6));
      return { id: s.id, label: s.label, color: stops[3], shape: 'gradient', gradient: stops, min: String(lo), max: String(hi), seriesIndex: s.index };
    });
  },
  formatValue: (s, p, f) => `${p.label}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new MapRenderer(d),
};
