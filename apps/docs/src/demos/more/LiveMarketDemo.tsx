import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

/*
 * A simulated market feed (random walk with mean reversion and volatility
 * bursts). Prices are NOT real quotes. Each tick updates the forming candle;
 * a new candle opens every `interval` seconds and the window slides.
 */

interface Candle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
interface Trade {
  id: number;
  time: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
}

const SYMBOL = 'ADBE';
const TICK_MS = 250;
const WINDOW = 70;
const START = 482.3;

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Feed {
  price = START;
  vol = 0.0009;
  private r = mulberry(2026);
  gauss() {
    return Math.sqrt(-2 * Math.log(this.r() || 1e-9)) * Math.cos(2 * Math.PI * this.r());
  }
  next(): { price: number; size: number } {
    // Volatility clusters: occasional bursts that decay.
    if (this.r() < 0.01) this.vol = 0.003;
    this.vol = 0.0009 + (this.vol - 0.0009) * 0.97;
    const pull = (START - this.price) * 0.0008;
    this.price = Math.max(1, this.price * (1 + this.vol * this.gauss()) + pull);
    return { price: Math.round(this.price * 100) / 100, size: Math.round(20 + this.r() * 480) };
  }
}

function history(feed: Feed, interval: number, now: number): Candle[] {
  const ticksPer = Math.round((interval * 1000) / TICK_MS);
  const out: Candle[] = [];
  for (let c = WINDOW; c > 0; c--) {
    const t = Math.floor(now / (interval * 1000)) * interval * 1000 - c * interval * 1000;
    const first = feed.next();
    const k: Candle = { t, open: first.price, high: first.price, low: first.price, close: first.price, volume: first.size };
    for (let i = 1; i < ticksPer; i++) {
      const { price, size } = feed.next();
      k.high = Math.max(k.high, price);
      k.low = Math.min(k.low, price);
      k.close = price;
      k.volume += size;
    }
    out.push(k);
  }
  return out;
}

