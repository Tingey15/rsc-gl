import type { ComponentType } from 'react';
import Bars from './pages/Bars';
import { AreasPage, ComboPage, LinesPage, PiePage, ScatterPage, SparkGaugePage } from './pages/ChartPages';
import { Bar3DPage, Scatter3DPage, Surface3DPage } from './pages/ThreeD';
import {
  AccessibilityPage,
  AnimationPage,
  AxesPage,
  ChildrenApiPage,
  ExportPage,
  InteractionPage,
  LegendTooltipPage,
  LocalizationPage,
  PerformancePage,
  StylingPage,
} from './pages/Features';
import {
  AnnotationsPage,
  BoxplotPage,
  CandlestickPage,
  ChordPage,
  FunnelPage,
  GanttPage,
  HeatmapPage,
  MapPage,
  RadarPage,
  RadialBarPage,
  SankeyPage,
  SunburstPage,
  TreemapPage,
  VennBulletPage,
  WaterfallPage,
  ZoomMarqueePage,
} from './pages/MoreCharts';
import { GeneratedApiPage, GpuComputePage, MorphPage, SelfTestPage, VectorExportPage } from './pages/Advanced';
import { TrellisPage, ToolbarPage, AxisExtrasPage, PointAnnotationsPage, RadialLinePage, CompositionPage, WorkerRenderingPage, HydrationPage } from './pages/Composition';
import { ShapedBars3DPage, Pie3DPage, Ribbon3DPage, Globe3DPage, Network3DPage, VectorField3DPage, Histogram3DPage, Funnel3DPage, Treemap3DPage, Map3DPage, Trajectory3DPage, ContourSurface3DPage } from './pages/ThreeDMore';
import { WhyGpuPage } from './pages/WhyGpu';
import { MarqueePage } from './pages/Marquee';
import { BenchmarkPage } from './pages/Benchmark';
import { ApiReferencePage, ArchitecturePage, MigrationPage, OverviewPage, QuickstartPage } from './pages/Guides';

export interface RouteDef {
  path: string;
  title: string;
  group: string;
  badge?: string;
  component: ComponentType;
}

