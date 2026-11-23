/**
 * Min / max over any number of values. `Math.min(...values)` passes every
 * value as a function argument and throws past the engine's argument limit
 * (around 100k values); these loop instead. Results match Math.min / Math.max,
 * including Infinity for empty input and NaN propagation.
 */
export function minOf(values: Iterable<number> | ArrayLike<number>): number {
  let m = Infinity;
  const list = values as ArrayLike<number>;
  if (typeof list.length === 'number') {
    for (let i = 0; i < list.length; i++) {
      const v = +list[i];
      if (v !== v) return NaN;
      if (v < m) m = v;
    }
    return m;
  }
  for (const raw of values as Iterable<number>) {
    const v = +raw;
    if (v !== v) return NaN;
    if (v < m) m = v;
  }
  return m;
}

export function maxOf(values: Iterable<number> | ArrayLike<number>): number {
  let m = -Infinity;
  const list = values as ArrayLike<number>;
  if (typeof list.length === 'number') {
    for (let i = 0; i < list.length; i++) {
      const v = +list[i];
      if (v !== v) return NaN;
      if (v > m) m = v;
    }
    return m;
  }
  for (const raw of values as Iterable<number>) {
    const v = +raw;
    if (v !== v) return NaN;
    if (v > m) m = v;
  }
  return m;
}

/** Appends `items` to `target` without spreading them as arguments. */
export function appendAll<T>(target: T[], items: ArrayLike<T>): T[] {
  for (let i = 0; i < items.length; i++) target.push(items[i]);
  return target;
}