const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeFmt = (v: unknown) => new Date(Number(v)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export default function LiveMarketDemo() {
  const scheme = useDemoScheme();
  const dark = scheme === 'dark';
  const [interval, setIntervalSec] = useState(2);
  const [style, setStyle] = useState<'candle' | 'ohlc'>('candle');
  const [paused, setPaused] = useState(false);
  const feed = useRef(new Feed());
  const [candles, setCandles] = useState<Candle[]>(() => history(feed.current, 2, Date.now()));
  const [trades, setTrades] = useState<Trade[]>([]);
  const sessionOpen = useRef(candles[0].open);
  const tradeId = useRef(0);
  const latest = useRef(candles);
  latest.current = candles;

  // Rebuild history when the candle interval changes (not on mount: the initial state already has it).
  const builtFor = useRef(2);
  useEffect(() => {
    if (builtFor.current === interval) return;
    builtFor.current = interval;
    const h = history(feed.current, interval, Date.now());
    sessionOpen.current = h[0].open;
    setCandles(h);
  }, [interval]);

  useEffect(() => {
    if (paused) return;
    // Continue the walk from the price on screen (state initializers can run twice in development).
    feed.current.price = latest.current[latest.current.length - 1].close;
    const id = setInterval(() => {
      const now = Date.now();
      const { price, size } = feed.current.next();
      const bucket = Math.floor(now / (interval * 1000)) * interval * 1000;
      setCandles((cs) => {
        const last = cs[cs.length - 1];
        if (last && last.t === bucket) {
          // Update the forming candle.
          const next = { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price, volume: last.volume + size };
          return [...cs.slice(0, -1), next];
        }
        // Open a new candle at the previous close and slide the window.
        const open = last?.close ?? price;
        return [...cs, { t: bucket, open, high: Math.max(open, price), low: Math.min(open, price), close: price, volume: size }].slice(-WINDOW);
      });
      setTrades((ts) => [{ id: ++tradeId.current, time: now, price, size, side: (price >= (ts[0]?.price ?? price) ? 'buy' : 'sell') as Trade['side'] }, ...ts].slice(0, 14));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused, interval]);

  const last = candles[candles.length - 1];
  const change = last.close - sessionOpen.current;
  const pct = (change / sessionOpen.current) * 100;
  const up = change >= 0;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const vol = candles.reduce((a, c) => a + c.volume, 0);

  // A simple synthetic order book around the last price.
  const book = useMemo(() => {
    const r = mulberry(Math.round(last.close * 100));
    const level = (side: 1 | -1, i: number) => ({ price: last.close + side * (0.02 + i * 0.03), size: Math.round(100 + r() * 900 * (1 + i * 0.25)) });
    const asks = Array.from({ length: 8 }, (_, i) => level(1, i)).reverse();
    const bids = Array.from({ length: 8 }, (_, i) => level(-1, i));
    const max = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size));
    return { asks, bids, max };
  }, [last.close]);

  const green = '#22a884';
  const red = '#d9475b';
  const panel: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' };

  return (
    <div style={{ fontVariantNumeric: 'tabular-nums' }}>
      <style>{`@keyframes rgl-live{0%{box-shadow:0 0 0 0 rgba(217,71,91,.6)}70%{box-shadow:0 0 0 8px rgba(217,71,91,0)}100%{box-shadow:0 0 0 0 rgba(217,71,91,0)}}`}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>{SYMBOL}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: up ? green : red }}>{fmt(last.close)}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: up ? green : red }}>
          {up ? '▲' : '▼'} {fmt(Math.abs(change))} ({up ? '+' : '−'}
          {Math.abs(pct).toFixed(2)}%)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: paused ? 'var(--muted)' : red }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: paused ? 'var(--muted)' : red, animation: paused ? 'none' : 'rgl-live 1.4s infinite' }} />
          {paused ? 'PAUSED' : 'LIVE'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Simulated feed · not real market data</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {[2, 5, 10].map((s) => (
          <button key={s} className="btn" data-primary={interval === s} onClick={() => setIntervalSec(s)}>
            {s}s
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
        {(['candle', 'ohlc'] as const).map((s) => (
          <button key={s} className="btn" data-primary={style === s} onClick={() => setStyle(s)}>
            {s === 'candle' ? 'Candles' : 'OHLC bars'}
          </button>
        ))}
        <button className="btn" onClick={() => setPaused((p) => !p)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <span style={{ fontSize: 12, marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <span style={{ color: '#f2b705', fontWeight: 600 }}>━ MA 9</span>
          <span style={{ color: '#5ab0ff', fontWeight: 600 }}>━ MA 21</span>
          <span style={{ color: 'var(--muted)' }}>
            H {fmt(hi)} · L {fmt(lo)} · Vol {vol.toLocaleString()}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <CandlestickChart
            height={400}
            colorScheme={scheme}
            animation={{ duration: 220, easing: 'cubicOut', stagger: 0 }}
            xAxis={[{ categoryGapRatio: 0.25, valueFormatter: timeFmt }]}
            yAxis={[{ position: 'right', valueFormatter: (v) => fmt(Number(v)) }]}
            grid={{ horizontal: true }}
            trendlines={[
              { method: 'movingAverage-9', color: '#f2b705', lineType: 'solid', lineWidth: 1.5 },
              { method: 'movingAverage-21', color: '#5ab0ff', lineType: 'solid', lineWidth: 1.5 },
            ]}
            series={[{ data: candles as never, dimension: 't', label: SYMBOL, volume: 'volume', lastPrice: true, style, upColor: green, downColor: red }]}
          />
        </div>
        <div style={{ flex: '0 1 230px', display: 'grid', gap: 10, fontSize: 12, alignContent: 'start' }}>
          <div style={panel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Order book</div>
            {book.asks.map((a, i) => (
              <div key={`a${i}`} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '1px 4px' }}>
                <span style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(a.size / book.max) * 100}%`, background: red, opacity: 0.14, borderRadius: 2 }} />
                <span style={{ color: red, position: 'relative' }}>{fmt(a.price)}</span>
                <span style={{ position: 'relative' }}>{a.size}</span>
              </div>
            ))}
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, padding: '4px 0', color: up ? green : red }}>{fmt(last.close)}</div>
            {book.bids.map((b, i) => (
              <div key={`b${i}`} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '1px 4px' }}>
                <span style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(b.size / book.max) * 100}%`, background: green, opacity: 0.14, borderRadius: 2 }} />
                <span style={{ color: green, position: 'relative' }}>{fmt(b.price)}</span>
                <span style={{ position: 'relative' }}>{b.size}</span>
              </div>
            ))}
          </div>
          <div style={panel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Time &amp; sales</div>
            {trades.map((t) => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '1px 0', color: t.side === 'buy' ? green : red }}>
                <span style={{ color: 'var(--muted)' }}>{timeFmt(t.time)}</span>
                <span>{fmt(t.price)}</span>
                <span style={{ minWidth: 30, textAlign: 'right' }}>{t.size}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
