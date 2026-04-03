import react from '@vitejs/plugin-react';

export default {
  plugins: [react()],
  root: '.',
  publicDir: false,
  server: {
    port: 4173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
};
