import ShapedBars3D from '../demos/three3/ShapedBars3D';
import ShapedBars3DSrc from '../demos/three3/ShapedBars3D.tsx?raw';
import Pie3D from '../demos/three3/Pie3D';
import Pie3DSrc from '../demos/three3/Pie3D.tsx?raw';
import Ribbon3D from '../demos/three3/Ribbon3D';
import Ribbon3DSrc from '../demos/three3/Ribbon3D.tsx?raw';
import Globe3D from '../demos/three3/Globe3D';
import Globe3DSrc from '../demos/three3/Globe3D.tsx?raw';
import Network3D from '../demos/three3/Network3D';
import Network3DSrc from '../demos/three3/Network3D.tsx?raw';
import VectorField3D from '../demos/three3/VectorField3D';
import VectorField3DSrc from '../demos/three3/VectorField3D.tsx?raw';
import Histogram3D from '../demos/three3/Histogram3D';
import Histogram3DSrc from '../demos/three3/Histogram3D.tsx?raw';
import Funnel3D from '../demos/three3/Funnel3D';
import Funnel3DSrc from '../demos/three3/Funnel3D.tsx?raw';
import Treemap3D from '../demos/three3/Treemap3D';
import Treemap3DSrc from '../demos/three3/Treemap3D.tsx?raw';
import Map3D from '../demos/three3/Map3D';
import Map3DSrc from '../demos/three3/Map3D.tsx?raw';
import Trajectory3D from '../demos/three3/Trajectory3D';
import Trajectory3DSrc from '../demos/three3/Trajectory3D.tsx?raw';
import ContourSurface3D from '../demos/three3/ContourSurface3D';
import ContourSurface3DSrc from '../demos/three3/ContourSurface3D.tsx?raw';
import { chartPage } from './MoreCharts';

const orbit = 'Drag to orbit, scroll to zoom; hover for details. ';

export const ShapedBars3DPage = chartPage('3D shaped & stacked bars', `${orbit}Bars can be boxes, cylinders, cones or pyramids, and layers can stack. Switching shapes morphs the geometry on the GPU.`, [{ title: 'ShapedBars3D.tsx', code: ShapedBars3DSrc, C: ShapedBars3D }], [
  { name: 'shape', type: "'box' | 'cylinder' | 'cone' | 'pyramid'", default: "'box'", description: 'Bar geometry (Bar3DChart and StackedBar3DChart).' },
  { name: 'stacks', type: '{ label, color?, values[z][x] }[]', description: 'StackedBar3DChart layers, bottom to top.' },
]);

export const Pie3DPage = chartPage('3D pie & donut', `${orbit}Extruded slices with optional value-driven heights.`, [{ title: 'Pie3D.tsx', code: Pie3DSrc, C: Pie3D }], [
  { name: 'data', type: '{ label, value, color? }[]', description: 'Slices.' },
  { name: 'innerRadius', type: 'number', default: '0', description: 'Donut hole (0..1).' },
  { name: 'heightByValue', type: 'boolean', description: 'Slice height follows the value.' },
  { name: 'thickness / explode / showLabels', type: 'number / number / boolean', description: 'Extrusion, gap between slices, depth-tested labels.' },
]);

export const Ribbon3DPage = chartPage('3D ribbons & ridgelines', `${orbit}One row per series: flat ribbons or walls down to the floor.`, [{ title: 'Ribbon3D.tsx', code: Ribbon3DSrc, C: Ribbon3D }], [
  { name: 'x', type: '(number | string)[]', description: 'Shared x positions.' },
  { name: 'series', type: '{ label, color?, data }[]', description: 'One row along z per series.' },
  { name: 'variant', type: "'ribbon' | 'wall'", default: "'ribbon'", description: 'Band or ridgeline wall.' },
]);

export const Globe3DPage = chartPage('3D globe', `${orbit}Points or spikes by value, great-circle arcs that lift with distance, and GeoJSON outlines. Hidden-side items are depth-occluded.`, [{ title: 'Globe3D.tsx', code: Globe3DSrc, C: Globe3D }], [
  { name: 'points', type: '{ lat, lon, value?, label?, color? }[]', description: 'Dots (size by value) or spikes.' },
  { name: 'arcs', type: '{ from: [lat, lon], to: [lat, lon], color? }[]', description: 'Great-circle routes.' },
  { name: 'outlines', type: 'GeoJSON FeatureCollection', description: 'Land / borders drawn on the sphere.' },
  { name: 'spikes / oceanColor / landColor', type: 'boolean / string / string', description: 'Styling.' },
]);

