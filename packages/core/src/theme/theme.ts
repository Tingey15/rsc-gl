import type { ColorScheme } from './colors';

/** Visual constants for non-data chrome (axes, grid, text, tooltips). */
export interface ChartTheme {
  scheme: ColorScheme;
  fontFamily: string;
  fontSize: number;
  titleFontSize: number;
  textColor: string;
  mutedTextColor: string;
  axisColor: string;
  gridColor: string;
  backgroundColor: string;
  tooltipBackground: string;
  tooltipText: string;
  tooltipBorder: string;
  focusRing: string;
  /** Opacity applied to non-highlighted marks while something is highlighted. */
  fadeOpacity: number;
}

const FONT = 'Inter, system-ui, sans-serif';

export const LIGHT_THEME: ChartTheme = {
  scheme: 'light',
  fontFamily: FONT,
  fontSize: 12,
  titleFontSize: 16,
  textColor: '#2b2b2e',
  mutedTextColor: '#6b6b73',
  axisColor: '#9a9aa3',
  gridColor: 'rgba(0, 0, 0, 0.09)',
  backgroundColor: 'transparent',
  tooltipBackground: 'rgba(255, 255, 255, 0.97)',
  tooltipText: '#1d1d1f',
  tooltipBorder: 'rgba(0, 0, 0, 0.12)',
  focusRing: '#2f6fed',
  fadeOpacity: 0.2,
};

export const DARK_THEME: ChartTheme = {
  scheme: 'dark',
  fontFamily: FONT,
  fontSize: 12,
  titleFontSize: 16,
  textColor: '#e6e6ea',
  mutedTextColor: '#a0a0aa',
  axisColor: '#6c6c76',
  gridColor: 'rgba(255, 255, 255, 0.1)',
  backgroundColor: 'transparent',
  tooltipBackground: 'rgba(32, 32, 36, 0.97)',
  tooltipText: '#f2f2f5',
  tooltipBorder: 'rgba(255, 255, 255, 0.14)',
  focusRing: '#6d9cff',
  fadeOpacity: 0.2,
};

export function getTheme(scheme: ColorScheme, overrides?: Partial<ChartTheme>): ChartTheme {
  return { ...(scheme === 'dark' ? DARK_THEME : LIGHT_THEME), ...overrides };
}

/** Named stroke dash patterns (px). */
export const LINE_TYPES: Record<string, number[]> = {
  solid: [],
  dashed: [7, 4],
  dotted: [2, 3],
  dotDash: [2, 3, 7, 4],
  shortDash: [3, 4],
  longDash: [11, 4],
  twoDash: [5, 2, 11, 2],
};

export type LineType = keyof typeof LINE_TYPES | number[];

export const resolveLineType = (t: LineType | undefined): number[] => (Array.isArray(t) ? t : LINE_TYPES[t ?? 'solid'] ?? []);

/** Named stroke widths (px). */
export const LINE_WIDTHS: Record<string, number> = { XS: 1, S: 1.5, M: 2, L: 3, XL: 4 };
export type LineWidth = keyof typeof LINE_WIDTHS | number;
export const resolveLineWidth = (w: LineWidth | undefined, fallback = 2): number =>
  typeof w === 'number' ? w : w ? LINE_WIDTHS[w] ?? fallback : fallback;

/** Named symbol sizes (px diameter). */
export const SYMBOL_SIZES: Record<string, number> = { XS: 6, S: 8, M: 10, L: 12, XL: 16 };
export type SymbolSize = keyof typeof SYMBOL_SIZES | number;
export const resolveSymbolSize = (s: SymbolSize | undefined, fallback = 10): number =>
  typeof s === 'number' ? s : s ? SYMBOL_SIZES[s] ?? fallback : fallback;

/** Responsive size tier from the chart's shorter side. */
export function sizeTier(width: number): 'S' | 'M' | 'L' {
  return width < 400 ? 'S' : width < 800 ? 'M' : 'L';
}
