import { describe, expect, it } from 'vitest';
import { contourSegments, shapedBar } from './shapes3d';
import { MeshBuilder, faceNormal, greatArc, latLon, prism, sectorPrism } from './geometry3d';

const box = { x: 0, z: 0, y0: 0, height: 1, width: 0.4, depth: 0.4, color: [1, 0, 0, 1] as [number, number, number, number] };

describe('3D geometry', () => {
  it('builds shaped bars with matching normals', () => {
    for (const shape of ['cylinder', 'cone', 'pyramid'] as const) {
      const g = shapedBar(box, shape);
      expect(g.positions.length).toBe(g.normals.length);
      expect(g.positions.length % 9).toBe(0);
      // Every vertex stays inside the bar's footprint and height.
      for (let i = 0; i < g.positions.length; i += 3) {
        expect(Math.abs(g.positions[i])).toBeLessThanOrEqual(0.2 * Math.SQRT2 + 1e-6);
        expect(g.positions[i + 1]).toBeGreaterThanOrEqual(-1e-6);
        expect(g.positions[i + 1]).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });
  it('computes outward face normals', () => {
    expect(faceNormal([0, 0, 0], [1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });
  it('extrudes polygons with holes', () => {
    const m = new MeshBuilder();
    prism(m, [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]], 0, 1);
    const { positions } = m.build();
    // Top + bottom caps of a square ring (8 triangles each) plus walls.
    expect(positions.length / 9).toBeGreaterThan(16);
  });
  it('builds pie slices and great-circle arcs', () => {
    const m = new MeshBuilder();
    sectorPrism(m, 0, 0, 0.3, 1, 0, Math.PI / 2, 0, 0.2);
    expect(m.vertexCount).toBeGreaterThan(0);
    const arc = greatArc([0, 0], [0, 90], 1, 0.2, 10);
    expect(arc).toHaveLength(11);
    const end = latLon(0, 90);
    expect(arc[10][0]).toBeCloseTo(end[0], 5);
    // Lifted above the sphere in the middle.
    expect(Math.hypot(...arc[5])).toBeGreaterThan(1);
  });
  it('traces contour lines with marching squares', () => {
    const xs = new Float32Array([0, 1, 2]);
    const zs = new Float32Array([0, 1, 2]);
    const values = new Float64Array([0, 0, 0, 0, 2, 0, 0, 0, 0]);
    const heights = new Float32Array(values);
    const segs = contourSegments(xs, zs, heights, values, [1]);
    // A closed diamond around the center peak: 4 segments of 6 numbers.
    expect(segs.length).toBe(24);
  });
});
