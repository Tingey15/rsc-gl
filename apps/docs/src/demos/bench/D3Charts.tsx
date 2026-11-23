// Idiomatic D3 charts (selection joins, d3-axis, Delaunay hover) used as a baseline in the benchmark.
import { useEffect, useLayoutEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { Dataset, Scenario } from './scenarios';

export interface D3ChartProps {
  scenario: Scenario;
  data: Dataset;
  renderer: 'svg' | 'canvas';
  height: number;
  colorScheme: 'light' | 'dark';
  /** Called once after the first draw. */
  onReady?: () => void;
}

const M = { top: 12, right: 14, bottom: 26, left: 42 };
const COLOR = '#4f6bed';

export default function D3Chart({ scenario, data, renderer, height, colorScheme, onReady }: D3ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const drawRef = useRef<((d: Dataset) => void) | null>(null);
  const reported = useRef(false);

  // Build the chart once per renderer / scenario, then redraw on data changes.
  useLayoutEffect(() => {
    const el = host.current!;
    el.innerHTML = '';
    const width = Math.max(120, el.clientWidth);
    const w = width - M.left - M.right;
    const h = height - M.top - M.bottom;
    const text = colorScheme === 'dark' ? '#c9c9d1' : '#4b4b55';
    const kind = scenario.kind;
    const dpr = window.devicePixelRatio || 1;

    const svg = d3.select(el).append('svg').attr('class', 'd3-plot').attr('width', width).attr('height', height).style('display', 'block').style('position', 'relative');
    let canvas: HTMLCanvasElement | null = null;
    if (renderer === 'canvas') {
      canvas = d3
        .select(el)
        .insert('canvas', 'svg')
        .attr('class', 'd3-plot')
        .attr('width', width * dpr)
        .attr('height', height * dpr)
        .style('position', 'absolute')
        .style('left', '0')
        .style('top', '0')
        .style('width', `${width}px`)
        .style('height', `${height}px`)
        .node()!;
    }
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);
    const gx = g.append('g').attr('transform', `translate(0,${h})`).attr('color', text);
    const gy = g.append('g').attr('color', text);
    const marks = g.append('g');
    const hover = g.append('g').style('pointer-events', 'none');
    const dot = hover.append('circle').attr('r', 5).attr('fill', 'none').attr('stroke', '#d9475b').attr('stroke-width', 2).style('display', 'none');
    const tip = d3
      .select(el)
      .append('div')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('font', '12px sans-serif')
      .style('padding', '4px 8px')
      .style('border-radius', '6px')
      .style('background', colorScheme === 'dark' ? '#26262b' : '#ffffff')
      .style('color', text)
      .style('border', '1px solid rgba(128,128,128,.35)')
      .style('display', 'none');

    let pick: ((mx: number, my: number) => { x: number; y: number; label: string } | null) | null = null;

    const draw = (d: Dataset) => {
      const n = d.xs.length;
      if (kind === 'bar') {
        const cats = d.categories ?? Array.from({ length: n }, (_, i) => String(i));
        const x = d3.scaleBand<string>().domain(cats).range([0, w]).padding(0.2);
        const y = d3.scaleLinear().domain([0, d3.max(d.ys) ?? 1]).nice().range([h, 0]);
        gx.call(d3.axisBottom(x).tickValues(cats.filter((_, i) => i % Math.max(1, Math.ceil(n / 12)) === 0)));
        gy.call(d3.axisLeft(y).ticks(5));
        if (canvas) {
          const c = canvas.getContext('2d')!;
          c.setTransform(dpr, 0, 0, dpr, M.left * dpr, M.top * dpr);
          c.clearRect(-M.left, -M.top, width, height);
          c.fillStyle = COLOR;
          for (let i = 0; i < n; i++) c.fillRect(x(cats[i])!, y(d.ys[i]), x.bandwidth(), h - y(d.ys[i]));
        } else {
          marks
            .selectAll('rect')
            .data(Array.from(d.ys))
            .join('rect')
            .attr('x', (_, i) => x(cats[i])!)
            .attr('y', (v) => y(v))
            .attr('width', x.bandwidth())
            .attr('height', (v) => h - y(v))
            .attr('fill', COLOR);
        }
        pick = (mx) => {
          const i = Math.floor((mx - x.range()[0]) / x.step());
          if (i < 0 || i >= n) return null;
          return { x: x(cats[i])! + x.bandwidth() / 2, y: y(d.ys[i]), label: `${cats[i]}: ${d.ys[i]}` };
        };
        return;
      }
      const x = d3.scaleLinear().domain(d3.extent(d.xs) as [number, number]).nice().range([0, w]);
      const y = d3.scaleLinear().domain(d3.extent(d.ys) as [number, number]).nice().range([h, 0]);
      gx.call(d3.axisBottom(x).ticks(6));
      gy.call(d3.axisLeft(y).ticks(5));
      if (kind === 'scatter') {
        const r = n > 100_000 ? 1 : 2.5;
        if (canvas) {
          const c = canvas.getContext('2d')!;
          c.setTransform(dpr, 0, 0, dpr, M.left * dpr, M.top * dpr);
          c.clearRect(-M.left, -M.top, width, height);
          c.fillStyle = COLOR;
          c.beginPath();
          for (let i = 0; i < n; i++) {
            const px = x(d.xs[i]);
            const py = y(d.ys[i]);
            c.moveTo(px + r, py);
            c.arc(px, py, r, 0, Math.PI * 2);
          }
          c.fill();
        } else {
          marks
            .selectAll('circle')
            .data(d3.range(n))
            .join('circle')
            .attr('cx', (i) => x(d.xs[i]))
            .attr('cy', (i) => y(d.ys[i]))
            .attr('r', r)
            .attr('fill', COLOR);
        }
        // Nearest point via a Delaunay triangulation (the usual D3 approach).
        const delaunay = d3.Delaunay.from(d3.range(n), (i) => x(d.xs[i]), (i) => y(d.ys[i]));
        pick = (mx, my) => {
          const i = delaunay.find(mx, my);
          return i >= 0 ? { x: x(d.xs[i]), y: y(d.ys[i]), label: `(${d.xs[i].toFixed(1)}, ${d.ys[i].toFixed(1)})` } : null;
        };
        return;
      }
      // Line (also the live and dashboard scenarios).
      const line = d3
        .line<number>()
        .x((i) => x(d.xs[i]))
        .y((i) => y(d.ys[i]));
      if (canvas) {
        const c = canvas.getContext('2d')!;
        c.setTransform(dpr, 0, 0, dpr, M.left * dpr, M.top * dpr);
        c.clearRect(-M.left, -M.top, width, height);
        c.strokeStyle = COLOR;
        c.lineWidth = 1.5;
        c.beginPath();
        line.context(c)(d3.range(n));
        c.stroke();
      } else {
        marks
          .selectAll('path')
          .data([0])
          .join('path')
          .attr('fill', 'none')
          .attr('stroke', COLOR)
          .attr('stroke-width', 1.5)
          .attr('d', line(d3.range(n)));
      }
      const bisect = d3.bisector((i: number) => d.xs[i]).center;
      const idx = d3.range(n);
      pick = (mx) => {
        const i = bisect(idx, x.invert(mx));
        return i >= 0 && i < n ? { x: x(d.xs[i]), y: y(d.ys[i]), label: `${d.xs[i]}: ${d.ys[i].toFixed(2)}` } : null;
      };
    };

    svg.on('pointermove', (event: PointerEvent) => {
      const [mx, my] = d3.pointer(event, g.node());
      const p = pick?.(mx, my);
      if (!p) return;
      dot.style('display', null).attr('cx', p.x).attr('cy', p.y);
      tip
        .style('display', null)
        .style('left', `${p.x + M.left + 10}px`)
        .style('top', `${p.y + M.top - 28}px`)
        .text(p.label);
    });
    svg.on('pointerleave', () => {
      dot.style('display', 'none');
      tip.style('display', 'none');
    });

    drawRef.current = draw;
    draw(data);
    if (!reported.current) {
      reported.current = true;
      onReady?.();
    }
    return () => {
      svg.on('pointermove', null).on('pointerleave', null);
      el.innerHTML = '';
    };
    // Rebuilt only when the structure changes; data changes redraw below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, renderer, height, colorScheme]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    drawRef.current?.(data);
  }, [data]);

  return <div ref={host} className="d3-chart" style={{ position: 'relative', width: '100%', height }} />;
}
