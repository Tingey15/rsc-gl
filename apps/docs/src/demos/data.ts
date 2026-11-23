/** Deterministic pseudo-random generator so demos look the same on every load. */
export function rng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const browserData = [
  { browser: 'Aurora', os: 'Desktop', downloads: 27000 },
  { browser: 'Aurora', os: 'Laptop', downloads: 15000 },
  { browser: 'Aurora', os: 'Mobile', downloads: 7000 },
  { browser: 'Comet', os: 'Desktop', downloads: 8000 },
  { browser: 'Comet', os: 'Laptop', downloads: 4000 },
  { browser: 'Comet', os: 'Mobile', downloads: 3500 },
  { browser: 'Nimbus', os: 'Desktop', downloads: 1200 },
  { browser: 'Nimbus', os: 'Laptop', downloads: 21000 },
  { browser: 'Nimbus', os: 'Mobile', downloads: 1500 },
  { browser: 'Vertex', os: 'Desktop', downloads: 12500 },
  { browser: 'Vertex', os: 'Laptop', downloads: 2100 },
  { browser: 'Vertex', os: 'Mobile', downloads: 900 },
  { browser: 'Orbit', os: 'Desktop', downloads: 3000 },
  { browser: 'Orbit', os: 'Laptop', downloads: 900 },
  { browser: 'Orbit', os: 'Mobile', downloads: 1100 },
];

export const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const revenue = {
  months,
  product: [42, 48, 51, 60, 58, 66, 72, 70, 78, 84, 91, 104],
  services: [28, 30, 29, 35, 41, 39, 44, 47, 46, 52, 55, 61],
  licensing: [12, 14, 13, 15, 18, 17, 19, 22, 21, 24, 26, 29],
};

/** Long-format daily time series for several series. */
export function timeSeries(series = ['Visits', 'Sign-ups', 'Purchases'], days = 60, seed = 7) {
  const r = rng(seed);
  const start = Date.UTC(2026, 0, 1);
  const rows: { datetime: number; series: string; value: number }[] = [];
  series.forEach((name, si) => {
    let v = 400 / (si + 1);
    for (let d = 0; d < days; d++) {
      v = Math.max(5, v + (r() - 0.46) * 40 / (si + 1) + Math.sin(d / 6) * 6);
      rows.push({ datetime: start + d * 864e5, series: name, value: Math.round(v) });
    }
  });
  return rows;
}

/** Clustered scatter data. */
export function clusters(n = 300, k = 3, seed = 3) {
  const r = rng(seed);
  const centers = Array.from({ length: k }, () => ({ x: 20 + r() * 60, y: 20 + r() * 60 }));
  return Array.from({ length: n }, (_, i) => {
    const c = centers[i % k];
    const g = () => (r() + r() + r() - 1.5) * 14;
    return { id: i, x: c.x + g(), y: c.y + g(), size: 1 + r() * 9, group: `Cluster ${String.fromCharCode(65 + (i % k))}` };
  });
}

/** Interleaved typed-array positions for the large-data demo. */
export function bigPositions(n: number, seed = 11) {
  const r = rng(seed);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.pow(r(), 0.5) * 50;
    const arm = Math.sin(a * 3 + rad / 8) * 12;
    out[i * 2] = Math.cos(a) * (rad + arm);
    out[i * 2 + 1] = Math.sin(a) * (rad + arm);
  }
  return out;
}

export const marketShare = [
  { id: 'search', label: 'Search', value: 38 },
  { id: 'social', label: 'Social', value: 24 },
  { id: 'direct', label: 'Direct', value: 18 },
  { id: 'email', label: 'Email', value: 12 },
  { id: 'referral', label: 'Referral', value: 8 },
];
