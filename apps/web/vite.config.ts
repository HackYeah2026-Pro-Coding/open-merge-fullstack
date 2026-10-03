import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The single .env lives at the monorepo root; VITE_* keys are picked up from there.
  envDir: '../../',
  server: {
    port: 5173,
    // Same-origin /api keeps cookies simple: no CORS dance, no absolute API URL.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
