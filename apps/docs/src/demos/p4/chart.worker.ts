import { lineSeries, startChartWorker } from '@rsc-gl/core';
import { webgpuBackend } from '@rsc-gl/gpu/webgpu';
import { webgl2Backend } from '@rsc-gl/gpu/webgl2';

// Everything below runs in the worker: data generation, layout, GPU drawing and hit testing.
startChartWorker({
  series: [lineSeries],
  backends: [webgpuBackend, webgl2Backend],
  setup(chart) {
    let t = 0;
    setInterval(() => {
      const values: number[] = [];
      for (let i = 0; i < 4; i++, t++) values.push(Math.sin(t / 18) * 40 + Math.sin(t / 5.3) * 12 + 60 + ((t * 7919) % 13) - 6);
      chart.appendData(0, values, 400);
    }, 40);
  },
});
