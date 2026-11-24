import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';

// Resolve workspace packages to their TypeScript sources (the "@rsc-gl/source" export condition, unique so third-party "source" exports are ignored).
export default defineConfig({
  // GitHub Pages serves the site from a sub-path (DOCS_BASE=/rsc-gl/); local builds use the root.
  base: process.env.DOCS_BASE ?? '/',
  plugins: [react()],
  resolve: { conditions: ['@rsc-gl/source', ...defaultClientConditions] },
  server: { port: 5199 },
  // Chart workers import the engine as ES modules.
  worker: { format: 'es' },
});
