import { color as d3color, hsl } from 'd3-color';
import {
  interpolateViridis,
  interpolateMagma,
  interpolateBlues,
  interpolateGreens,
  interpolateRdBu,
  interpolatePuOr,
  interpolateRdYlBu,
  interpolateInferno,
  interpolateCividis,
} from 'd3-scale-chromatic';

export type RGBA = [number, number, number, number];
export type ColorScheme = 'light' | 'dark';

/** Default categorical palette (16 hues, ordered for maximal adjacent contrast). */
export const CATEGORICAL_16 = [
  '#3b6fe0', '#e0663b', '#22a884', '#c2408f', '#8a63d2', '#d9a400', '#2fa3c7', '#d9475b',
  '#6e9e2e', '#9c6b3e', '#5b5fc7', '#e07fb0', '#4c9c9a', '#b5762c', '#7f8c99', '#a33a3a',
];

export const PALETTES: Record<string, string[]> = {
  categorical6: CATEGORICAL_16.slice(0, 6),
  categorical12: CATEGORICAL_16.slice(0, 12),
  categorical16: CATEGORICAL_16,
  ocean: ['#0b3c5d', '#1d6996', '#38a6a5', '#0f8554', '#73af48', '#edad08', '#e17c05', '#cc503e'],
  ember: ['#7a0403', '#c42503', '#f07e1a', '#fbb61a', '#fde725', '#a8db34', '#35b779', '#2a788e'],
  pastel: ['#8fb8ff', '#ffb38a', '#8fe0c5', '#f5a3d0', '#c4b0f5', '#ffe08a', '#9ad7ec', '#f5a3ad'],
  monoBlue: ['#0d2b6b', '#1b4597', '#2f62c4', '#4f80e0', '#7ea2ec', '#adc5f4', '#d6e2fa'],
};

const SEQUENTIAL: Record<string, (t: number) => string> = {
  viridis: interpolateViridis,
  magma: interpolateMagma,
  inferno: interpolateInferno,
  cividis: interpolateCividis,
  blues: interpolateBlues,
  greens: interpolateGreens,
  redBlue: (t) => interpolateRdBu(1 - t),
  purpleOrange: interpolatePuOr,
  redYellowBlue: (t) => interpolateRdYlBu(1 - t),
};

export function getInterpolator(name: string): ((t: number) => string) | undefined {
  return SEQUENTIAL[name];
}

/** Samples `n` colors from a sequential / diverging interpolator, e.g. `sequentialViridis9`. */
function namedScheme(name: string): string[] | undefined {
  if (PALETTES[name]) return PALETTES[name];
  const m = /^(sequential|divergent|diverging)([A-Z][A-Za-z]*?)(\d+)$/.exec(name);
  if (!m) return undefined;
  const key = m[2][0].toLowerCase() + m[2].slice(1);
  const interp = SEQUENTIAL[key];
  if (!interp) return undefined;
  const n = Number(m[3]);
  return Array.from({ length: n }, (_, i) => interp(n === 1 ? 0.5 : i / (n - 1)));
}

const HUES: Record<string, number> = {
  red: 0, orange: 25, yellow: 50, chartreuse: 80, celery: 100, green: 135, seafoam: 165, turquoise: 175,
  cyan: 190, blue: 215, indigo: 235, purple: 265, fuchsia: 290, magenta: 315, pink: 335, brown: 30,
  cinnamon: 20, silver: 210,
};

/**
 * Resolves design tokens and CSS colors to RGBA (0..1, straight alpha).
 *
 * Tokens:
 *   gray-50 … gray-1000          neutral ramp (inverts in dark mode)
 *   <hue>-100 … <hue>-1600       hue ramps (e.g. blue-900)
 *   categorical-100 … -1600      default categorical palette entries
 *   static-*                     same as the token but never inverted
 *   transparent / any CSS color
 */
export function resolveColor(input: string | undefined | null, scheme: ColorScheme = 'light'): RGBA {
  if (!input) return [0, 0, 0, 0];
  const raw = input.trim();
  if (raw === 'transparent') return [0, 0, 0, 0];
  let token = raw;
  let isStatic = false;
  if (token.startsWith('static-')) {
    isStatic = true;
    token = token.slice(7);
  }
  const m = /^([a-z]+)-(\d+)$/.exec(token);
  if (m) {
    const [, family, levelStr] = m;
    const level = Number(levelStr);
    if (family === 'gray') {
      const t = Math.min(1, Math.max(0, level / 1000));
      const l = scheme === 'dark' && !isStatic ? 0.08 + t * 0.86 : 1 - t * 0.9;
      return [l, l, l, 1];
    }
    if (family === 'categorical') {
      const idx = Math.max(0, Math.round(level / 100) - 1) % CATEGORICAL_16.length;
      return adjustForScheme(parseCss(CATEGORICAL_16[idx]), scheme);
    }
    const hue = HUES[family];
    if (hue !== undefined) {
      const t = Math.min(1, Math.max(0, level / 1600));
      const light = scheme === 'dark' && !isStatic ? 0.15 + t * 0.7 : 0.92 - t * 0.75;
      const sat = family === 'silver' ? 0.12 : family === 'brown' || family === 'cinnamon' ? 0.45 : 0.75;
      const c = hsl(hue, sat, light).rgb();
      return [c.r / 255, c.g / 255, c.b / 255, 1];
    }
  }
  return parseCss(raw);
}

export function parseCss(input: string): RGBA {
  const c = d3color(input);
  if (!c) return [0, 0, 0, 1];
  const rgb = c.rgb();
  return [rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.opacity];
}

function adjustForScheme(c: RGBA, scheme: ColorScheme): RGBA {
  if (scheme === 'light') return c;
  // Lift categorical colors slightly in dark mode for contrast against dark surfaces.
  return [c[0] + (1 - c[0]) * 0.12, c[1] + (1 - c[1]) * 0.12, c[2] + (1 - c[2]) * 0.12, c[3]];
}

export function rgbaToCss(c: RGBA): string {
  return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3]})`;
}

export function withAlpha(c: RGBA, a: number): RGBA {
  return [c[0], c[1], c[2], c[3] * a];
}

/** Resolves a palette input (named scheme, array, or function of scheme) to CSS strings. */
export function resolvePalette(input: string | string[] | ((scheme: ColorScheme) => string[]) | undefined, scheme: ColorScheme): string[] {
  if (!input) return CATEGORICAL_16;
  if (typeof input === 'function') return input(scheme);
  if (typeof input === 'string') return namedScheme(input) ?? CATEGORICAL_16;
  return input;
}

/** Relative luminance, used for auto-contrast label colors. */
export function luminance(c: RGBA): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function contrastText(bg: RGBA): string {
  return luminance(bg) > 0.4 ? '#1d1d1f' : '#ffffff';
}
