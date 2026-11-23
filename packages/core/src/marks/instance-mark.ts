import type { GpuBuffer, GpuDevice, GpuPipeline, GpuUniforms, PipelineDescriptor, RenderPass } from '@rsc-gl/gpu';
import { EASING_ID, ease, localProgress, type TransitionOptions } from '../animation/easing';

/** A single instance handed to a mark. `value` holds plain numeric attributes. */
export interface MarkItem<T> {
  /** Stable identity used to match items across updates (enter / update / exit). */
  key: string;
  seriesIndex: number;
  dataIndex: number;
  value: T;
  /** State an entering item animates from. Defaults to `value` (no motion). */
  enter?: T;
  /** State an exiting item animates to. Defaults to the current state with alpha 0. */
  exit?: T;
  /**
   * Position (0..1) in the stagger order. Defaults to the item's index.
   * Items that must move together (e.g. segments of one stack) share a value.
   */
  delay?: number;
}

export interface FrameState {
  /** Current time from performance.now(). */
  now: number;
  /** CSS pixel size of the surface. */
  width: number;
  height: number;
  dpr: number;
  /** (series, index, fadeAlpha, active) */
  highlight: [number, number, number, number];
}

export interface AttributeSpec<T> {
  /** Number of 4-byte slots one instance occupies in the GPU buffer. */
  floatsPerInstance: number;
  /** Writes `from`, `to`, key, delay into `f32`/`u32` (views on the same buffer) at `offset`. */
  write(f32: Float32Array, u32: Uint32Array, offset: number, from: T, to: T, item: MarkItem<T>, delay: number): void;
  /** CPU interpolation, used to resume an interrupted transition from the on-screen state. */
  lerp(a: T, b: T, t: number): T;
  /** Returns a copy of `v` faded out (used as the default exit state). */
  faded(v: T): T;
}

interface LiveItem<T> {
  item: MarkItem<T>;
  from: T;
  to: T;
  delay: number;
  exiting: boolean;
}

/**
 * Generic instanced mark with keyed enter/update/exit transitions.
 *
 * Each instance stores both its start and end state on the GPU and the vertex
 * shader interpolates them using a single `anim.x` uniform, so a running
 * transition costs one uniform write per frame and no buffer uploads.
 */
export abstract class InstanceMark<T> {
  protected pipeline: GpuPipeline | null = null;
  private pickPipeline: GpuPipeline | null = null;
  private pickUniforms: GpuUniforms | null = null;
  protected uniforms: GpuUniforms | null = null;
  protected instanceBuffer: GpuBuffer | null = null;
  protected quadBuffer: GpuBuffer | null = null;
  private live: LiveItem<T>[] = [];
  private byKey = new Map<string, LiveItem<T>>();
  private start = 0;
  private transition: TransitionOptions = { duration: 0, easing: 'linear', stagger: 0 };
  private dirtyBuffer = true;
  private cpu = new ArrayBuffer(0);
  /** >= 0 when the mark was filled through {@link updateDirect} (no keyed transitions). */
  private directCount = -1;
  opacity = 1;

  protected abstract attributes: AttributeSpec<T>;
  protected abstract pipelineDescriptor(): PipelineDescriptor;
  /** Writes mark-specific uniforms. */
  protected abstract setUniforms(uniforms: GpuUniforms, frame: FrameState): void;
  /** Vertices per instance (quad = 4 as triangle-strip). */
  protected vertexCount = 4;

  /** Per-vertex geometry bound to the 'quad' slot (override for 3D meshes). */
  protected geometry(): Float32Array {
    return new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  }

  constructor(protected device: GpuDevice) {}

  get count(): number {
    return this.directCount >= 0 ? this.directCount : this.live.length;
  }

  /**
   * Fast path for very large datasets: writes instances straight into the GPU
   * buffer without creating per-item objects or keyed transitions. `write`
   * receives views and the float offset for instance `i`; it must write both
   * the from and to slots (typically with identical values).
   */
  updateDirect(
    count: number,
    write: (f32: Float32Array, u32: Uint32Array, offset: number, i: number) => void,
    transition: TransitionOptions = { duration: 0, easing: 'linear', stagger: 0 },
    now = 0,
  ): void {
    this.ensureResources();
    const stride = this.attributes.floatsPerInstance;
    const bytes = count * stride * 4;
    if (this.cpu.byteLength < bytes) this.cpu = new ArrayBuffer(Math.ceil(bytes * 1.1));
    const f32 = new Float32Array(this.cpu, 0, count * stride);
    const u32 = new Uint32Array(this.cpu, 0, count * stride);
    for (let i = 0; i < count; i++) write(f32, u32, i * stride, i);
    if (bytes > 0) this.instanceBuffer!.write(f32);
    this.live = [];
    this.byKey.clear();
    this.directCount = count;
    this.dirtyBuffer = false;
    // The writer stores both start and end states, so the GPU can still animate.
    this.transition = transition;
    this.start = now;
  }

