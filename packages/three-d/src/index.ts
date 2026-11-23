export { Chart3D, type Chart3DOptions, type Bar3DOptions, type Scatter3DOptions, type Surface3DOptions, type Scatter3DPoint, type Axis3DOptions, type CameraOptions, type Item3D, type Extra3DOptions } from './chart3d';
export { BoxMark, SpriteMark, SurfaceMark, Lines3D, TextMark3D, type BoxAttrs, type SpriteAttrs, type Frame3D, type Label3D } from './marks3d';
export { perspective, lookAt, multiply, project, type Mat4, type Vec3 } from './math';
export { MeshMark3D, type MeshPart } from './mesh3d';
export { MeshBuilder, frustum, sectorPrism, ribbon, wall, sphere, prism, latLon, greatArc } from './geometry3d';
export type {
  StackedBar3DOptions,
  Pie3DOptions,
  Ribbon3DOptions,
  Globe3DOptions,
  Network3DOptions,
  VectorField3DOptions,
  Histogram3DOptions,
  Funnel3DOptions,
  Treemap3DOptions,
  Treemap3DNode,
  Map3DOptions,
  Trajectory3DOptions,
} from './layouts3d';
export type { BarShape } from './shapes3d';