export const ROUTES: RouteDef[] = [
  { path: '/', title: 'Overview', group: 'Getting started', component: OverviewPage },
  { path: '/quickstart', title: 'Quickstart', group: 'Getting started', component: QuickstartPage },
  { path: '/architecture', title: 'Architecture', group: 'Getting started', component: ArchitecturePage },
  { path: '/why-gpu', title: 'Why WebGPU + WebGL2', group: 'Getting started', badge: 'New', component: WhyGpuPage },
  { path: '/benchmark', title: 'Benchmark vs SVG / Canvas', group: 'Getting started', badge: 'Live', component: BenchmarkPage },

  { path: '/charts/bars', title: 'Bars', group: 'Charts', component: Bars },
  { path: '/charts/lines', title: 'Lines', group: 'Charts', component: LinesPage },
  { path: '/charts/areas', title: 'Areas', group: 'Charts', component: AreasPage },
  { path: '/charts/scatter', title: 'Scatter & bubble', group: 'Charts', component: ScatterPage },
  { path: '/charts/pie', title: 'Pie & donut', group: 'Charts', component: PiePage },
  { path: '/charts/sparkline-gauge', title: 'Sparklines & gauges', group: 'Charts', component: SparkGaugePage },
  { path: '/charts/combo', title: 'Combo & dual axes', group: 'Charts', component: ComboPage },

  { path: '/charts/heatmap', title: 'Heatmap', group: 'Charts', badge: 'New', component: HeatmapPage },
  { path: '/charts/candlestick', title: 'Candlestick', group: 'Charts', badge: 'New', component: CandlestickPage },
  { path: '/charts/gantt', title: 'Gantt & range bars', group: 'Charts', badge: 'New', component: GanttPage },
  { path: '/charts/waterfall', title: 'Waterfall', group: 'Charts', badge: 'New', component: WaterfallPage },
  { path: '/charts/boxplot', title: 'Boxplot', group: 'Charts', badge: 'New', component: BoxplotPage },
  { path: '/charts/funnel', title: 'Funnel & pyramid', group: 'Hierarchy & flow', component: FunnelPage },
  { path: '/charts/treemap', title: 'Treemap', group: 'Hierarchy & flow', component: TreemapPage },
  { path: '/charts/sunburst', title: 'Sunburst', group: 'Hierarchy & flow', component: SunburstPage },
  { path: '/charts/sankey', title: 'Sankey', group: 'Hierarchy & flow', component: SankeyPage },
  { path: '/charts/chord', title: 'Chord', group: 'Hierarchy & flow', component: ChordPage },
  { path: '/charts/venn-bullet', title: 'Venn & bullet', group: 'Hierarchy & flow', component: VennBulletPage },
  { path: '/charts/radar', title: 'Radar', group: 'Radial & geo', component: RadarPage },
  { path: '/charts/radial-bars', title: 'Radial bars', group: 'Radial & geo', component: RadialBarPage },
  { path: '/charts/radial-lines', title: 'Radial lines', group: 'Radial & geo', badge: 'New', component: RadialLinePage },
  { path: '/charts/map', title: 'Maps', group: 'Radial & geo', badge: 'New', component: MapPage },
  { path: '/3d/bars', title: '3D bars', group: '3D', badge: '3D', component: Bar3DPage },
  { path: '/3d/scatter', title: '3D scatter', group: '3D', badge: '3D', component: Scatter3DPage },
  { path: '/3d/surface', title: '3D surface', group: '3D', badge: '3D', component: Surface3DPage },
  { path: '/3d/shaped-bars', title: '3D shaped & stacked bars', group: '3D', badge: 'New', component: ShapedBars3DPage },
  { path: '/3d/pie', title: '3D pie & donut', group: '3D', badge: 'New', component: Pie3DPage },
  { path: '/3d/ribbons', title: '3D ribbons & ridgelines', group: '3D', badge: 'New', component: Ribbon3DPage },
  { path: '/3d/globe', title: '3D globe', group: '3D', badge: 'New', component: Globe3DPage },
  { path: '/3d/network', title: '3D network graph', group: '3D', badge: 'New', component: Network3DPage },
  { path: '/3d/vector-field', title: '3D vector field', group: '3D', badge: 'New', component: VectorField3DPage },
  { path: '/3d/histogram', title: '3D histogram', group: '3D', badge: 'New', component: Histogram3DPage },
  { path: '/3d/funnel', title: '3D funnel', group: '3D', badge: 'New', component: Funnel3DPage },
  { path: '/3d/treemap', title: '3D treemap', group: '3D', badge: 'New', component: Treemap3DPage },
  { path: '/3d/map', title: '3D prism map', group: '3D', badge: 'New', component: Map3DPage },
  { path: '/3d/trajectory', title: '3D trajectories', group: '3D', badge: 'New', component: Trajectory3DPage },
  { path: '/3d/contours', title: '3D surface contours', group: '3D', badge: 'New', component: ContourSurface3DPage },

  { path: '/features/axes', title: 'Axes', group: 'Features', component: AxesPage },
  { path: '/features/legend-tooltip', title: 'Legend & tooltip', group: 'Features', component: LegendTooltipPage },
  { path: '/features/interaction', title: 'Highlighting & zoom', group: 'Features', component: InteractionPage },
  { path: '/features/zoom-marquee', title: 'Zoom, marquee & crosshair', group: 'Features', badge: 'New', component: ZoomMarqueePage },
  { path: '/features/marquee', title: 'Marquee zoom & selection', group: 'Features', badge: 'New', component: MarqueePage },
  { path: '/features/annotations', title: 'Annotations', group: 'Features', badge: 'New', component: AnnotationsPage },
  { path: '/features/point-annotations', title: 'Point annotations', group: 'Features', badge: 'New', component: PointAnnotationsPage },
  { path: '/features/axis-extras', title: 'Grouped axes & thumbnails', group: 'Features', badge: 'New', component: AxisExtrasPage },
  { path: '/features/small-multiples', title: 'Small multiples', group: 'Features', badge: 'New', component: TrellisPage },
  { path: '/features/toolbar', title: 'Toolbar & data export', group: 'Features', badge: 'New', component: ToolbarPage },
  { path: '/features/composition', title: 'Hooks & slots', group: 'Features', badge: 'New', component: CompositionPage },
  { path: '/features/morph', title: 'Chart-type morphing', group: 'Features', badge: 'GPU', component: MorphPage },
  { path: '/features/svg-export', title: 'SVG export & SSR', group: 'Features', badge: 'New', component: VectorExportPage },
  { path: '/features/gpu-compute', title: 'GPU compute & workers', group: 'Features', badge: 'GPU', component: GpuComputePage },
  { path: '/features/worker-rendering', title: 'Worker rendering', group: 'Features', badge: 'New', component: WorkerRenderingPage },
  { path: '/features/hydration', title: 'SSR & hydration', group: 'Features', badge: 'New', component: HydrationPage },
  { path: '/features/animation', title: 'Animation', group: 'Features', badge: 'GPU', component: AnimationPage },
  { path: '/features/styling', title: 'Styling & theming', group: 'Features', component: StylingPage },
  { path: '/features/localization', title: 'Formatting & locales', group: 'Features', component: LocalizationPage },
  { path: '/features/accessibility', title: 'Accessibility', group: 'Features', component: AccessibilityPage },
  { path: '/features/export', title: 'Export', group: 'Features', component: ExportPage },
  { path: '/features/performance', title: 'Performance', group: 'Features', badge: 'New', component: PerformancePage },

  { path: '/api/children', title: 'Children API', group: 'APIs', component: ChildrenApiPage },
  { path: '/api/reference', title: 'API reference', group: 'APIs', component: ApiReferencePage },
  { path: '/api/generated', title: 'Generated API', group: 'APIs', badge: 'New', component: GeneratedApiPage },
  { path: '/dev/self-test', title: 'Rendering self-test', group: 'APIs', component: SelfTestPage },
  { path: '/migration', title: 'Migration guide', group: 'APIs', component: MigrationPage },
];
