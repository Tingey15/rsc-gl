import Bars3D from '../demos/three/Bars3D';
import Bars3DSrc from '../demos/three/Bars3D.tsx?raw';
import Scatter3D from '../demos/three/Scatter3D';
import Scatter3DSrc from '../demos/three/Scatter3D.tsx?raw';
import Surface3D from '../demos/three/Surface3D';
import Surface3DSrc from '../demos/three/Surface3D.tsx?raw';
import { Callout, Demo, H2, Page, PropsTable } from '../components/docs';
import { CodeBlock } from '../components/highlight';

const intro = (
  <Callout>
    Drag to orbit, scroll to zoom, and use the arrow keys when the chart is focused. Grid walls flip to the far side of the box as the camera moves, so
    data is never hidden behind a wall. 3D charts share the same GPU device and frame loop as 2D charts.
  </Callout>
);

export function Bar3DPage() {
  return (
    <Page title="3D bars" lede="Instanced, lit boxes on a category grid. Bars grow from the floor with a staggered entrance and morph when data changes.">
      {intro}
      <H2>Basics</H2>
      <Demo title="Bars3D.tsx" code={Bars3DSrc}>
        <Bars3D />
      </Demo>
      <H2>API</H2>
      <PropsTable
        rows={[
          { name: 'x / z', type: 'string[]', description: 'Categories along the x (columns) and z (rows) axes.' },
          { name: 'values', type: 'number[][]', description: 'values[zIndex][xIndex].' },
          { name: 'colorBy', type: "'z' | 'x' | 'value'", default: "'z'", description: 'Categorical by row/column, or a sequential scale on the value.' },
          { name: 'barSize', type: 'number', default: '0.62', description: 'Footprint fraction of each grid cell.' },
          { name: 'camera', type: '{ azimuth, elevation, distance, autoRotate }', description: 'Initial camera (degrees).' },
          { name: 'xAxis / yAxis / zAxis', type: '{ label, min, max, format }', description: 'Axis titles, domains and tick formatting.' },
          { name: 'onItemClick', type: '(item) => void', description: 'Clicked bar with its row, column and value.' },
        ]}
      />
    </Page>
  );
}

export function Scatter3DPage() {
  return (
    <Page title="3D scatter" lede="Camera-facing sprites shaded as spheres, depth-tested against the grid. Points rise from the floor on entry.">
      {intro}
      <H2>Basics</H2>
      <Demo title="Scatter3D.tsx" code={Scatter3DSrc}>
        <Scatter3D />
      </Demo>
    </Page>
  );
}

export function Surface3DPage() {
  return (
    <Page title="3D surface" lede="Height-field meshes with per-vertex normals and a sequential color map. Switching datasets morphs the surface on the GPU.">
      {intro}
      <H2>Basics</H2>
      <Demo title="Surface3D.tsx" code={Surface3DSrc}>
        <Surface3D />
      </Demo>
      <H2>Framework-agnostic usage</H2>
      <CodeBlock
        code={`import { Chart3D } from '@rsc-gl/3d';
import { RenderEngine } from '@rsc-gl/core';
import { webgpuBackend } from '@rsc-gl/gpu/webgpu';
import { webgl2Backend } from '@rsc-gl/gpu/webgl2';

const chart = new Chart3D(document.getElementById('host')!, {
  type: 'surface',
  xs, zs,
  values: (x, z) => Math.sin(x) * Math.cos(z),
  wireframe: true,
}, RenderEngine.get({ backends: [webgpuBackend, webgl2Backend] }));`}
      />
    </Page>
  );
}
