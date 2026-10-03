/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The single .env lives at the monorepo root; VITE_* keys are picked up from there.
  // It also sets NODE_ENV=development for the API, which Vite would apply to builds and
  // ship React's development code, so the build script sets NODE_ENV=production itself.
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
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
