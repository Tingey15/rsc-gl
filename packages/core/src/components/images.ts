/**
 * Tiny image cache for canvas-drawn images (axis thumbnails, icons). Charts
 * subscribe so they re-render when an image finishes loading.
 */
const cache = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

/** Returns the decoded image, or null while it is loading (or without a DOM). */
export function loadImage(url: string): HTMLImageElement | null {
  let img = cache.get(url);
  if (!img) {
    if (typeof Image === 'undefined') return null;
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => listeners.forEach((cb) => cb());
    img.src = url;
    cache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Calls `cb` whenever any cached image finishes loading. Returns an unsubscribe. */
export function onImageLoad(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
