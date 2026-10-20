import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Local-only internal tool: bind to loopback and never expose the port.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
