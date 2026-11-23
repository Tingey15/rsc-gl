import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { BackendType, GpuBackend } from '@rsc-gl/gpu';
import { webgpuBackend } from '@rsc-gl/gpu/webgpu';
import { webgl2Backend } from '@rsc-gl/gpu/webgl2';
import type { Chart, RenderEngineOptions } from '@rsc-gl/core';

/** Default backends: WebGPU first, WebGL2 fallback. */
export const DEFAULT_BACKENDS: GpuBackend[] = [webgpuBackend, webgl2Backend];

const EngineContext = createContext<RenderEngineOptions>({ backends: DEFAULT_BACKENDS });

export interface ChartsEngineProviderProps {
  /** Backends in preference order. Pass a single backend to bundle only that one. */
  backends?: GpuBackend[];
  /** Force a backend (e.g. for comparisons). */
  prefer?: BackendType;
  antialias?: boolean;
  children?: ReactNode;
}

/** Configures the shared GPU engine used by every chart below it. */
export function ChartsEngineProvider({ backends = DEFAULT_BACKENDS, prefer, antialias, children }: ChartsEngineProviderProps) {
  const value = useMemo(() => ({ backends, prefer, antialias }), [backends, prefer, antialias]);
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export const useEngineOptions = () => useContext(EngineContext);

/** Gives custom children access to the underlying engine chart instance. */
export const ChartInstanceContext = createContext<Chart | null>(null);
export const useChartInstance = () => useContext(ChartInstanceContext);
