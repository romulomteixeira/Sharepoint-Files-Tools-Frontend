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
        // Chunking para melhor cache de assets
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
