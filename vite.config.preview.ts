// Standalone Vite config to preview the renderer UI in a plain browser tab,
// without spawning Electron. Used only for visual QA during development
// (window.api falls back to the mock implementation — see src/renderer/lib/mockApi.ts).
// Not used by the packaged app.
import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
