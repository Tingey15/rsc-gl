import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';

// Resolve workspace packages to their TypeScript sources (the "@rsc-gl/source" export condition, unique so third-party "source" exports are ignored).
export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['@rsc-gl/source', ...defaultClientConditions] },
  server: { port: 5199 },
  // Chart workers import the engine as ES modules.
  worker: { format: 'es' },
});
