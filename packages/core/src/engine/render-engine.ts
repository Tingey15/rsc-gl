import { createDevice, type BackendType, type GpuBackend, type GpuDevice } from '@rsc-gl/gpu';

/** Anything the engine can schedule frames for (2D charts, 3D scenes, custom layers). */
export interface Renderable {
  /** Renders one frame. Returns true when it needs another frame (animation running). */
  renderFrame(now: number): boolean;
  /** Called after device loss with the replacement device. */
  onDeviceChanged(device: GpuDevice): void;
}

export interface RenderEngineOptions {
  backends: GpuBackend[];
  prefer?: BackendType;
  antialias?: boolean;
}

/**
 * One engine (and thus one GPU device) per backend configuration per page.
 * All charts share a single requestAnimationFrame loop; a chart only renders
 * when invalidated or while animating.
 */
export class RenderEngine {
  private static engines = new Map<string, RenderEngine>();

  static get(options: RenderEngineOptions): RenderEngine {
    const key = `${options.backends.map((b) => b.type).join(',')}|${options.prefer ?? ''}|${options.antialias ?? true}`;
    let engine = RenderEngine.engines.get(key);
    if (!engine) {
      engine = new RenderEngine(options);
      RenderEngine.engines.set(key, engine);
    }
    return engine;
  }

  /** All engines created on this page (diagnostics / docs tooling). */
  static all(): RenderEngine[] {
    return [...RenderEngine.engines.values()];
  }

  private devicePromise: Promise<GpuDevice> | null = null;
  private device: GpuDevice | null = null;
  private readonly members = new Set<Renderable>();
  private readonly dirty = new Set<Renderable>();
  private raf = 0;
  /** Frames rendered in the last second (all charts). */
  fps = 0;
  private frameCount = 0;
  private fpsWindow = 0;

  private constructor(private readonly options: RenderEngineOptions) {}

  /** Resolves the shared device, creating it on first use. */
  getDevice(): Promise<GpuDevice> {
    if (this.device && !this.device.lost) return Promise.resolve(this.device);
    if (!this.devicePromise) {
      this.devicePromise = createDevice({
        backends: this.options.backends,
        prefer: this.options.prefer,
        antialias: this.options.antialias,
      }).then((device) => {
        this.device = device;
        device.onLost((reason) => this.handleLoss(reason));
        return device;
      });
      this.devicePromise.catch(() => {
        this.devicePromise = null;
      });
    }
    return this.devicePromise;
  }

  get backend(): BackendType | null {
    return this.device?.type ?? null;
  }

  private handleLoss(reason: string): void {
    console.warn(`[rsc-gl] GPU device lost (${reason}); recreating`);
    this.device = null;
    this.devicePromise = null;
    this.getDevice().then((device) => {
      for (const m of this.members) {
        m.onDeviceChanged(device);
        this.invalidate(m);
      }
    });
  }

  add(member: Renderable): void {
    this.members.add(member);
  }

  remove(member: Renderable): void {
    this.members.delete(member);
    this.dirty.delete(member);
  }

  invalidate(member: Renderable): void {
    if (!this.members.has(member)) return;
    this.dirty.add(member);
    if (!this.raf && typeof requestAnimationFrame !== 'undefined') {
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    this.raf = 0;
    const batch = [...this.dirty];
    this.dirty.clear();
    for (const m of batch) {
      let again = false;
      try {
        again = m.renderFrame(now);
      } catch (e) {
        console.error('[rsc-gl] render error', e);
      }
      if (again) this.dirty.add(m);
    }
    this.frameCount++;
    if (now - this.fpsWindow >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.fpsWindow || 1000));
      this.frameCount = 0;
      this.fpsWindow = now;
    }
    if (this.dirty.size > 0) this.raf = requestAnimationFrame(this.tick);
  };
}