  /** Items as currently targeted (excludes exiting items). */
  get items(): MarkItem<T>[] {
    return this.live.filter((l) => !l.exiting).map((l) => l.item);
  }

  /** Returns the current on-screen state of an item (for hit testing during animation). */
  currentState(key: string, now: number): T | undefined {
    const l = this.byKey.get(key);
    if (!l) return undefined;
    return this.attributes.lerp(l.from, l.to, this.progress(now, l.delay));
  }

  private progress(now: number, delay: number): number {
    const d = this.transition.duration;
    if (d <= 0) return 1;
    const t = Math.min(1, Math.max(0, (now - this.start) / d));
    return ease(localProgress(t, delay, this.transition.stagger), EASING_ID[this.transition.easing]);
  }

  isAnimating(now: number): boolean {
    return this.transition.duration > 0 && now - this.start < this.transition.duration;
  }

  /** Current on-screen state of every item (vector export). */
  snapshot(now: number): { item: MarkItem<T>; state: T; exiting: boolean }[] {
    return this.live.map((l) => ({ item: l.item, state: this.attributes.lerp(l.from, l.to, this.progress(now, l.delay)), exiting: l.exiting }));
  }

  /**
   * Sets the target items. Existing keys animate from their on-screen state,
   * new keys from `enter`, and removed keys to `exit`.
   */
  update(items: MarkItem<T>[], transition: TransitionOptions, now: number): void {
    this.directCount = -1;
    const next: LiveItem<T>[] = [];
    const nextByKey = new Map<string, LiveItem<T>>();
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const item = items[i];
      const prev = this.byKey.get(item.key);
      const from = prev ? this.attributes.lerp(prev.from, prev.to, this.progress(now, prev.delay)) : (item.enter ?? item.value);
      const l: LiveItem<T> = { item, from, to: item.value, delay: item.delay ?? (n > 1 ? i / (n - 1) : 0), exiting: false };
      next.push(l);
      nextByKey.set(item.key, l);
    }
    if (transition.duration > 0) {
      for (const prev of this.live) {
        if (nextByKey.has(prev.item.key) || prev.exiting) continue;
        const cur = this.attributes.lerp(prev.from, prev.to, this.progress(now, prev.delay));
        const l: LiveItem<T> = { item: prev.item, from: cur, to: prev.item.exit ?? this.attributes.faded(cur), delay: 0, exiting: true };
        next.push(l);
        nextByKey.set(prev.item.key, l);
      }
    }
    this.live = next;
    this.byKey = nextByKey;
    this.transition = transition;
    this.start = now;
    this.dirtyBuffer = true;
  }

  private ensureResources(): void {
    if (this.pipeline) return;
    this.pipeline = this.device.createPipeline(this.pipelineDescriptor());
    this.uniforms = this.device.createUniforms(this.pipeline.descriptor.uniforms);
    this.quadBuffer = this.device.createBuffer({ usage: 'vertex', data: this.geometry() });
    this.instanceBuffer = this.device.createBuffer({ usage: 'vertex', byteLength: 1024 });
  }

  private upload(): void {
    const stride = this.attributes.floatsPerInstance;
    const bytes = this.live.length * stride * 4;
    if (this.cpu.byteLength < bytes) this.cpu = new ArrayBuffer(Math.ceil(bytes * 1.25));
    const f32 = new Float32Array(this.cpu, 0, this.live.length * stride);
    const u32 = new Uint32Array(this.cpu, 0, this.live.length * stride);
    for (let i = 0; i < this.live.length; i++) {
      const l = this.live[i];
      this.attributes.write(f32, u32, i * stride, l.from, l.to, l.item, l.delay);
    }
    if (bytes > 0) this.instanceBuffer!.write(f32);
    this.dirtyBuffer = false;
  }

  /** Drops exited items once their transition has completed. */
  private settle(now: number): void {
    if (this.isAnimating(now)) return;
    if (this.live.some((l) => l.exiting)) {
      this.live = this.live.filter((l) => !l.exiting);
      this.byKey = new Map(this.live.map((l) => [l.item.key, l]));
      this.dirtyBuffer = true;
    }
  }

  draw(pass: RenderPass, frame: FrameState): void {
    const direct = this.directCount >= 0;
    if (!direct) this.settle(frame.now);
    const instances = direct ? this.directCount : this.live.length;
    if (instances === 0) return;
    if (direct && !this.instanceBuffer) return; // lost device: host must re-fill
    this.ensureResources();
    if (!direct && this.dirtyBuffer) this.upload();
    const u = this.uniforms!;
    const t = this.transition.duration > 0 ? Math.min(1, Math.max(0, (frame.now - this.start) / this.transition.duration)) : 1;
    u.set('hl', frame.highlight);
    u.set('anim', [t, EASING_ID[this.transition.easing], this.transition.stagger, 0]);
    u.set('resolution', [frame.width, frame.height]);
    u.set('dpr', frame.dpr);
    u.set('opacity', this.opacity);
    this.setUniforms(u, frame);
    pass.draw({
      pipeline: this.pipeline!,
      uniforms: u,
      vertexBuffers: { quad: this.quadBuffer!, instance: this.instanceBuffer! },
      vertexCount: this.vertexCount,
      instanceCount: instances,
    });
  }

  /**
   * GPU picking pass: re-draws the same instances into an offscreen target
   * with `anim.w = 1`, which makes pick-aware shaders output encoded ids.
   * Call after `draw` in the same frame.
   */
  drawPick(pass: RenderPass, frame: FrameState): void {
    const instances = this.count;
    if (!instances || !this.pipeline || !this.instanceBuffer || !this.quadBuffer) return;
    if (!this.pickPipeline) {
      const desc = this.pipelineDescriptor();
      this.pickPipeline = this.device.createPipeline({ ...desc, label: `${desc.label ?? 'mark'}-pick`, blend: 'none', offscreen: true });
      this.pickUniforms = this.device.createUniforms(this.pickPipeline.descriptor.uniforms);
    }
    const u = this.pickUniforms!;
    const t = this.transition.duration > 0 ? Math.min(1, Math.max(0, (frame.now - this.start) / this.transition.duration)) : 1;
    u.set('hl', [-1, -1, 1, 0]);
    u.set('anim', [t, EASING_ID[this.transition.easing], this.transition.stagger, 1]);
    u.set('resolution', [frame.width, frame.height]);
    u.set('dpr', frame.dpr);
    u.set('opacity', 1);
    this.setUniforms(u, frame);
    pass.draw({ pipeline: this.pickPipeline, uniforms: u, vertexBuffers: { quad: this.quadBuffer, instance: this.instanceBuffer }, vertexCount: this.vertexCount, instanceCount: instances });
  }

  /** Releases GPU resources. CPU state is kept so the mark can be redrawn on a new device. */
  releaseGpu(): void {
    this.pickPipeline?.destroy();
    this.pickUniforms?.destroy();
    this.pickPipeline = null;
    this.pickUniforms = null;
    if (this.directCount >= 0) this.directCount = 0;
    this.pipeline?.destroy();
    this.uniforms?.destroy();
    this.instanceBuffer?.destroy();
    this.quadBuffer?.destroy();
    this.pipeline = null;
    this.uniforms = null;
    this.instanceBuffer = null;
    this.quadBuffer = null;
    this.dirtyBuffer = true;
  }

  /** Re-targets the mark at a new device after context / device loss. */
  setDevice(device: GpuDevice): void {
    this.releaseGpu();
    this.device = device;
  }

  destroy(): void {
    this.releaseGpu();
    this.live = [];
    this.byKey.clear();
  }
}

/** Packs an [r,g,b,a] 0..1 color as unorm8x4 (little-endian RGBA). */
export function packColor(c: readonly number[]): number {
  const r = Math.round(Math.min(1, Math.max(0, c[0])) * 255);
  const g = Math.round(Math.min(1, Math.max(0, c[1])) * 255);
  const b = Math.round(Math.min(1, Math.max(0, c[2])) * 255);
  const a = Math.round(Math.min(1, Math.max(0, c[3] ?? 1)) * 255);
  return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
}

export const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpColor(a: readonly number[], b: readonly number[], t: number): [number, number, number, number] {
  return [lerpN(a[0], b[0], t), lerpN(a[1], b[1], t), lerpN(a[2], b[2], t), lerpN(a[3] ?? 1, b[3] ?? 1, t)];
}

/** Shared quad + instance buffer layout helpers. */
export const QUAD_LAYOUT = { name: 'quad', stepMode: 'vertex' as const, stride: 8, attributes: [{ name: 'a_quad', location: 0, format: 'float32x2' as const, offset: 0 }] };
