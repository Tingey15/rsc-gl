import MarqueeZoomDemo from '../demos/marquee/MarqueeZoomDemo';
import MarqueeZoomSrc from '../demos/marquee/MarqueeZoomDemo.tsx?raw';
import MarqueeOverlayDemo from '../demos/marquee/MarqueeOverlayDemo';
import MarqueeOverlaySrc from '../demos/marquee/MarqueeOverlayDemo.tsx?raw';
import MarqueeSelectDemo from '../demos/marquee/MarqueeSelectDemo';
import MarqueeSelectSrc from '../demos/marquee/MarqueeSelectDemo.tsx?raw';
import MarqueeModesDemo from '../demos/marquee/MarqueeModesDemo';
import MarqueeModesSrc from '../demos/marquee/MarqueeModesDemo.tsx?raw';
import { chartPage } from './MoreCharts';

export const MarqueePage = chartPage(
  'Marquee zoom & selection',
  'Click and drag to select a region of a chart. By default the chart zooms into the selection; it can also keep the selection and report the data inside it. Works on bar, line, area and scatter charts, on category, time and numeric axes.',
  [
    { title: 'MarqueeZoomDemo.tsx', code: MarqueeZoomSrc, C: MarqueeZoomDemo, text: 'Add the marquee prop to zoom. Drag across categories or dates; double-click, press Esc or use “Reset zoom” to return. Zooming animates on the GPU. When an axis also sets zoom: true, the wheel zooms and Shift+drag pans.' },
    { title: 'MarqueeOverlayDemo.tsx', code: MarqueeOverlaySrc, C: MarqueeOverlayDemo, text: 'Custom overlay: useMarquee() returns the start and current positions and the selection; draw anything with ChartsSvgLayer. This one shows the values at both ends, the difference and the % change.' },
    { title: 'MarqueeSelectDemo.tsx', code: MarqueeSelectSrc, C: MarqueeSelectDemo, text: 'Data selection: with action “select” the rectangle stays and onMarqueeEnd reports the points inside it.' },
    { title: 'MarqueeModesDemo.tsx', code: MarqueeModesSrc, C: MarqueeModesDemo, text: 'Modes: rectangles zoom both axes of a scatter chart; horizontal bars select along the category axis.' },
  ],
  [
    { name: 'marquee', type: 'boolean | MarqueeOptions', description: 'Enables the marquee (loaded on demand). true = zoom into the selection.' },
    { name: 'action', type: "'zoom' | 'select' | 'none'", default: "'zoom'", description: 'Zoom into the selection, keep it as a selection, or only report it.' },
    { name: 'mode', type: "'x' | 'y' | 'xy'", default: 'auto', description: "'xy' for scatter, 'y' for horizontal bars, otherwise 'x'." },
    { name: 'modifier', type: "'none' | 'shift'", default: "'none'", description: 'Key required to start a selection. With none, Shift+drag pans a zoomed chart.' },
    { name: 'preventTooltip / preventHighlight', type: 'boolean', default: 'true', description: 'Hide tooltips and hover highlight while dragging.' },
    { name: 'overlay / labels', type: 'boolean', default: 'true', description: 'Selection rectangle and the value badges at its edges.' },
    { name: 'persist', type: 'boolean', default: 'true', description: 'Keep the selection after release (select action). Click empty space or press Esc to clear.' },
    { name: 'resetButton', type: 'boolean', default: 'true', description: '“Reset zoom” chip while zoomed by the marquee.' },
    { name: 'minSize', type: 'number', default: '6', description: 'Smallest drag (px) that counts; shorter drags are clicks.' },
    { name: 'onMarquee(state)', type: '(MarqueeState | null) => void', description: 'Every change: start / current pixels, active flag and the selection.' },
    { name: 'onMarqueeEnd(selection)', type: '(MarqueeSelection | null) => void', description: 'After a drag: x / y ranges (values or categories) and the items inside.' },
    { name: 'useMarquee()', type: 'MarqueeState | null', description: 'Hook for custom overlays inside a chart (use with ChartsSvgLayer).' },
  ],
);
