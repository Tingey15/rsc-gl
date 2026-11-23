/**
 * Easing functions. The numeric ids are shared with the shader library so the
 * GPU interpolates exactly like the CPU (needed to resume interrupted transitions
 * from the on-screen state).
 */
export type EasingName = 'linear' | 'cubicInOut' | 'cubicOut' | 'backOut' | 'elasticOut' | 'quadOut';

export const EASING_ID: Record<EasingName, number> = {
  linear: 0,
  cubicInOut: 1,
  cubicOut: 2,
  backOut: 3,
  elasticOut: 4,
  quadOut: 5,
};

export function ease(t: number, kind: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (kind) {
    case 1:
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 2:
      return 1 - Math.pow(1 - t, 3);
    case 3: {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case 4: {
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }
    case 5:
      return 1 - (1 - t) * (1 - t);
    default:
      return t;
  }
}

/** Per-instance local progress with stagger. `delay` is the instance's 0..1 position in the stagger order. */
export function localProgress(t: number, delay: number, stagger: number): number {
  const span = 1 - stagger;
  return Math.min(1, Math.max(0, (t - delay * stagger) / Math.max(span, 1e-5)));
}

export interface TransitionOptions {
  /** Duration in milliseconds. 0 disables animation. */
  duration: number;
  easing: EasingName;
  /**
   * Fraction (0..1) of the duration used to stagger instances; 0 animates all
   * instances together.
   */
  stagger: number;
}

export const DEFAULT_TRANSITION: TransitionOptions = { duration: 600, easing: 'cubicInOut', stagger: 0 };

export function resolveTransition(input: Partial<TransitionOptions> | boolean | undefined, fallback = DEFAULT_TRANSITION): TransitionOptions {
  if (input === false) return { ...fallback, duration: 0 };
  if (input === true || input === undefined) return fallback;
  return { ...fallback, ...input };
}

let motionPolicy: 'respect' | 'ignore' = 'respect';

/**
 * Charts follow the operating system's reduced-motion preference by default.
 * Apps that offer their own motion setting can override it.
 */
export function setReducedMotionPolicy(policy: 'respect' | 'ignore'): void {
  motionPolicy = policy;
}

/** True when the OS asks for reduced motion (regardless of policy). */
export const systemPrefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** True when charts should skip transitions. */
export const prefersReducedMotion = (): boolean => motionPolicy === 'respect' && systemPrefersReducedMotion();
