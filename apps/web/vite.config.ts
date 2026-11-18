import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // En desarrollo la web llama a la API por el mismo origen: proxy en lugar de CORS.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