export const Network3DPage = chartPage('3D network graph', `${orbit}Force-directed layout in three dimensions; node size by degree, color by group.`, [{ title: 'Network3D.tsx', code: Network3DSrc, C: Network3D }], [
  { name: 'nodes', type: '{ id, label?, group?, size? }[]', description: 'Nodes.' },
  { name: 'links', type: '{ source, target, value? }[]', description: 'Edges by node id.' },
  { name: 'iterations', type: 'number', default: '300', description: 'Force simulation steps.' },
]);

export const VectorField3DPage = chartPage('3D vector field', `${orbit}Lit arrows sized and colored by magnitude.`, [{ title: 'VectorField3D.tsx', code: VectorField3DSrc, C: VectorField3D }], [
  { name: 'vectors', type: '{ x, y, z, u, v, w }[]', description: 'Position and direction.' },
  { name: 'arrowScale / sequentialScheme', type: 'number / string', description: 'Length multiplier and color map.' },
]);

export const Histogram3DPage = chartPage('3D histogram', `${orbit}Bins x / z samples into a grid of columns (bivariate density).`, [{ title: 'Histogram3D.tsx', code: Histogram3DSrc, C: Histogram3D }], [
  { name: 'points', type: '{ x, z }[]', description: 'Samples.' },
  { name: 'bins', type: 'number | [nx, nz]', default: '16', description: 'Grid resolution.' },
]);

export const Funnel3DPage = chartPage('3D funnel', `${orbit}Stages as stacked cone or pyramid frustums.`, [{ title: 'Funnel3D.tsx', code: Funnel3DSrc, C: Funnel3D }], [
  { name: 'data', type: '{ label, value, color? }[]', description: 'Stages from top to bottom.' },
  { name: 'shape', type: "'cone' | 'pyramid'", default: "'cone'", description: 'Stage geometry.' },
]);

export const Treemap3DPage = chartPage('3D treemap', `${orbit}Squarified tiles extruded by value or by depth.`, [{ title: 'Treemap3D.tsx', code: Treemap3DSrc, C: Treemap3D }], [
  { name: 'root', type: '{ name, value?, children? }', description: 'Hierarchy.' },
  { name: 'heightBy', type: "'value' | 'depth'", default: "'value'", description: 'Tile extrusion.' },
]);

export const Map3DPage = chartPage('3D prism map', `${orbit}Regions extruded and colored by value (GeoJSON, equal-earth or mercator).`, [{ title: 'Map3D.tsx', code: Map3DSrc, C: Map3D }], [
  { name: 'features', type: 'GeoJSON FeatureCollection', description: 'Polygons / multipolygons.' },
  { name: 'values', type: 'Record<string, number>', description: 'Value by feature name (nameKey) or id.' },
  { name: 'projection / maxHeight', type: "'equalEarth' | 'mercator' / number", description: 'Projection and extrusion.' },
]);

export const Trajectory3DPage = chartPage('3D trajectories', `${orbit}Paths through space as lit tubes (or thin lines for very long paths).`, [{ title: 'Trajectory3D.tsx', code: Trajectory3DSrc, C: Trajectory3D }], [
  { name: 'series', type: '{ label, color?, points: { x, y, z }[] }[]', description: 'Paths.' },
  { name: 'tubeRadius', type: 'number', default: '0.012', description: '0 draws lines.' },
]);

export const ContourSurface3DPage = chartPage('3D surface contours', `${orbit}Iso-lines traced with marching squares on the surface and on the floor.`, [{ title: 'ContourSurface3D.tsx', code: ContourSurface3DSrc, C: ContourSurface3D }], [
  { name: 'contours', type: 'number | number[]', description: 'Level count or explicit levels.' },
  { name: 'floorContours', type: 'boolean', description: 'Project iso-lines onto the floor.' },
]);
