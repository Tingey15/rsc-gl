import { describe, expect, it } from 'vitest';
import { optionsEqual } from '../equal';

describe('optionsEqual', () => {
  it('compares structurally and ignores callback identity', () => {
    expect(optionsEqual({ a: [1, 2], b: { c: 'x' }, f: () => 1 }, { a: [1, 2], b: { c: 'x' }, f: () => 2 })).toBe(true);
    expect(optionsEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    expect(optionsEqual({ d: new Date(5) }, { d: new Date(5) })).toBe(true);
  });

  it('compares large arrays and typed arrays by reference', () => {
    const big = Array.from({ length: 5000 }, (_, i) => i);
    expect(optionsEqual({ big }, { big })).toBe(true);
    expect(optionsEqual({ big }, { big: [...big] })).toBe(false);
    const t = new Float32Array(4);
    expect(optionsEqual({ t }, { t })).toBe(true);
    expect(optionsEqual({ t }, { t: new Float32Array(4) })).toBe(false);
  });
});
