import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Durante o desenvolvimento "live", as chamadas /api e /.auth são
// encaminhadas para o SWA CLI local (porta 4280). Em modo mock isso é ignorado.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4280',
      '/.auth': 'http://localhost:4280',
    },
  },
});
