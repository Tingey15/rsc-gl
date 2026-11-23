import type { BackendType, DeviceOptions, GpuBackend, GpuDevice } from './types';

export interface CreateDeviceOptions extends DeviceOptions {
  /**
   * Backends in order of preference. The first supported backend that creates
   * a device successfully wins, e.g. `[webgpuBackend, webgl2Backend]`.
   */
  backends: GpuBackend[];
  /** Force a specific backend type (useful for testing / docs toggles). */
  prefer?: BackendType;
}

export async function createDevice(options: CreateDeviceOptions): Promise<GpuDevice> {
  const ordered = options.prefer
    ? [...options.backends].sort((a, b) => (a.type === options.prefer ? -1 : b.type === options.prefer ? 1 : 0))
    : options.backends;
  const errors: string[] = [];
  for (const backend of ordered) {
    if (!backend.isSupported()) {
      errors.push(`${backend.type}: not supported`);
      continue;
    }
    try {
      return await backend.createDevice(options);
    } catch (e) {
      errors.push(`${backend.type}: ${(e as Error).message}`);
    }
  }
  throw new Error(`[gpu] no usable GPU backend (${errors.join('; ')})`);
}
