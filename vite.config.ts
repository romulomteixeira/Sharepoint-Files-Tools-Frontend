import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Em desenvolvimento local, repassa chamadas /api para o backend
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
      '/metrics': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) exige manualChunks como função, não objeto
        manualChunks(id) {
          if (
            id.includes('react') ||
            id.includes('react-dom') ||
            id.includes('react-router-dom')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
});
