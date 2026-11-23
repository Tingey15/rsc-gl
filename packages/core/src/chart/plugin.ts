import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import type { FrameState } from '../marks/instance-mark';
import type { LayoutContext } from '../series/types';
import type { Chart } from './chart';

export interface PlotPoint {
  x: number;
  y: number;
}

/**
 * Optional chart feature (zoom, marquee, reference lines, annotations, …).
 * Features are plain objects passed to the chart, so applications only bundle
 * the ones they use. Every hook is optional; event hooks return `true` to
 * consume the event (the chart then skips its default hover handling).
 */
export interface ChartPlugin {
  readonly name: string;
  /** Called once when the chart is created. */
  attach?(chart: Chart): void;
  /** After every layout, with the final scales and plot rectangle. */
  layout?(chart: Chart, ctx: LayoutContext): void;
  /** GPU pass behind the series (after the grid). */
  drawBack?(pass: RenderPass, frame: FrameState, ctx: LayoutContext): void;
  /** GPU pass in front of the series, clipped to the plot. */
  drawPlot?(pass: RenderPass, frame: FrameState, ctx: LayoutContext): void;
  /** GPU pass in front of everything, unclipped. */
  drawFront?(pass: RenderPass, frame: FrameState, ctx: LayoutContext): void;
  /** Canvas2D overlay (labels, handles). */
  drawOverlay?(g: CanvasRenderingContext2D, ctx: LayoutContext, now: number): void;
  isAnimating?(now: number): boolean;
  /** Vector export: SVG drawn behind ('back') or in front of the series. */
  toSvg?(now: number, layer: 'back' | 'front'): string;
  onPointerDown?(e: PointerEvent, p: PlotPoint): boolean | void;
  onPointerMove?(e: PointerEvent, p: PlotPoint): boolean | void;
  onPointerUp?(e: PointerEvent, p: PlotPoint): boolean | void;
  onWheel?(e: WheelEvent, p: PlotPoint): boolean | void;
  onDoubleClick?(e: MouseEvent, p: PlotPoint): boolean | void;
  onKeyDown?(e: KeyboardEvent): boolean | void;
  /** For drag plugins (marquee): the key needed to start a drag. Others yield plain drags to it. */
  readonly dragModifier?: 'none' | 'shift';
  /** Extra space (px) the plugin needs below the plot (e.g. a zoom slider). */
  reserveBottom?(chart: Chart): number;
  setDevice?(device: GpuDevice): void;
  destroy?(): void;
}
